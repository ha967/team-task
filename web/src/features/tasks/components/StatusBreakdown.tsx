import type { TaskSummary } from '../metrics';

const ROWS = [
  { key: 'todo', label: '待办', dot: 'bg-amber', bar: 'bg-amber' },
  { key: 'inProgress', label: '进行中', dot: 'bg-indigo', bar: 'bg-indigo' },
  { key: 'done', label: '已完成', dot: 'bg-mint', bar: 'bg-mint' },
] as const;

export function StatusBreakdown({ summary }: { summary: TaskSummary }) {
  const counts = {
    todo: summary.todo,
    inProgress: summary.inProgress,
    done: summary.done,
  };
  // 按任务总数算占比：三档都是 1 时应该各占 33%，而不是三条满格
  const baseline = Math.max(
    1,
    summary.todo + summary.inProgress + summary.done,
  );

  return (
    <section className="panel flex flex-col p-5">
      <header>
        <h2 className="text-base font-semibold">任务构成</h2>
        <p className="caption mt-0.5">按当前状态拆分</p>
      </header>

      <div className="mt-5 flex flex-col gap-4">
        {ROWS.map((row) => {
          const count = counts[row.key];

          return (
            <div key={row.key}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2 font-medium">
                  <span className={`h-2 w-2 rounded-full ${row.dot}`} />
                  {row.label}
                </span>
                <span className="mono text-softink">{count}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel-2">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${row.bar}`}
                  style={{ width: `${(count / baseline) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-line pt-4 text-[12.5px]">
        <span className="text-softink">完成率</span>
        <span className="mono font-semibold text-ink">
          {summary.completionRate}%
        </span>
      </div>
    </section>
  );
}
