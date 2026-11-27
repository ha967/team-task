export type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface Team {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  // 当前登录用户在该团队里的角色，由后端按调用者算出
  role: TeamRole;
}

export interface TeamMember {
  userId: string;
  username: string;
  avatarUrl: string | null;
  role: TeamRole;
  joinedAt: string;
}

// 详情比列表多一段成员列表，字段形状对齐后端 getTeamDetail
export interface TeamDetail extends Team {
  members: TeamMember[];
}

export interface TeamListResponse {
  items: Team[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateTeamPayload {
  name: string;
  description?: string | null;
}

export interface InviteTeamMemberPayload {
  email: string;
}

export interface UpdateTeamMemberRolePayload {
  role: TeamRole;
}

export interface RemoveTeamMemberResponse {
  userId: string;
  left: boolean;
}
