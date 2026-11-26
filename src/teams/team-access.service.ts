import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TeamRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface TeamMembership {
  role: TeamRole;
}

/**
 * 团队权限判定的唯一实现。
 *
 * tasks 和 teams 都注入它 —— 权限规则只能有一份，否则两处会随时间分叉，
 * 而「同一个操作在 A 接口允许、B 接口拒绝」是最难排查的一类 bug。
 */
@Injectable()
export class TeamAccessService {
  constructor(private readonly prisma: PrismaService) {}

  // 团队不存在或已被软删 → 404
  async assertTeamExists(teamId: string): Promise<{ id: string }> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, deletedAt: null },
      select: { id: true },
    });

    if (!team) {
      throw new NotFoundException('团队不存在');
    }

    return team;
  }

  // 调用者必须是「活跃」团队成员 → 否则 403；返回 role 供调用方做进一步判断。
  // team_members 现在允许保留离开的历史行（leftAt 非空），所以不能只看 (teamId, userId)：
  // 漏掉 leftAt: null 就等于退出的人仍然拥有该团队的全部读写权限。
  async assertTeamMember(
    teamId: string,
    userId: string,
  ): Promise<TeamMembership> {
    const membership = await this.prisma.teamMember.findFirst({
      where: { teamId, userId, leftAt: null },
      select: { role: true },
    });

    if (!membership) {
      throw new ForbiddenException('你不是该团队成员');
    }

    return membership;
  }
}
