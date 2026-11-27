import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { toErrorMessage } from '../../../shared/api/error-message';
import { ErrorNote, LoadingState } from '../../../shared/ui/StateNotes';
import { useToast } from '../../../shared/ui/Toast';
import { teamsApi } from '../../teams/api';
import { useTeamMembers } from '../../teams/useTeamMembers';
import type { Team } from '../../teams/types';
import { tasksApi } from '../api';
import { TaskForm, type TaskFormPayload } from '../components/TaskForm';

export function TaskCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();

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

    async function loadTeams() {
      try {
        // 取全量而不是第一页：团队超过 20 个时，下拉不能静默缺项
        const result = await teamsApi.listAll();

        if (cancelled) {
          return;
        }

        setTeams(result.items);

        // 只有一个团队时直接选上；多团队时留给用户选，避免默认落到不对的团队
        if (result.items.length === 1) {
          setTeamId(result.items[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setTeamsError(toErrorMessage(err, '团队加载失败'));
        }
      } finally {
        if (!cancelled) {
          setTeamsLoading(false);
        }
      }
    }

    void loadTeams();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(payload: TaskFormPayload) {
    setError(null);
    setSubmitting(true);

    try {
      const created = await tasksApi.create({ teamId, ...payload });
      toast(`已创建「${created.title}」`);
      navigate(`/tasks/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建任务失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[880px]">
      <Link
        to="/tasks"
        className="inline-flex items-center gap-1 text-[13px] text-softink transition-colors hover:text-ink"
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
        返回概览
      </Link>

      <div className="mt-3">
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">新建任务</h1>
        <p className="mt-1 text-[13px] text-softink">
          选好团队和负责人，保存后立即出现在任务列表里。
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {teamsLoading ? <LoadingState label="正在加载团队…" /> : null}
        {teamsError ? <ErrorNote message={teamsError} /> : null}
        {membersError ? <ErrorNote message={membersError} /> : null}

        {!teamsLoading && !teamsError && teams.length === 0 ? (
          <p className="panel p-5 text-[13px] text-softink">
            你还没有加入任何团队，无法创建任务。
          </p>
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
    </div>
  );
}
