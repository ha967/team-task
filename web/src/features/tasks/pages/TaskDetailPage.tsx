import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Pencil, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { InitialsDot } from '../../../shared/ui/InitialsDot';
import { MonogramTile } from '../../../shared/ui/MonogramTile';
import { ErrorNote, LoadingState } from '../../../shared/ui/StateNotes';
import { useToast } from '../../../shared/ui/Toast';
import { CommentSection } from '../../comments/components/CommentSection';
import { tasksApi } from '../api';
import { PriorityChip } from '../components/PriorityChip';
import { StatusChip } from '../components/StatusChip';
import { TaskTimeline } from '../components/TaskTimeline';
import { formatDate, isOverdue } from '../constants';
import type { TaskDetail } from '../types';

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const loadTask = useCallback(async () => {
    if (!taskId) {
      setError('缺少任务 id');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setTask(await tasksApi.detail(taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '任务加载失败');
      // 404（任务不存在 / 已删除）时不要留着上一次的内容
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void loadTask();
  }, [loadTask]);

  async function handleDelete() {
    if (!taskId) {
      return;
    }

    setConfirming(false);
    setDeleting(true);
    setError(null);

    try {
      await tasksApi.remove(taskId);
      toast('任务已删除', 'info');
      navigate('/tasks', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
      setDeleting(false);
    }
  }

  return (
    <div>
      <Link
        to="/tasks"
        className="inline-flex items-center gap-1 text-[13px] text-softink transition-colors hover:text-ink"
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
        返回任务列表
      </Link>

      {loading ? (
        <div className="mt-5">
          <LoadingState label="正在读取任务…" />
        </div>
      ) : null}

      {!loading && !task && error ? (
        <div className="mt-5">
          <ErrorNote message={error} />
        </div>
      ) : null}

      {!loading && task ? (
        <>
          <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <MonogramTile label={task.title} size="lg" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={task.status} />
                  <PriorityChip priority={task.priority} />
                </div>
                <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.01em]">
                  {task.title}
                </h1>
                <p className="mt-1 text-[12.5px] text-softink">
                  任务 <span className="mono">#{task.id.slice(0, 8)}</span>
                  {' · '}
                  创建于 {formatDate(task.createdAt)}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              <Link to={`/tasks/${task.id}/edit`} className="btn btn-primary">
                <Pencil size={16} strokeWidth={1.75} />
                编辑
              </Link>
              <button
                type="button"
                className="btn btn-ghost text-ruby hover:bg-ruby/5 hover:text-ruby"
                onClick={() => {
                  setConfirming(true);
                }}
                disabled={deleting}
              >
                <Trash2 size={16} strokeWidth={1.75} />
                {deleting ? '删除中…' : '删除'}
              </button>
            </div>
          </header>

          {error ? (
            <div className="mt-4">
              <ErrorNote message={error} />
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-1 gap-5 min-[1100px]:grid-cols-3">
            <section className="panel p-5 min-[1100px]:col-span-2">
              <h2 className="text-base font-semibold">描述</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink/90">
                {task.description ?? '（没有描述）'}
              </p>

              <div className="mt-6 border-t border-line pt-5">
                <h3 className="text-[13px] font-semibold">进度</h3>
                <TaskTimeline
                  status={task.status}
                  createdAt={task.createdAt}
                  completedAt={task.completedAt}
                />
              </div>
            </section>

            <aside className="panel h-fit p-5">
              <h2 className="text-base font-semibold">任务信息</h2>
              <dl className="mt-2">
                <InfoRow label="所属团队">{task.team.name}</InfoRow>
                <InfoRow label="创建人">{task.createdBy.username}</InfoRow>
                <InfoRow label="负责人">
                  <span className="inline-flex items-center gap-2">
                    <InitialsDot name={task.assignee?.username ?? null} />
                    {task.assignee?.username ?? '未指派'}
                  </span>
                </InfoRow>
                <InfoRow label="预计工时">
                  <span className="mono">
                    {task.estimateHours === null
                      ? '—'
                      : `${task.estimateHours} 小时`}
                  </span>
                </InfoRow>
                <InfoRow label="截止时间">
                  <span
                    className={`mono ${
                      isOverdue(task) ? 'font-medium text-ruby' : ''
                    }`}
                  >
                    {formatDate(task.dueAt)}
                  </span>
                </InfoRow>
                <InfoRow label="完成时间">
                  <span className="mono">{formatDate(task.completedAt)}</span>
                </InfoRow>
                <InfoRow label="更新时间">
                  <span className="mono">{formatDate(task.updatedAt)}</span>
                </InfoRow>
              </dl>
            </aside>
          </div>

          <CommentSection taskId={task.id} />
        </>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title="删除这个任务？"
        description="删除后该任务将从列表中消失，且暂不支持恢复。"
        confirmLabel="确认删除"
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => {
          setConfirming(false);
        }}
      />
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[13px] last:border-b-0">
      <dt className="shrink-0 text-softink">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-ink">
        {children}
      </dd>
    </div>
  );
}
