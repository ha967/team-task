import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { TeamsModule } from '../teams/teams.module.js';
import {
  CommentsController,
  TaskCommentsController,
} from './comments.controller.js';
import { CommentsService } from './comments.service.js';

@Module({
  // TasksModule 导出 TasksService（复用「任务算不算存在」），
  // TeamsModule 导出 TeamAccessService（成员 / 角色判定只有那一份）
  imports: [PrismaModule, TasksModule, TeamsModule],
  controllers: [TaskCommentsController, CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
