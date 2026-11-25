import { Check } from 'lucide-react';
import { formatDate } from '../constants';
import type { TaskStatus } from '../types';

const STEPS: Array<{ key: TaskStatus; label: string }> = [
  { key: 'TODO', label: '待办' },
  { key: 'IN_PROGRESS', label: '进行中' },
  { key: 'DONE', label: '已完成' },
];

interface TaskTimelineProps {
  status: TaskStatus;
  createdAt: string;
  completedAt: string | null;
}

export function TaskTimeline({
  status,
  createdAt,
  completedAt,
}: TaskTimelineProps) {
  const currentIndex = STEPS.findIndex((step) => step.key === status);

  return (
    <ol className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      {STEPS.map((step, index) => {
        const reached = index <= currentIndex;
        const active = index === currentIndex;

        let detail = '尚未到达';

        if (index === 0) {
          detail = formatDate(createdAt);
        } else if (active) {
          detail =
            step.key === 'DONE' && completedAt
              ? formatDate(completedAt)
              : '当前状态';
        } else if (reached) {
          detail = '已完成';
        }

        return (
          <li
            key={step.key}
            className={`rounded-lg border p-3 ${
              active
                ? 'border-indigo/40 bg-indigo-mist/60'
                : 'border-line bg-panel-2/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                  reached
                    ? 'bg-indigo text-white'
                    : 'border border-line bg-panel text-softink'
                }`}
              >
                {reached ? <Check size={12} strokeWidth={2.5} /> : index + 1}
              </span>
              <span
                className={`text-[13px] font-medium ${
                  reached ? 'text-ink' : 'text-softink'
                }`}
              >
                {step.label}
              </span>
            </div>
            <p className="caption mt-1.5 truncate pl-7">{detail}</p>
          </li>
        );
      })}
    </ol>
  );
}
