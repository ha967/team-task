import { apiFetch } from '../../shared/api/http';
import type {
  CreateTaskPayload,
  Task,
  TaskDetail,
  TaskListResponse,
  TaskStatus,
  UpdateTaskPayload,
} from './types';

export const tasksApi = {
  // 后端支持 status / assigneeId / page / pageSize
  list(params: { page?: number; pageSize?: number; status?: TaskStatus } = {}) {
    const search = new URLSearchParams();

    if (params.page !== undefined) {
      search.set('page', String(params.page));
    }

    if (params.pageSize !== undefined) {
      search.set('pageSize', String(params.pageSize));
    }

    if (params.status !== undefined) {
      search.set('status', params.status);
    }

    const query = search.toString();

    return apiFetch<TaskListResponse>(
      `/tasks${query === '' ? '' : `?${query}`}`,
    );
  },

  // 概览页的 KPI / 图表 / 本地筛选都基于完整任务集，逐页取完（后端 pageSize 上限 100）。
  // 只取第一页会让「任务总数」用后端 total、状态计数却只统计前 100 条，口径分裂。
  async listAll() {
    const pageSize = 100;
    const items: Task[] = [];
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
