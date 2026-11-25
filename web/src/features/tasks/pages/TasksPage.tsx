import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Search, SquarePlus } from 'lucide-react';
import { InitialsDot } from '../../../shared/ui/InitialsDot';
import { KpiCard } from '../../../shared/ui/KpiCard';
import { MonogramTile } from '../../../shared/ui/MonogramTile';
import { ErrorNote, LoadingState } from '../../../shared/ui/StateNotes';
import { tasksApi } from '../api';
import { ActivityChart } from '../components/ActivityChart';
import { PriorityChip } from '../components/PriorityChip';
import { StatusBreakdown } from '../components/StatusBreakdown';
import { StatusChip } from '../components/StatusChip';
import { STATUS_LABELS, formatShortDate, isOverdue } from '../constants';
import { buildActivitySeries, filterTasks, summarizeTasks } from '../metrics';
import type { Task, TaskStatus } from '../types';

const STATUS_TABS: Array<{ key: TaskStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'TODO', label: STATUS_LABELS.TODO },
  { key: 'IN_PROGRESS', label: STATUS_LABELS.IN_PROGRESS },
  { key: 'DONE', label: STATUS_LABELS.DONE },
];

export function TasksPage() {
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL');

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    tasksApi
      .listAll()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setTasks(result.items);
        setTotal(result.total);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '任务加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const summary = useMemo(() => summarizeTasks(tasks, total), [tasks, total]);
  const series = useMemo(() => buildActivitySeries(tasks), [tasks]);
  const filtered = useMemo(
    () => filterTasks(tasks, query, statusFilter),
    [tasks, query, statusFilter],
  );

  const counts: Record<TaskStatus | 'ALL', number> = {
    ALL: tasks.length,
    TODO: summary.todo,
    IN_PROGRESS: summary.inProgress,
    DONE: summary.done,
  };
  const seriesTotal = series.reduce((sum, point) => sum + point.value, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em]">概览</h1>
          <p className="mt-1 text-[13px] text-softink">
            今日任务、进度与需要关注的高优先级项目。
          </p>
        </div>
        <Link to="/tasks/new" className="btn btn-primary">
          <SquarePlus size={16} strokeWidth={1.75} />
          新建任务
        </Link>
      </div>

      {loading ? (
        <div className="mt-5">
          <LoadingState label="正在读取任务…" />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="panel mt-5 flex items-center justify-between gap-4 p-5">
          <ErrorNote message={error} />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setReloadKey((key) => key + 1);
            }}
          >
            重试
          </button>
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 min-[1100px]:grid-cols-4">
            <KpiCard
              label="任务总数"
              value={summary.total}
              hint="全部团队任务"
              tone="indigo"
            />
            <KpiCard
              label="进行中"
              value={summary.inProgress}
              hint="待推进"
              tone="amber"
            />
            <KpiCard
              label="已完成"
              value={summary.done}
              hint={`${summary.completionRate}% 完成率`}
              tone="mint"
            />
            <KpiCard
              label="高优先级"
              value={summary.highPriority}
              hint="优先级 3"
              tone="ruby"
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 min-[1100px]:grid-cols-3">
            <section className="panel p-5 min-[1100px]:col-span-2">
              <header className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">
                    任务走势，最近 30 天
                  </h2>
                  <p className="caption mt-0.5">按任务的创建时间汇总</p>
                </div>
                <span className="chip bg-indigo-mist text-indigo">
                  {seriesTotal} 新增
                </span>
              </header>

              {seriesTotal === 0 ? (
                <div className="mt-4 flex h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-line bg-panel-2/50 text-center">
                  <p className="text-[13px] font-medium text-ink">
                    最近 30 天没有新建任务
                  </p>
                  <p className="caption mt-1">历史任务仍在下方列表里。</p>
                </div>
              ) : (
                <ActivityChart points={series} />
              )}

              <p className="caption mt-2">
                数据实时来自全部任务（自动翻页载入）。
              </p>
            </section>

            <StatusBreakdown summary={summary} />
          </div>

          <section className="panel mt-5 overflow-hidden [contain:paint]">
            <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
              <div>
                <h2 className="text-base font-semibold">全部任务</h2>
                <p className="caption mt-0.5">按创建时间倒序</p>
              </div>
              <p className="caption">
                显示 {filtered.length} / {tasks.length}
                {total > tasks.length ? `（共 ${total} 条）` : ''}
              </p>
            </header>

            <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
              <div className="relative w-full sm:w-64">
                <Search
                  size={16}
                  strokeWidth={1.75}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-softink"
                />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                  }}
                  placeholder="搜索标题或负责人"
                  aria-label="搜索任务"
                  className="field-input pl-9"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {STATUS_TABS.map((tab) => {
                  const active = statusFilter === tab.key;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setStatusFilter(tab.key);
                      }}
                      aria-pressed={active}
                      className={`inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-150 ${
                        active
                          ? 'border-indigo bg-indigo text-white'
                          : 'border-line bg-panel text-softink hover:bg-panel-2 hover:text-ink'
                      }`}
                    >
                      {tab.label}
                      <span
                        className={`mono text-[11px] ${
                          active ? 'text-white/75' : 'text-softink/70'
                        }`}
                      >
                        {counts[tab.key]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[860px] border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className="table-head pl-5">
                      任务
                    </th>
                    <th scope="col" className="table-head">
                      负责人
                    </th>
                    <th scope="col" className="table-head">
                      状态
                    </th>
                    <th scope="col" className="table-head">
                      优先级
                    </th>
                    <th scope="col" className="table-head text-right">
                      截止时间
                    </th>
                    <th scope="col" className="table-head text-right">
                      创建时间
                    </th>
                    <th scope="col" className="table-head w-10 pr-5">
                      <span className="sr-only">查看</span>
                    </th>
                  </tr>
                </thead>
                <tbody key={`${statusFilter}-${query}`}>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-12 text-center text-[13px] text-softink"
                      >
                        {tasks.length === 0
                          ? '还没有任务，先运行 npx prisma db seed 造点数据。'
                          : '没有匹配的任务——连待办清单都替你尴尬。'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((task) => {
                      const openTask = () => {
                        navigate(`/tasks/${task.id}`);
                      };

                      return (
                        <tr
                          key={task.id}
                          onClick={openTask}
                          className="table-row row-fade cursor-pointer hover:bg-panel-2"
                        >
                          <td className="px-3 pl-5">
                            <div className="flex items-center gap-3">
                              <MonogramTile label={task.title} />
                              <div className="min-w-0">
                                <Link
                                  to={`/tasks/${task.id}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                  }}
                                  className="block truncate font-medium text-ink transition-colors hover:text-indigo"
                                >
                                  {task.title}
                                </Link>
                                <p className="caption truncate">
                                  {task.description ?? '无描述'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3">
                            <span className="flex items-center gap-2">
                              <InitialsDot
                                name={task.assignee?.username ?? null}
                              />
                              <span className="text-[13px]">
                                {task.assignee?.username ?? '未指派'}
                              </span>
                            </span>
                          </td>
                          <td className="px-3">
                            <StatusChip status={task.status} />
                          </td>
                          <td className="px-3">
                            <PriorityChip priority={task.priority} />
                          </td>
                          <td
                            className={`px-3 text-right text-[12.5px] ${
                              isOverdue(task)
                                ? 'mono text-ruby'
                                : 'mono text-softink'
                            }`}
                          >
                            {formatShortDate(task.dueAt)}
                          </td>
                          <td className="mono px-3 text-right text-[12.5px] text-softink">
                            {formatShortDate(task.createdAt)}
                          </td>
                          <td className="pr-5 text-right text-softink">
                            <ChevronRight
                              size={16}
                              strokeWidth={1.75}
                              aria-hidden="true"
                              className="ml-auto"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
