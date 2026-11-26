import type { TeamRole } from '../generated/prisma/enums.js';

/**
 * 成员操作的判定结果。
 *
 * FORBIDDEN 是「你没这个权限」→ 403；
 * LAST_OWNER 是「操作本身会让团队没有 OWNER」→ 409（业务状态冲突，不是权限问题）。
 */
export type MemberAction = 'ALLOW' | 'FORBIDDEN' | 'LAST_OWNER';

// 邀请：OWNER / ADMIN 可以；MEMBER 不行。
// 「入队角色固定 MEMBER」是 service 的契约，不在这个纯函数里表达。
export function canInvite(actorRole: TeamRole): boolean {
  return actorRole === 'OWNER' || actorRole === 'ADMIN';
}

export function evaluateInvite(actorRole: TeamRole): MemberAction {
  return canInvite(actorRole) ? 'ALLOW' : 'FORBIDDEN';
}

// 只有 OWNER 能改角色；ADMIN 也不行（否则两个 ADMIN 可以互相提权）。
// 拆出来是因为 service 要在「查目标成员」之前先做一次粗判，保证 403 优先于 404。
export function canChangeRole(actorRole: TeamRole): boolean {
  return actorRole === 'OWNER';
}

/**
 * 改角色。
 *
 * - 允许把成员提升为 OWNER（团队允许多个 OWNER）。
 * - 不能把最后一个活跃 OWNER 降级；改成 OWNER（幂等 / 提升）则不受限制。
 */
export function evaluateChangeRole(
  actorRole: TeamRole,
  targetRole: TeamRole,
  nextRole: TeamRole,
  ownerCount: number,
): MemberAction {
  if (!canChangeRole(actorRole)) {
    return 'FORBIDDEN';
  }

  if (targetRole === 'OWNER' && nextRole !== 'OWNER' && ownerCount === 1) {
    return 'LAST_OWNER';
  }

  return 'ALLOW';
}

/**
 * 移除他人：OWNER 可以移除任何非最后 OWNER；ADMIN 只能移除 MEMBER。
 *
 * `targetRole` 在主流程里要查到目标成员后才知道，所以 service 在查目标之前
 * 先用下面的 canRemoveOthersAtAll 做一次粗判，保证 MEMBER 的 403 优先于 404。
 */
export function canRemoveOthers(
  actorRole: TeamRole,
  targetRole: TeamRole,
): boolean {
  return (
    actorRole === 'OWNER' || (actorRole === 'ADMIN' && targetRole === 'MEMBER')
  );
}

// 粗判：这个角色有没有可能移除他人。ADMIN 还要看目标角色，所以这里放行。
export function canRemoveOthersAtAll(actorRole: TeamRole): boolean {
  return actorRole === 'OWNER' || actorRole === 'ADMIN';
}

/**
 * 移除 / 退出。
 *
 * - 自己退：任何角色都可以，唯独不能让团队失去最后一个 OWNER。
 * - 移除他人：OWNER 可以移除任何非最后 OWNER；ADMIN 只能移除 MEMBER；
 *   MEMBER 不能移除他人（只能退自己）。
 */
export function evaluateRemoveMember(
  actorRole: TeamRole,
  actorId: string,
  targetId: string,
  targetRole: TeamRole,
  ownerCount: number,
): MemberAction {
  const isSelf = actorId === targetId;

  if (!isSelf && !canRemoveOthers(actorRole, targetRole)) {
    return 'FORBIDDEN';
  }

  if (targetRole === 'OWNER' && ownerCount === 1) {
    return 'LAST_OWNER';
  }

  return 'ALLOW';
}
