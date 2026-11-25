import { STATUS_LABELS } from '../constants';
import type { TaskStatus } from '../types';

const STYLES: Record<TaskStatus, string> = {
  TODO: 'bg-amber/10 text-amber',
  IN_PROGRESS: 'bg-indigo-mist text-indigo',
  DONE: 'bg-mint/10 text-mint',
};

// 状态 chip 永远带文字，不靠颜色单独传达语义
export function StatusChip({ status }: { status: TaskStatus }) {
  return (
    <span className={`chip ${STYLES[status]}`}>{STATUS_LABELS[status]}</span>
  );
}
