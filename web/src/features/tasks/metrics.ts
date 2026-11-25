import type { Task, TaskStatus } from './types';

export interface TaskSummary {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  highPriority: number;
  completionRate: number;
}

export function summarizeTasks(
  tasks: Task[],
  total = tasks.length,
): TaskSummary {
  let todo = 0;
  let inProgress = 0;
  let done = 0;
  let highPriority = 0;

  for (const task of tasks) {
    if (task.status === 'TODO') {
      todo += 1;
    } else if (task.status === 'IN_PROGRESS') {
      inProgress += 1;
    } else if (task.status === 'DONE') {
      done += 1;
    }

    if (task.priority === 3) {
      highPriority += 1;
    }
  }

  return {
    total,
    todo,
    inProgress,
    done,
    highPriority,
    completionRate:
      tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  };
}

export interface ActivityPoint {
  label: string;
  value: number;
}

// 最近 N 天每天新建的任务数；图表的 30 个点永远完整，缺的日子补 0
export function buildActivitySeries(
  tasks: Task[],
  days = 30,
  now = new Date(),
): ActivityPoint[] {
  const buckets: Array<{ key: string; label: string; value: number }> = [];
  const byKey = new Map<string, number>();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - offset);

    const key = dayKey(day);
    const label = `${pad(day.getMonth() + 1)}/${pad(day.getDate())}`;

    buckets.push({ key, label, value: 0 });
    byKey.set(key, 0);
  }

  for (const task of tasks) {
    const key = dayKey(new Date(task.createdAt));

    if (byKey.has(key)) {
      byKey.set(key, (byKey.get(key) ?? 0) + 1);
    }
  }

  return buckets.map(({ key, label }) => ({
    label,
    value: byKey.get(key) ?? 0,
  }));
}

export function filterTasks(
  tasks: Task[],
  query: string,
  status: TaskStatus | 'ALL',
): Task[] {
  const needle = query.trim().toLowerCase();

  return tasks.filter((task) => {
    if (status !== 'ALL' && task.status !== status) {
      return false;
    }

    if (needle === '') {
      return true;
    }

    return (
      task.title.toLowerCase().includes(needle) ||
      (task.assignee?.username.toLowerCase().includes(needle) ?? false)
    );
  });
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
