import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, LogOut } from 'lucide-react';
import { toErrorMessage } from '../../../shared/api/error-message';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { MonogramTile } from '../../../shared/ui/MonogramTile';
import { ErrorNote, LoadingState } from '../../../shared/ui/StateNotes';
import { useToast } from '../../../shared/ui/Toast';
import { useAuth } from '../../auth/AuthContext';
import { teamsApi } from '../api';
import { InviteMemberForm } from '../components/InviteMemberForm';
import { MemberTable } from '../components/MemberTable';
import { RoleChip } from '../components/RoleChip';
import { canInvite, canLeaveTeam, countOwners } from '../permissions';
import type { TeamDetail, TeamMember, TeamRole } from '../types';

type PendingAction = { type: 'remove'; member: TeamMember } | { type: 'leave' };

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

export function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  // 连续操作会触发多次静默重拉；只采纳最后一次响应，避免旧快照覆盖新快照
  const loadSeq = useRef(0);
  // 卸载后不再写状态：请求可能还在飞，React 18 下虽不会报错，但没必要更新
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const currentUserId = user?.id ?? '';
  const ownerCount = useMemo(
    () => (detail === null ? 0 : countOwners(detail.members)),
    [detail],
  );

  const loadDetail = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!teamId) {
        setError('缺少团队 id');
        setLoading(false);
        return;
      }

      const seq = loadSeq.current + 1;
      loadSeq.current = seq;

      if (!options?.silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const next = await teamsApi.detail(teamId);

        // 期间又发起了更新的加载请求，或页面已卸载：丢弃这次的结果
        if (!mountedRef.current || seq !== loadSeq.current) {
          return;
        }

        setDetail(next);
      } catch (err) {
        if (!mountedRef.current || seq !== loadSeq.current) {
          return;
        }

        const message = toErrorMessage(err, '团队加载失败');

        if (options?.silent) {
          setActionError(message);
        } else {
          setError(message);
          setDetail(null);
        }
      } finally {
        if (mountedRef.current && seq === loadSeq.current) {
          setLoading(false);
        }
      }
    },
    [teamId],
  );

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function handleInvite(email: string) {
    if (!teamId) {
      return;
    }

    const member = await teamsApi.invite(teamId, { email });
    toast(`已邀请 ${member.username}`);
    setActionError(null);
    await loadDetail({ silent: true });
  }

  async function handleRoleChange(member: TeamMember, role: TeamRole) {
    if (!teamId || member.role === role) {
      return;
    }

    setSavingUserId(member.userId);
    setActionError(null);

    // 乐观更新这一行，避免受控 select 在请求返回前弹回旧值；最终以重拉结果为准
    setDetail((current) =>
      current === null
        ? current
        : {
            ...current,
            members: current.members.map((item) =>
              item.userId === member.userId ? { ...item, role } : item,
            ),
          },
    );

    try {
      await teamsApi.updateMemberRole(teamId, member.userId, { role });
      toast(`已更新 ${member.username} 的角色`);
      await loadDetail({ silent: true });
    } catch (err) {
      setActionError(toErrorMessage(err, '角色更新失败'));
      // 失败时用服务端数据覆盖乐观更新，把下拉恢复成真实角色
      await loadDetail({ silent: true });
    } finally {
      setSavingUserId(null);
    }
  }

  async function handleConfirmAction() {
    if (pendingAction === null || !teamId || detail === null) {
      return;
    }

    const action = pendingAction;
    setPendingAction(null);
    setActionError(null);
    setActionBusy(true);

    try {
      if (action.type === 'remove') {
        await teamsApi.removeMember(teamId, action.member.userId);
        toast(`已移除 ${action.member.username}`);
        await loadDetail({ silent: true });
      } else {
        if (currentUserId === '') {
          return;
        }

        await teamsApi.removeMember(teamId, currentUserId);
        toast(`已退出 ${detail.name}`);
        navigate('/teams', { replace: true });
      }
    } catch (err) {
      setActionError(
        toErrorMessage(
          err,
          action.type === 'remove' ? '移除成员失败' : '退出团队失败',
        ),
      );
      await loadDetail({ silent: true });
    } finally {
      setActionBusy(false);
    }
  }

  const leaveAllowed = detail !== null && canLeaveTeam(detail.role, ownerCount);

  const confirmTitle =
    pendingAction?.type === 'leave' ? '退出团队？' : '移除成员？';
  const confirmDescription =
    pendingAction?.type === 'leave'
      ? `退出「${detail?.name ?? '该团队'}」后，你将失去该团队任务与评论的访问权限。之后可由管理员重新邀请。`
      : pendingAction?.type === 'remove'
        ? `将 ${pendingAction.member.username} 移出团队。该成员的历史任务与评论不会被删除。`
        : '';

  return (
    <div>
      <Link
        to="/teams"
        className="inline-flex items-center gap-1 text-[13px] text-softink transition-colors hover:text-ink"
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
        返回团队列表
      </Link>

      {loading ? (
        <div className="mt-5">
          <LoadingState label="正在读取团队…" />
        </div>
      ) : null}

      {!loading && detail === null && error !== null ? (
        <div className="panel mt-5 flex items-center justify-between gap-4 p-5">
          <ErrorNote message={error} />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              void loadDetail();
            }}
          >
            重试
          </button>
        </div>
      ) : null}

      {!loading && detail !== null ? (
        <>
          <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <MonogramTile label={detail.name} size="lg" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <RoleChip role={detail.role} />
                  <span className="chip bg-panel-2 text-softink">
                    {detail.members.length} 位成员
                  </span>
                </div>
                <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.01em]">
                  {detail.name}
                </h1>
                <p className="mt-1 text-[12.5px] text-softink">
                  创建于 {formatDate(detail.createdAt)}
                </p>
              </div>
            </div>
          </header>

          {actionError !== null ? (
            <div className="mt-4">
              <ErrorNote message={actionError} />
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-1 gap-5 min-[1100px]:grid-cols-3">
            <section className="panel overflow-hidden min-[1100px]:col-span-2">
              <header className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-5">
                <div>
                  <h2 className="text-base font-semibold">成员</h2>
                  <p className="caption mt-0.5">按加入时间排序</p>
                </div>
                <span className="chip bg-indigo-mist text-indigo">
                  {detail.members.length} 人
                </span>
              </header>

              {canInvite(detail.role) ? (
                <div className="border-y border-line bg-panel-2/60 px-5 py-4">
                  <h3 className="text-[13px] font-semibold">邀请成员</h3>
                  <div className="mt-3">
                    <InviteMemberForm onSubmit={handleInvite} />
                  </div>
                </div>
              ) : null}

              <MemberTable
                members={detail.members}
                currentUserId={currentUserId}
                currentUserRole={detail.role}
                ownerCount={ownerCount}
                savingUserId={savingUserId}
                onRoleChange={(member, role) => {
                  void handleRoleChange(member, role);
                }}
                onRemove={(member) => {
                  if (!actionBusy) {
                    setPendingAction({ type: 'remove', member });
                  }
                }}
              />
            </section>

            <aside className="panel h-fit p-5">
              <h2 className="text-base font-semibold">团队信息</h2>
              <dl className="mt-2">
                <InfoRow label="团队名称">{detail.name}</InfoRow>
                <InfoRow label="我的角色">
                  <RoleChip role={detail.role} />
                </InfoRow>
                <InfoRow label="成员数量">
                  <span className="mono">{detail.members.length}</span>
                </InfoRow>
                <InfoRow label="创建时间">
                  <span className="mono">{formatDate(detail.createdAt)}</span>
                </InfoRow>
                <InfoRow label="更新时间">
                  <span className="mono">{formatDate(detail.updatedAt)}</span>
                </InfoRow>
              </dl>

              <div className="mt-5 border-t border-line pt-4">
                <h3 className="text-[13px] font-semibold">简介</h3>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-ink/90">
                  {detail.description ?? '（没有简介）'}
                </p>
              </div>

              <div className="mt-5 border-t border-line pt-4">
                <button
                  type="button"
                  className="btn btn-ghost w-full text-ruby hover:bg-ruby/5 hover:text-ruby"
                  disabled={!leaveAllowed || actionBusy}
                  title={
                    leaveAllowed ? undefined : '团队至少需要保留一个所有者'
                  }
                  onClick={() => {
                    setPendingAction({ type: 'leave' });
                  }}
                >
                  <LogOut size={16} strokeWidth={1.75} />
                  退出团队
                </button>
                {!leaveAllowed ? (
                  <p className="caption mt-2 text-center">
                    团队至少需要保留一个所有者
                  </p>
                ) : null}
              </div>
            </aside>
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={pendingAction !== null}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={pendingAction?.type === 'leave' ? '确认退出' : '确认移除'}
        onConfirm={() => {
          void handleConfirmAction();
        }}
        onCancel={() => {
          setPendingAction(null);
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
