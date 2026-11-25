import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TeamsModule } from '../teams/teams.module.js';

@Module({
  controllers: [TasksController],
  // providers注入的服务默认只能在当前模块使用，如果想在其他模块使用，需要在exports中导出
  providers: [TasksService],
  // 评论模块复用 TasksService.assertTaskAlive，避免在评论里再写一份「任务算不算存在」
  exports: [TasksService],
  // 这里导入了PrismaModule，就可以使用PrismaModule中exports导出的PrismaService了
  // TeamsModule 导出 TeamAccessService，团队权限判定只有那一份实现
  imports: [PrismaModule, TeamsModule],
})
export class TasksModule {}
