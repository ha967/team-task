import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { ErrorNote, LoadingState } from '../../../shared/ui/StateNotes';
import { useToast } from '../../../shared/ui/Toast';
import { useTeamMembers } from '../../teams/useTeamMembers';
import { tasksApi } from '../api';
import { TaskForm, type TaskFormPayload } from '../components/TaskForm';
import type { TaskDetail } from '../types';

export function TaskEditPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 编辑时团队不可变，成员列表直接取任务所属团队
  const {
    members,
    loading: membersLoading,
    error: membersError,
  } = useTeamMembers(task === null ? null : task.teamId);

  useEffect(() => {
    if (!taskId) {
      setLoadError('缺少任务 id');
      setLoading(false);
      return;
    }

    let cancelled = false;

    tasksApi
      .detail(taskId)
      .then((result) => {
        if (!cancelled) {
          setTask(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '任务加载失败');
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
  }, [taskId]);

  async function handleSubmit(payload: TaskFormPayload) {
    if (!taskId) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await tasksApi.update(taskId, payload);
      toast('任务已更新');
      // 回详情页重新拉一次，展示的是后端真正落库的结果而不是本地拼的
      navigate(`/tasks/${taskId}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[880px]">
      <Link
        to={taskId ? `/tasks/${taskId}` : '/tasks'}
        className="inline-flex items-center gap-1 text-[13px] text-softink transition-colors hover:text-ink"
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
        {taskId ? '返回任务详情' : '返回概览'}
      </Link>

      <div className="mt-3">
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">编辑任务</h1>
        <p className="mt-1 text-[13px] text-softink">
          团队与创建人不可更改，其余字段保存后立即生效。
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {loading ? <LoadingState label="正在读取任务…" /> : null}
        {loadError ? <ErrorNote message={loadError} /> : null}
        {membersError ? <ErrorNote message={membersError} /> : null}

        {!loading && !loadError && task ? (
          <TaskForm
            mode="edit"
            initial={task}
            teamId={task.teamId}
            members={members}
            membersLoading={membersLoading}
            submitting={submitting}
            error={error}
            onSubmit={handleSubmit}
            onCancel={() => navigate(`/tasks/${task.id}`)}
          />
        ) : null}
      </div>
    </div>
  );
}
