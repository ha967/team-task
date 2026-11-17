import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { ListTeamsQueryDto } from './dto/list-teams-query.dto.js';
import { TeamAccessService } from './team-access.service.js';

// 统一返回这些字段，避免把 createdById（内部字段）、deletedAt（软删标记）透给前端
const TEAM_SELECT = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TeamSelect;

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamAccess: TeamAccessService,
  ) {}

  // 只返回调用者自己所属的团队，没有 userId 参数来自客户端这条路
  async getTeams(query: ListTeamsQueryDto, userId: string) {
    const where: Prisma.TeamWhereInput = {
      deletedAt: null,
      members: { some: { userId } },
      ...(query.teamName
        ? { name: { contains: query.teamName, mode: 'insensitive' } }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.team.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          ...TEAM_SELECT,
          // 只要「我」在这个团队里的角色；where 已限定 members.some.userId，所以必然有一条
          members: { where: { userId }, select: { role: true } },
        },
      }),
      this.prisma.team.count({ where }),
    ]);

    const items = rows.map(({ members, ...team }) => ({
      ...team,
      role: members[0].role,
    }));

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getTeamDetail(teamId: string, userId: string) {
    // 一次查询同时拿到团队与成员，避免「先判存在再取详情」时中间被删导致多一个不可达分支
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, deletedAt: null },
      select: {
        ...TEAM_SELECT,
        members: {
          // 软删的用户不算成员：TeamMember 行是硬删关系，用户软删后行还在
          where: { user: { deletedAt: null } },
          orderBy: { joinedAt: 'asc' },
          select: {
            userId: true,
            role: true,
            joinedAt: true,
            // 成员列表用于认人，不返回 email 等个人信息
            user: { select: { username: true, avatarUrl: true } },
          },
        },
      },
    });

    // 团队不存在或已软删 → 404，与「不是成员」的 403 区分开
    if (!team) {
      throw new NotFoundException('团队不存在');
    }

    // 存在性判定之后才判成员身份，否则不存在的团队会被误报成「你不是该团队成员」
    const membership = await this.teamAccess.assertTeamMember(teamId, userId);

    return {
      ...team,
      role: membership.role,
      members: team.members.map((member) => ({
        userId: member.userId,
        username: member.user.username,
        avatarUrl: member.user.avatarUrl,
        role: member.role,
        joinedAt: member.joinedAt,
      })),
    };
  }

  // 创建团队与「创建者成为 OWNER」必须同一事务，否则第二步失败会留下没人能访问的团队
  async addTeam(userId: string, body: CreateTeamDto) {
    const team = await this.prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: {
          name: body.name,
          description: body.description,
          createdById: userId,
        },
        select: { id: true },
      });

      await tx.teamMember.create({
        data: { teamId: created.id, userId, role: 'OWNER' },
        select: { teamId: true },
      });

      return created;
    });

    return this.getTeamDetail(team.id, userId);
  }
}
