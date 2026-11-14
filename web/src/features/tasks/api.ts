import { apiFetch } from '../../shared/api/http';
import type { TaskListResponse } from './types';

export const tasksApi = {
  list() {
    return apiFetch<TaskListResponse>('/tasks');
  },
};
