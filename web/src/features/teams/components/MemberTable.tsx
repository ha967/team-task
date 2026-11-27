import { InitialsDot } from '../../../shared/ui/InitialsDot';
import { ROLE_LABELS, ROLE_OPTIONS } from '../constants';
import { canChangeRoles, canRemoveMember, isLastOwner } from '../permissions';
import { RoleChip } from './RoleChip';
import type { TeamMember, TeamRole } from '../types';

interface MemberTableProps {
  members: TeamMember[];
  currentUserId: string;
  currentUserRole: TeamRole;
  ownerCount: number;
  savingUserId: string | null;
  onRoleChange: (member: TeamMember, role: TeamRole) => void;
  onRemove: (member: TeamMember) => void;
}

function formatJoinedAt(value: string) {
  return new Date(value).toLocaleDateString('zh-CN');
}

export function MemberTable({
  members,
  currentUserId,
  currentUserRole,
  ownerCount,
  savingUserId,
  onRoleChange,
  onRemove,
}: MemberTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr>
            <th scope="col" className="table-head pl-5">
              成员
            </th>
            <th scope="col" className="table-head">
              角色
            </th>
            <th scope="col" className="table-head">
              加入时间
            </th>
            <th scope="col" className="table-head w-20 pr-5 text-right">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {members.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="px-5 py-10 text-center text-[13px] text-softink"
              >
                暂无成员
              </td>
            </tr>
          ) : (
            members.map((member) => {
              const isSelf = member.userId === currentUserId;
              const lastOwner = isLastOwner(member, ownerCount);
              const removable = canRemoveMember(
                currentUserRole,
                currentUserId,
                member,
                ownerCount,
              );
              const roleSelectable = canChangeRoles(currentUserRole);

              return (
                <tr key={member.userId} className="table-row">
                  <td className="px-3 pl-5">
                    <div className="flex items-center gap-2.5">
                      <InitialsDot name={member.username} />
                      <span className="truncate font-medium text-ink">
                        {member.username}
                        {isSelf ? (
                          <span className="ml-1 text-[11px] font-normal text-softink">
                            （你）
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </td>
                  <td className="px-3">
                    {roleSelectable ? (
                      <div>
                        <select
                          value={member.role}
                          onChange={(event) => {
                            onRoleChange(
                              member,
                              event.target.value as TeamRole,
                            );
                          }}
                          disabled={savingUserId === member.userId || lastOwner}
                          title={
                            lastOwner ? '团队至少需要保留一个所有者' : undefined
                          }
                          aria-label={`${member.username} 的角色`}
                          className="field-input h-8 w-[112px] py-0 text-[13px]"
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                        {lastOwner ? (
                          <p className="mt-1 text-[11px] leading-4 text-softink">
                            团队至少需要保留一个所有者
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <RoleChip role={member.role} />
                    )}
                  </td>
                  <td className="mono px-3 text-[12.5px] text-softink">
                    {formatJoinedAt(member.joinedAt)}
                  </td>
                  <td className="pr-5 text-right">
                    {removable ? (
                      <button
                        type="button"
                        className="btn btn-ghost h-8 px-2.5 text-[12.5px] text-ruby hover:bg-ruby/5 hover:text-ruby"
                        onClick={() => {
                          onRemove(member);
                        }}
                      >
                        移除
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
