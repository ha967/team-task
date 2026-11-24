import { apiFetch } from '../../shared/api/http';
import type { TeamDetail, TeamListResponse } from './types';

export const teamsApi = {
  // 只返回调用者自己所属的团队，没有传 userId 这条路
  list() {
    return apiFetch<TeamListResponse>('/teams');
  },

  detail(teamId: string) {
    return apiFetch<TeamDetail>(`/teams/${teamId}`);
  },
};
