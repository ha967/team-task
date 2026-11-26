import { apiFetch } from '../../shared/api/http';
import type {
  Comment,
  CreateCommentPayload,
  UpdateCommentPayload,
} from './types';

// 集合操作挂在任务下、单条走扁平路由，路径与后端 comments.controller.ts 一一对应。
// 不写 /api 前缀：由 shared/api/http.ts 的 API_BASE_URL 统一拼接。
export const commentsApi = {
  list(taskId: string) {
    return apiFetch<Comment[]>(`/tasks/${taskId}/comments`);
  },

  create(taskId: string, payload: CreateCommentPayload) {
    return apiFetch<Comment>(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: payload,
    });
  },

  update(commentId: string, payload: UpdateCommentPayload) {
    return apiFetch<Comment>(`/comments/${commentId}`, {
      method: 'PATCH',
      body: payload,
    });
  },

  remove(commentId: string) {
    return apiFetch<{ id: string; deleted: boolean }>(
      `/comments/${commentId}`,
      { method: 'DELETE' },
    );
  },
};
