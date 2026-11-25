import { PRIORITY_LABELS } from '../constants';

const STYLES: Record<number, string> = {
  0: 'bg-panel-2 text-softink',
  1: 'bg-indigo-mist text-indigo',
  2: 'bg-amber/10 text-amber',
  3: 'bg-ruby/10 text-ruby',
};

export function PriorityChip({ priority }: { priority: number }) {
  return (
    <span
      className={`chip h-5 px-2 text-[11px] ${STYLES[priority] ?? STYLES[0]}`}
    >
      {PRIORITY_LABELS[priority] ?? `P${priority}`}
    </span>
  );
}
