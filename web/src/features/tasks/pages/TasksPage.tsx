import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { tasksApi } from '../api';
import { PRIORITY_LABELS, STATUS_LABELS, formatDate } from '../constants';
import type { Task } from '../types';

export function TasksPage() {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    tasksApi
      .list()
      .then((result) => {
        if (!cancelled) {
          setTasks(result.items);
        }
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
  }, []);

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>任务看板</h1>
          <p className="muted">当前用户：{user?.username}</p>
        </div>
        <div className="actions">
          <Link to="/tasks/new" className="button">
            新建任务
          </Link>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void logout();
            }}
          >
            退出登录
          </button>
        </div>
      </header>

      {loading ? <p className="muted">加载中…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && !error && tasks.length === 0 ? (
        <p className="muted">
          还没有任务，先运行 npx prisma db seed 造点数据。
        </p>
      ) : null}

      <ul className="task-list">
        {tasks.map((task) => (
          <li key={task.id} className="card task-item">
            <div className="task-meta">
              <span className={`badge badge-${task.status.toLowerCase()}`}>
                {STATUS_LABELS[task.status]}
              </span>
              <span className="muted">
                优先级 {PRIORITY_LABELS[task.priority] ?? task.priority}
              </span>
            </div>

            <h2>
              <Link to={`/tasks/${task.id}`}>{task.title}</Link>
            </h2>
            {task.description ? <p>{task.description}</p> : null}

            <footer className="muted">
              {task.assignee ? `负责人：${task.assignee.username}` : '未分配'}
              {` · 创建于 ${formatDate(task.createdAt)}`}
              {task.dueAt ? ` · 截止 ${formatDate(task.dueAt)}` : ''}
            </footer>
          </li>
        ))}
      </ul>
    </div>
  );
}
