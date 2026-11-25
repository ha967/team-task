import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { UpdateCommentDto } from './dto/update-comment.dto.js';

// 集合操作挂在任务下：taskId 来自路径，请求体无法把评论写到别的任务里
@Controller('tasks/:taskId/comments')
export class TaskCommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  getComments(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.commentsService.getComments(taskId, userId);
  }

  @Post()
  addComment(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser('sub') userId: string,
    @Body() body: CreateCommentDto,
  ) {
    return this.commentsService.addComment(taskId, userId, body);
  }
}

// 单条操作走扁平路由：从评论反查所属任务 / 团队做权限判定，不需要客户端再传 taskId
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Patch(':commentId')
  updateComment(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser('sub') userId: string,
    @Body() body: UpdateCommentDto,
  ) {
    return this.commentsService.updateComment(commentId, userId, body);
  }

  @Delete(':commentId')
  deleteComment(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.commentsService.deleteComment(commentId, userId);
  }
}
