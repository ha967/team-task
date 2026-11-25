import type { TeamRole } from '../generated/prisma/enums.js';

/**
 * 评论的权限判定。
 *
 * 抽成纯函数是为了能单测：这些分支以前只能靠 e2e 真起 Nest + 连库才覆盖到，
 * 而「谁能改谁的评论」正是最不该漏的一类规则。
 */

// 编辑限作者本人：评论是个人表达，管理员代改等于篡改发言记录
export function canEditComment(userId: string, authorId: string): boolean {
  return userId === authorId;
}

// 删除限作者本人，或团队 OWNER / ADMIN：清理不当内容属于管理动作
export function canDeleteComment(
  userId: string,
  authorId: string,
  role: TeamRole,
): boolean {
  return userId === authorId || role !== 'MEMBER';
}
