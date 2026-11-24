export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface TaskUserRef {
  id: string;
  username: string;
}

export interface Task {
  id: string;
  teamId: string;
  title: string;
  description: string | null;
  estimateHours: number | null;
  status: TaskStatus;
  priority: number;
  assigneeId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: TaskUserRef | null;
}

// 详情比列表多带创建人与所属团队（后端 TASK_DETAIL_SELECT）
export interface TaskDetail extends Task {
  createdBy: TaskUserRef;
  team: { id: string; name: string };
}

export interface TaskListResponse {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 创建 / 更新共用的入参。
 *
 * 可清空的字段用 `| null`：后端 DTO 的 `@IsOptional()` 会跳过 null，
 * service 把它直接透给 Prisma，于是 null 表示「清空」，undefined 表示「不改」。
 */
export interface TaskWritePayload {
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: number;
  estimateHours?: number | null;
  assigneeId?: string | null;
  dueAt?: string | null;
}

export interface CreateTaskPayload extends TaskWritePayload {
  teamId: string;
}

// 更新不允许带 teamId —— 后端对「移动到其他团队」直接 403。
// 各字段都可选（后端 UpdateTaskDto 是 PartialType(CreateTaskDto)），表单目前发全量，但类型别写成必填。
export type UpdateTaskPayload = Partial<TaskWritePayload>;
