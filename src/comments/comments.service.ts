import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { TeamAccessService } from '../teams/team-access.service.js';
import { canDeleteComment, canEditComment } from './comment-permissions.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { UpdateCommentDto } from './dto/update-comment.dto.js';

// 评论视图白名单：不透 deletedAt 等内部字段；author 只给认人需要的 id / username。
// 列表、创建、编辑三条路径共用，改这里等于同时改三个接口的返回体。
const COMMENT_SELECT = {
  id: true,
  taskId: true,
  authorId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, username: true } },
} satisfies Prisma.CommentSelect;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prismaService: PrismaService,
    // 「任务算不算存在」复用 TasksService，不在评论模块里复制 TASK_ALIVE_FILTER
    private readonly tasksService: TasksService,
    // 成员判定同样只有 TeamAccessService 那一份实现
    private readonly teamAccess: TeamAccessService,
  ) {}

  async getComments(taskId: string, userId: string) {
    const task = await this.tasksService.assertTaskAlive(taskId);

    // 团队任意成员都能读：列表接口本来就把团队任务全量给到成员，
    // 评论再按「作者 / 负责人」收窄会造出「看得见任务、看不见讨论」的分裂
    await this.teamAccess.assertTeamMember(task.teamId, userId);

    return this.prismaService.comment.findMany({
      where: { taskId, deletedAt: null },
      // createdAt 相同（同一毫秒）时用 id 兜底，保证两次请求的顺序稳定
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: COMMENT_SELECT,
    });
  }

  async addComment(taskId: string, userId: string, body: CreateCommentDto) {
    const task = await this.tasksService.assertTaskAlive(taskId);
    await this.teamAccess.assertTeamMember(task.teamId, userId);

    return this.prismaService.comment.create({
      data: {
        taskId,
        // 作者只能来自登录态：DTO 没有 authorId 字段，带了这个键会被
        // 全局 forbidNonWhitelisted 直接 400
        authorId: userId,
        content: body.content,
      },
      select: COMMENT_SELECT,
    });
  }

  async updateComment(
    commentId: string,
    userId: string,
    body: UpdateCommentDto,
  ) {
    const { comment, task } = await this.getCommentOrThrow(commentId);
    await this.teamAccess.assertTeamMember(task.teamId, userId);

    if (!canEditComment(userId, comment.authorId)) {
      throw new ForbiddenException('无权编辑该评论');
    }

    return this.prismaService.comment.update({
      where: { id: commentId },
      data: { content: body.content },
      select: COMMENT_SELECT,
    });
  }

  async deleteComment(commentId: string, userId: string) {
    const { comment, task } = await this.getCommentOrThrow(commentId);
    const membership = await this.teamAccess.assertTeamMember(
      task.teamId,
      userId,
    );

    if (!canDeleteComment(userId, comment.authorId, membership.role)) {
      throw new ForbiddenException('无权删除该评论');
    }

    // 软删：评论是团队历史资产，保留行；所有读路径统一按 deletedAt: null 过滤
    await this.prismaService.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    return { id: commentId, deleted: true };
  }

  /**
   * 单条评论的存在性判定。
   *
   * 顺序固定为：评论不存在 / 已软删 → 404；评论所属任务（或团队）已软删 → 404。
   * 把 404 全部判完再做成员与角色判定，避免把「不存在」误报成「无权操作」。
   */
  private async getCommentOrThrow(commentId: string) {
    const comment = await this.prismaService.comment.findFirst({
      where: { id: commentId, deletedAt: null },
      select: { id: true, authorId: true, taskId: true },
    });

    if (!comment) {
      throw new NotFoundException('评论不存在');
    }

    const task = await this.tasksService.assertTaskAlive(comment.taskId);

    return { comment, task };
  }
}
