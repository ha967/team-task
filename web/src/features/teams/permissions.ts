import type { TeamMember, TeamRole } from './types';

// 与后端 team-member-permissions.ts 的矩阵保持一致；后端仍是最终权威，
// 这里只用来决定「渲染按钮 / 禁用控件」，避免用户点了才吃 403 / 409。
export function countOwners(members: TeamMember[]): number {
  return members.filter((member) => member.role === 'OWNER').length;
}

export function isLastOwner(member: TeamMember, ownerCount: number): boolean {
  return member.role === 'OWNER' && ownerCount === 1;
}

export function canInvite(role: TeamRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function canChangeRoles(role: TeamRole): boolean {
  return role === 'OWNER';
}

export function canRemoveMember(
  actorRole: TeamRole,
  actorId: string,
  target: TeamMember,
  ownerCount: number,
): boolean {
  // 自己那一行走「退出团队」，不显示移除
  if (target.userId === actorId) {
    return false;
  }

  if (isLastOwner(target, ownerCount)) {
    return false;
  }

  if (actorRole === 'OWNER') {
    return true;
  }

  return actorRole === 'ADMIN' && target.role === 'MEMBER';
}

export function canLeaveTeam(role: TeamRole, ownerCount: number): boolean {
  return !(role === 'OWNER' && ownerCount === 1);
}
