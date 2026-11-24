import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Team } from '../../teams/types';
import { teamsApi } from '../../teams/api';
import { useTeamMembers } from '../../teams/useTeamMembers';
import { tasksApi } from '../api';
import { TaskForm, type TaskFormPayload } from '../components/TaskForm';

export function TaskCreatePage() {
  const navigate = useNavigate();

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 选中的团队一变就重新拉成员，负责人下拉只列该团队的人
  const {
    members,
    loading: membersLoading,
    error: membersError,
  } = useTeamMembers(teamId === '' ? null : teamId);

  useEffect(() => {
    let cancelled = false;

    teamsApi
      .list()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setTeams(result.items);

        // 只有一个团队时直接选上；多团队时留给用户选，避免默认落到不对的团队
        if (result.items.length === 1) {
          setTeamId(result.items[0].id);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTeamsError(err instanceof Error ? err.message : '团队加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTeamsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(payload: TaskFormPayload) {
    setError(null);
    setSubmitting(true);

    try {
      const created = await tasksApi.create({ teamId, ...payload });
      navigate(`/tasks/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建任务失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>新建任务</h1>
        <Link to="/tasks" className="button secondary">
          返回列表
        </Link>
      </header>

      {teamsLoading ? <p className="muted">正在加载团队…</p> : null}
      {teamsError ? <p className="error">{teamsError}</p> : null}
      {membersError ? <p className="error">{membersError}</p> : null}

      {!teamsLoading && !teamsError && teams.length === 0 ? (
        <p className="muted">你还没有加入任何团队，无法创建任务。</p>
      ) : null}

      {!teamsLoading && !teamsError && teams.length > 0 ? (
        <TaskForm
          mode="create"
          teams={teams}
          teamId={teamId}
          onSelectTeam={setTeamId}
          members={members}
          membersLoading={membersLoading}
          submitting={submitting}
          error={error}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/tasks')}
        />
      ) : null}
    </div>
  );
}
