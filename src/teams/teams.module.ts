import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UserModule } from '../user/user.module.js';
import { TeamAccessService } from './team-access.service.js';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';

@Module({
  // UserModule 导出 UserService：邀请按邮箱找人时复用其归一化与未软删过滤
  imports: [PrismaModule, UserModule],
  controllers: [TeamsController],
  providers: [TeamsService, TeamAccessService],
  // 导出给 TasksModule 用：权限判定只有这一份实现
  exports: [TeamAccessService],
})
export class TeamsModule {}
