import type { TeamRole } from './types';

export const ROLE_LABELS: Record<TeamRole, string> = {
  OWNER: '所有者',
  ADMIN: '管理员',
  MEMBER: '成员',
};

export const ROLE_OPTIONS: TeamRole[] = ['OWNER', 'ADMIN', 'MEMBER'];

// 角色标签配色：所有者用主色，管理员用琥珀，成员用中性色
export const ROLE_TONES: Record<TeamRole, string> = {
  OWNER: 'bg-indigo-mist text-indigo',
  ADMIN: 'bg-amber/10 text-amber',
  MEMBER: 'bg-panel-2 text-softink',
};
