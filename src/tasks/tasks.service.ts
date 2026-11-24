import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TeamAccessService } from '../teams/team-access.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';

// 列表 / 创建 / 更新 / 删除共用的字段白名单，避免把内部字段（如 createdById）透给前端。
// 详情不用它 —— 详情另走下面的 TASK_DETAIL_SELECT（多带 createdBy / team），
// 往这里加字段等于同时改那四个接口的返回体。
const TASK_SELECT = {
  id: true,
  teamId: true,
  title: true,
  description: true,
  estimateHours: true,
  status: true,
  priority: true,
  assigneeId: true,
  dueAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, username: true } },
} satisfies Prisma.TaskSelect;

// 详情比列表多带「谁创建的」和「属于哪个团队」，供任务详情页直接展示。
// 注意不能直接往 TASK_SELECT 上加：它被列表 / 创建 / 更新 / 删除四处共用，
// 改它会静默改变那四个接口的返回体（test/tasks.e2e-spec.ts 有键集合断言兜着）。
const TASK_DETAIL_SELECT = {
  ...TASK_SELECT,
  // createdById 是内部字段，只透用户名；与 assignee 一致，不过滤 createdBy.deletedAt
  //（用户软删后创建者仍显示用户名，取舍见 docs/specs/task-detail.md）
  createdBy: { select: { id: true, username: true } },
  team: { select: { id: true, name: true } },
} satisfies Prisma.TaskSelect;

@Injectable()
export class TasksService {
  constructor(
    private readonly prismaService: PrismaService,
    // 团队权限判定统一走 TeamAccessService，不在本服务里另留一份副本
    private readonly teamAccess: TeamAccessService,
  ) {}

  async addTask(userId: string, body: CreateTaskDto) {
    // 检查团队是否存在
    await this.teamAccess.assertTeamExists(body.teamId);
    // 检查用户是否是团队成员
    await this.teamAccess.assertTeamMember(body.teamId, userId);

    if (body.assigneeId) {
      // 校验负责人也是团队成员 →
      await this.teamAccess.assertTeamMember(body.teamId, body.assigneeId);
    }

    return this.prismaService.task.create({
      data: {
        teamId: body.teamId,
        title: body.title,
        description: body.description,
        estimateHours: body.estimateHours,
        status: body.status ?? 'TODO',
        priority: body.priority ?? 2,
        assigneeId: body.assigneeId,
        createdById: userId,
        dueAt: body.dueAt,
        completedAt: body.status === 'DONE' ? new Date() : null,
      },
      select: TASK_SELECT,
    });
  }

  /**
   *
   * 权限规则：
   * 角色	能改什么
   * OWNER / ADMIN	团队内任意任务
   * MEMBER	自己创建的、或分配给自己的任务
   * 非团队成员	403
   *  */
  async updateTask(userId: string, taskId: string, body: UpdateTaskDto) {
    // 先检查任务是否存在，顺便拿到 teamId、createdById、assigneeId
    const task = await this.getTaskOrThrow(taskId);
    const membership = await this.teamAccess.assertTeamMember(
      task.teamId,
      userId,
    );

    const canModify =
      task.createdById === userId ||
      task.assigneeId === userId ||
      membership.role !== 'MEMBER';

    if (!canModify) {
      throw new ForbiddenException('无权修改该任务');
    }

    if (body.teamId && body.teamId !== task.teamId) {
      throw new ForbiddenException('不支持把任务移动到其他团队');
    }

    if (body.assigneeId) {
      await this.teamAccess.assertTeamMember(task.teamId, body.assigneeId);
    }

    return this.prismaService.task.update({
      where: { id: taskId },
      data: {
        title: body.title,
        description: body.description,
        estimateHours: body.estimateHours,
        status: body.status,
        priority: body.priority,
        assigneeId: body.assigneeId,
        dueAt: body.dueAt,
        ...(body.status === undefined
          ? {}
          : {
              completedAt:
                body.status === 'DONE'
                  ? task.status === 'DONE'
                    ? task.completedAt
                    : new Date()
                  : null,
            }),
      },
      select: TASK_SELECT,
    });
  }

  async deleteTask(userId: string, taskId: string) {
    const task = await this.getTaskOrThrow(taskId);
    const membership = await this.teamAccess.assertTeamMember(
      task.teamId,
      userId,
    );

    const canDelete =
      task.createdById === userId || membership.role !== 'MEMBER';

    if (!canDelete) {
      throw new ForbiddenException('无权删除该任务');
    }

    // 软删除：保留历史和评论，查询时统一用 deletedAt: null 过滤
    await this.prismaService.task.update({
      where: { id: taskId },
      data: { deletedAt: new Date() },
    });

    return { id: taskId, deleted: true };
  }

  async getTasks(query: ListTasksQueryDto, userId: string) {
    const where = {
      deletedAt: null,
      team: {
        deletedAt: null,
        members: { some: { userId } },
      },
      ...(query.status ? { status: query.status } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
    };

    const [items, total] = await this.prismaService.$transaction([
      this.prismaService.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: TASK_SELECT,
      }),
      this.prismaService.task.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * 单任务详情。该任务所属团队的任意成员都能读，与列表语义一致
   * （列表本来就把团队全部任务给到每个成员，详情更严会造出「列表里有、点进去 403」）。
   */
  async getTaskDetail(taskId: string, userId: string) {
    // 一次查询同时拿到任务、创建人、团队；软删任务、以及软删团队下的任务都视为不存在，
    // 与列表的 team: { deletedAt: null } 过滤对齐，否则会出现「列表里查不到、知道 id 却能打开」的幽灵任务
    const task = await this.prismaService.task.findFirst({
      where: { id: taskId, deletedAt: null, team: { deletedAt: null } },
      select: TASK_DETAIL_SELECT,
    });

    // 先判存在性再判成员身份：反过来会把「任务不存在」误报成「你不是该团队成员」
    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    await this.teamAccess.assertTeamMember(task.teamId, userId);

    return task;
  }

  private async getTaskOrThrow(taskId: string) {
    const task = await this.prismaService.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        teamId: true,
        status: true,
        createdById: true,
        assigneeId: true,
        completedAt: true,
      },
    });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    return task;
  }
}
