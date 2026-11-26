import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { TeamRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserService } from '../user/user.service.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto.js';
import { ListTeamsQueryDto } from './dto/list-teams-query.dto.js';
import { UpdateTeamMemberRoleDto } from './dto/update-team-member-role.dto.js';
import { TeamAccessService } from './team-access.service.js';
import {
  canChangeRole,
  canRemoveOthersAtAll,
  evaluateChangeRole,
  evaluateInvite,
  evaluateRemoveMember,
} from './team-member-permissions.js';

// 统一返回这些字段，避免把 createdById（内部字段）、deletedAt（软删标记）透给前端
const TEAM_SELECT = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TeamSelect;

// 成员视图白名单：详情 / 邀请 / 改角色三条路径共用，改这里等于同时改三个接口的返回体。
// 不返回 leftAt：接口只展示活跃成员，离开时间属于内部历史。
const MEMBER_SELECT = {
  userId: true,
  role: true,
  joinedAt: true,
  user: { select: { username: true, avatarUrl: true } },
} satisfies Prisma.TeamMemberSelect;

interface MemberRow {
  userId: string;
  role: TeamRole;
  joinedAt: Date;
  user: {
    username: string;
    avatarUrl: string | null;
  };
}

function toMemberView(member: MemberRow) {
  return {
    userId: member.userId,
    username: member.user.username,
    avatarUrl: member.user.avatarUrl,
    role: member.role,
    joinedAt: member.joinedAt,
  };
}

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamAccess: TeamAccessService,
    // 邀请按邮箱找人，复用 UserService 的归一化与「未软删」过滤，不在 teams 里复制一份
    private readonly userService: UserService,
  ) {}

  // 只返回调用者自己所属的团队，没有 userId 参数来自客户端这条路
  async getTeams(query: ListTeamsQueryDto, userId: string) {
    const where: Prisma.TeamWhereInput = {
      deletedAt: null,
      // leftAt: null = 还在团队里；退出的历史行不能让团队重新出现在列表里
      members: { some: { userId, leftAt: null } },
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
          // 只要「我」在这个团队里的活跃角色；where 已限定 members.some，
          // 再带 leftAt: null 是为了排除「退出后又加入」留下的旧历史行
          members: {
            where: { userId, leftAt: null },
            select: { role: true },
          },
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
          // 只展示活跃成员；用户软删后行还在，所以仍要过滤 user.deletedAt
          where: { leftAt: null, user: { deletedAt: null } },
          orderBy: { joinedAt: 'asc' },
          select: MEMBER_SELECT,
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
      members: team.members.map(toMemberView),
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

  // 邀请：按邮箱把已注册且未软删的用户直接加为 MEMBER。
  // 纯权限判定在 team-member-permissions.ts，这里只负责查数据、映射异常。
  async inviteMember(
    teamId: string,
    actorId: string,
    body: InviteTeamMemberDto,
  ) {
    await this.teamAccess.assertTeamExists(teamId);
    const actor = await this.teamAccess.assertTeamMember(teamId, actorId);

    if (evaluateInvite(actor.role) !== 'ALLOW') {
      throw new ForbiddenException('无权邀请成员');
    }

    const user = await this.userService.findByEmail(body.email);

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const existing = await this.prisma.teamMember.findFirst({
      where: { teamId, userId: user.id, leftAt: null },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('该用户已是团队成员');
    }

    try {
      const member = await this.prisma.teamMember.create({
        data: { teamId, userId: user.id, role: 'MEMBER' },
        select: MEMBER_SELECT,
      });

      return toMemberView(member);
    } catch (error) {
      // 并发邀请同一人时，部分唯一索引（WHERE left_at IS NULL）会抛 P2002；
      // 映射成与先后顺序无关的 409，而不是 500。
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('该用户已是团队成员');
      }

      throw error;
    }
  }

  // 改角色：仅 OWNER（ADMIN 也不行），允许多个 OWNER，但不能把最后一个 OWNER 降级。
  async updateMemberRole(
    teamId: string,
    actorId: string,
    targetUserId: string,
    body: UpdateTeamMemberRoleDto,
  ) {
    await this.teamAccess.assertTeamExists(teamId);
    const actor = await this.teamAccess.assertTeamMember(teamId, actorId);

    // 先做角色粗判，保证「没权限」的 403 优先于「目标不存在」的 404
    if (!canChangeRole(actor.role)) {
      throw new ForbiddenException('无权修改成员角色');
    }

    const target = await this.findActiveMemberOrThrow(teamId, targetUserId);

    // 只有降级 OWNER 时才需要数活跃 OWNER；其他组合传 0 不会命中 LAST_OWNER 分支
    const ownerCount =
      target.role === 'OWNER' && body.role !== 'OWNER'
        ? await this.countActiveOwners(teamId)
        : 0;

    const decision = evaluateChangeRole(
      actor.role,
      target.role,
      body.role,
      ownerCount,
    );

    if (decision === 'FORBIDDEN') {
      throw new ForbiddenException('无权修改成员角色');
    }

    if (decision === 'LAST_OWNER') {
      throw new ConflictException('不能降级团队最后一个 OWNER');
    }

    const updated = await this.prisma.teamMember.update({
      where: { id: target.id },
      data: { role: body.role },
      select: MEMBER_SELECT,
    });

    return toMemberView(updated);
  }

  // 移除他人 / 退出自己共用同一个入口：targetUserId === actorId 即退出。
  // 只写 leftAt，不删行；历史成员关系与任务负责人都不动。
  async removeMember(teamId: string, actorId: string, targetUserId: string) {
    await this.teamAccess.assertTeamExists(teamId);
    const actor = await this.teamAccess.assertTeamMember(teamId, actorId);

    // 先做粗判：MEMBER 移除他人一律 403，保证它优先于「目标不存在」的 404。
    // ADMIN 能否移除还要看目标角色（只能移除 MEMBER），交给查完目标后的 evaluateRemoveMember。
    if (targetUserId !== actorId && !canRemoveOthersAtAll(actor.role)) {
      throw new ForbiddenException('无权移除该成员');
    }

    const target = await this.findActiveMemberOrThrow(teamId, targetUserId);

    const ownerCount =
      target.role === 'OWNER' ? await this.countActiveOwners(teamId) : 0;

    const decision = evaluateRemoveMember(
      actor.role,
      actorId,
      targetUserId,
      target.role,
      ownerCount,
    );

    if (decision === 'FORBIDDEN') {
      throw new ForbiddenException('无权移除该成员');
    }

    if (decision === 'LAST_OWNER') {
      throw new ConflictException('不能移除团队最后一个 OWNER');
    }

    await this.prisma.teamMember.update({
      where: { id: target.id },
      data: { leftAt: new Date() },
      select: { id: true },
    });

    return { userId: targetUserId, left: true };
  }

  private async findActiveMemberOrThrow(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findFirst({
      where: { teamId, userId, leftAt: null },
      select: { id: true, role: true },
    });

    if (!member) {
      throw new NotFoundException('成员不存在');
    }

    return member;
  }

  private countActiveOwners(teamId: string) {
    return this.prisma.teamMember.count({
      where: { teamId, role: 'OWNER', leftAt: null },
    });
  }
}
