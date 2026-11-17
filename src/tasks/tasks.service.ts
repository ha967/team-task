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

// 列表和详情统一返回这些字段，避免把内部字段（如 createdById）透给前端
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
