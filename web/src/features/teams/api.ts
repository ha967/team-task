import { apiFetch } from '../../shared/api/http';
import type {
  CreateTeamPayload,
  InviteTeamMemberPayload,
  RemoveTeamMemberResponse,
  Team,
  TeamDetail,
  TeamListResponse,
  TeamMember,
  UpdateTeamMemberRolePayload,
} from './types';

export const teamsApi = {
  // 只返回调用者自己所属的团队，没有传 userId 这条路。
  // 列表页做客户端搜索，所以不接后端 teamName；团队页统一用 listAll。
  list(params: { page?: number; pageSize?: number } = {}) {
    const search = new URLSearchParams();

    if (params.page !== undefined) {
      search.set('page', String(params.page));
    }

    if (params.pageSize !== undefined) {
      search.set('pageSize', String(params.pageSize));
    }

    const query = search.toString();

    return apiFetch<TeamListResponse>(
      `/teams${query === '' ? '' : `?${query}`}`,
    );
  },

  // 团队列表和新建任务页的团队下拉都基于完整团队集，逐页取完（后端 pageSize 上限 100）。
  // 只取第一页会让「超过 20 个团队」时下拉 / 搜索静默缺项。
  async listAll() {
    const pageSize = 100;
    const items: Team[] = [];
    let total = 0;
    let page = 1;

    for (;;) {
      const result = await this.list({ page, pageSize });
      items.push(...result.items);
      total = result.total;

      if (result.items.length === 0 || items.length >= total) {
        break;
      }

      page += 1;
    }

    return { items, total };
  },

  detail(teamId: string) {
    return apiFetch<TeamDetail>(`/teams/${teamId}`);
  },

  // 创建返回团队详情（含成员与当前用户角色），与详情接口同一形状
  create(payload: CreateTeamPayload) {
    return apiFetch<TeamDetail>('/teams', {
      method: 'POST',
      body: payload,
    });
  },

  invite(teamId: string, payload: InviteTeamMemberPayload) {
    return apiFetch<TeamMember>(`/teams/${teamId}/members`, {
      method: 'POST',
      body: payload,
    });
  },

  updateMemberRole(
    teamId: string,
    userId: string,
    payload: UpdateTeamMemberRolePayload,
  ) {
    return apiFetch<TeamMember>(`/teams/${teamId}/members/${userId}`, {
      method: 'PATCH',
      body: payload,
    });
  },

  // userId 传当前用户即「退出团队」，后端用同一个端点
  removeMember(teamId: string, userId: string) {
    return apiFetch<RemoveTeamMemberResponse>(
      `/teams/${teamId}/members/${userId}`,
      { method: 'DELETE' },
    );
  },
};
