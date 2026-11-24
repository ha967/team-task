import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTeamMembers } from '../../teams/useTeamMembers';
import { tasksApi } from '../api';
import { TaskForm, type TaskFormPayload } from '../components/TaskForm';
import type { TaskDetail } from '../types';

export function TaskEditPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

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
      // 回详情页重新拉一次，展示的是后端真正落库的结果而不是本地拼的
      navigate(`/tasks/${taskId}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>编辑任务</h1>
        <Link to="/tasks" className="button secondary">
          返回列表
        </Link>
      </header>

      {loading ? <p className="muted">加载中…</p> : null}
      {loadError ? <p className="error">{loadError}</p> : null}
      {membersError ? <p className="error">{membersError}</p> : null}

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
  );
}
