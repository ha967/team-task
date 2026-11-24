import type { TaskStatus } from './types';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: '待办',
  IN_PROGRESS: '进行中',
  DONE: '已完成',
};

export const STATUS_OPTIONS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

// 取值域 0–3（0 最低 / 3 最高），默认 2；与后端 CreateTaskDto 的 @Min/@Max 一致。
// 索引类型写成 string | undefined，调用处的 `?? task.priority` 才不是死分支（后端真的回了域外值时兜底才有意义）
export const PRIORITY_LABELS: Record<number, string | undefined> = {
  0: '最低',
  1: '低',
  2: '普通',
  3: '高',
};

export const PRIORITY_OPTIONS = [0, 1, 2, 3];

export function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('zh-CN');
}

// <input type="datetime-local"> 需要本地时区的 yyyy-MM-ddTHH:mm，直接用 ISO 串会差 8 小时
export function toDateTimeLocal(value: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}
