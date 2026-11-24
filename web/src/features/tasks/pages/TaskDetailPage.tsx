import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { tasksApi } from '../api';
import { PRIORITY_LABELS, STATUS_LABELS, formatDate } from '../constants';
import type { TaskDetail } from '../types';

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

    // 软删后没有恢复接口，删之前必须让用户明确确认
    const confirmed = window.confirm(
      '删除后该任务将从列表中消失，且暂不支持恢复。确认删除？',
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      await tasksApi.remove(taskId);
      navigate('/tasks', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>任务详情</h1>
        <Link to="/tasks" className="button secondary">
          返回列表
        </Link>
      </header>

      {loading ? <p className="muted">加载中…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && task ? (
        <article className="card">
          <div className="task-meta">
            <span className={`badge badge-${task.status.toLowerCase()}`}>
              {STATUS_LABELS[task.status]}
            </span>
            <span className="muted">
              优先级 {PRIORITY_LABELS[task.priority] ?? task.priority}
            </span>
          </div>

          <h2>{task.title}</h2>
          <p className="task-description">
            {task.description ?? '（没有描述）'}
          </p>

          <dl className="detail-grid">
            <dt>所属团队</dt>
            <dd>{task.team.name}</dd>

            <dt>创建人</dt>
            <dd>{task.createdBy.username}</dd>

            <dt>负责人</dt>
            <dd>{task.assignee ? task.assignee.username : '未指派'}</dd>

            <dt>预计工时</dt>
            <dd>
              {task.estimateHours === null ? '—' : `${task.estimateHours} 小时`}
            </dd>

            <dt>截止时间</dt>
            <dd>{formatDate(task.dueAt)}</dd>

            <dt>完成时间</dt>
            <dd>{formatDate(task.completedAt)}</dd>

            <dt>创建时间</dt>
            <dd>{formatDate(task.createdAt)}</dd>

            <dt>更新时间</dt>
            <dd>{formatDate(task.updatedAt)}</dd>
          </dl>

          <div className="actions">
            <Link to={`/tasks/${task.id}/edit`} className="button">
              编辑
            </Link>
            <button
              type="button"
              className="danger"
              onClick={() => {
                void handleDelete();
              }}
              disabled={deleting}
            >
              {deleting ? '删除中…' : '删除'}
            </button>
          </div>
        </article>
      ) : null}
    </div>
  );
}
