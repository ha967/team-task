import { useEffect, useState, type FormEvent } from 'react';
import type { Team, TeamMember } from '../../teams/types';
import {
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  STATUS_LABELS,
  STATUS_OPTIONS,
  toDateTimeLocal,
} from '../constants';
import type { TaskDetail, TaskStatus } from '../types';

// 表单只负责收集与规范化，提交动作交给页面（页面决定调 create 还是 update）
export interface TaskFormPayload {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  estimateHours: number | null;
  assigneeId: string | null;
  dueAt: string | null;
}

interface TaskFormProps {
  mode: 'create' | 'edit';
  initial?: TaskDetail;
  // 新建时要选团队；编辑时团队不可变（后端也拒绝移动任务），这两个 prop 不用传
  teams?: Team[];
  onSelectTeam?: (teamId: string) => void;
  // 当前团队 id：新建时来自选择器，编辑时来自任务本身（用于禁用负责人下拉）
  teamId: string;
  members: TeamMember[];
  membersLoading: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: TaskFormPayload) => void;
  onCancel: () => void;
}

export function TaskForm({
  mode,
  initial,
  teams,
  teamId,
  onSelectTeam,
  members,
  membersLoading,
  submitting,
  error,
  onSubmit,
  onCancel,
}: TaskFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? 'TODO');
  const [priority, setPriority] = useState(initial?.priority ?? 2);
  const [estimateHours, setEstimateHours] = useState(
    initial?.estimateHours === null || initial?.estimateHours === undefined
      ? ''
      : String(initial.estimateHours),
  );
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ?? '');
  const [dueAt, setDueAt] = useState(toDateTimeLocal(initial?.dueAt ?? null));
  const [localError, setLocalError] = useState<string | null>(null);

  // 新建时切团队必须清空负责人：成员列表已经换了一批，留着旧 id 会提交一个「界面上根本选不出来」的人，
  // 后端 assertTeamMember 只会回一句「你不是该团队成员」，用户看到的下拉却是空的。
  // 编辑模式 teamId 恒定、且初始值来自任务本身，不能重置。
  useEffect(() => {
    if (mode !== 'create') {
      return;
    }

    setAssigneeId('');
  }, [mode, teamId]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();

    // <input required> 只拦空串，纯空格算「有值」。不自己挡的话，后端的 class-validator
    // 会回英文文案（title must be longer than or equal to 1 characters）糊到用户脸上。
    if (trimmedTitle === '') {
      setLocalError('标题不能为空');
      return;
    }

    setLocalError(null);

    onSubmit({
      title: trimmedTitle,
      // 空串转 null：null 表示「清空该字段」，undefined 表示「不改」
      description: description.trim() === '' ? null : description.trim(),
      status,
      priority,
      estimateHours: estimateHours.trim() === '' ? null : Number(estimateHours),
      assigneeId: assigneeId === '' ? null : assigneeId,
      dueAt: dueAt === '' ? null : new Date(dueAt).toISOString(),
    });
  }

  return (
    <form className="card form form-wide" onSubmit={handleSubmit}>
      <h1>{mode === 'create' ? '新建任务' : '编辑任务'}</h1>

      {mode === 'create' ? (
        <label className="field">
          <span>所属团队</span>
          <select
            value={teamId}
            onChange={(event) => onSelectTeam?.(event.target.value)}
            required
          >
            <option value="">请选择团队</option>
            {(teams ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="muted">所属团队：{initial?.team.name ?? '—'}</p>
      )}

      <label className="field">
        <span>标题</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          required
        />
      </label>

      <label className="field">
        <span>描述</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={5000}
          rows={4}
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>状态</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as TaskStatus)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>优先级</span>
          <select
            value={priority}
            onChange={(event) => setPriority(Number(event.target.value))}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {PRIORITY_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>负责人</span>
          <select
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            disabled={membersLoading || !teamId}
          >
            <option value="">未指派</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.username}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>预计工时（小时）</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={estimateHours}
            onChange={(event) => setEstimateHours(event.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span>截止时间</span>
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
        />
      </label>

      {(localError ?? error) !== null ? (
        <p className="error">{localError ?? error}</p>
      ) : null}

      <div className="actions">
        <button
          type="submit"
          disabled={submitting || (mode === 'create' && !teamId)}
        >
          {submitting ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          取消
        </button>
      </div>
    </form>
  );
}
