import { apiFetch } from '../../shared/api/http';
import type {
  CreateTaskPayload,
  Task,
  TaskDetail,
  TaskListResponse,
  UpdateTaskPayload,
} from './types';

export const tasksApi = {
  // 后端已支持 status / assigneeId / page / pageSize，本轮界面上只用到默认分页
  list() {
    return apiFetch<TaskListResponse>('/tasks');
  },

  detail(taskId: string) {
    return apiFetch<TaskDetail>(`/tasks/${taskId}`);
  },

  // 创建 / 更新返回的是列表视图（TASK_SELECT），没有 createdBy / team —— 类型别写成 TaskDetail
  create(payload: CreateTaskPayload) {
    return apiFetch<Task>('/tasks', {
      method: 'POST',
      body: payload,
    });
  },

  update(taskId: string, payload: UpdateTaskPayload) {
    return apiFetch<Task>(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: payload,
    });
  },

  // 软删除：后端保留历史与评论，只置 deletedAt
  remove(taskId: string) {
    return apiFetch<{ id: string; deleted: boolean }>(`/tasks/${taskId}`, {
      method: 'DELETE',
    });
  },
};
