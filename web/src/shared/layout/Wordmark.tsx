import { Link } from 'react-router-dom';

/**
 * 品牌区：默认展开显示「任务台 / TASK ADMIN」，
 * 收起时只留 Indigo 底的三条白色横杠（与 favicon 同构）。
 */
export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      to="/tasks"
      aria-label="任务台 — 返回概览"
      className={`flex h-16 items-center gap-3 px-4 ${
        collapsed ? 'justify-center' : ''
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo">
        <span className="flex flex-col items-start gap-[3px]">
          <span className="h-[3px] w-4 rounded-full bg-white" />
          <span className="h-[3px] w-3 rounded-full bg-white" />
          <span className="h-[3px] w-2 rounded-full bg-white" />
        </span>
      </span>
      {collapsed ? null : (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[17px] font-semibold">任务台</span>
          <span className="block text-[10px] uppercase tracking-[0.14em] text-softink">
            TASK ADMIN
          </span>
        </span>
      )}
    </Link>
  );
}
