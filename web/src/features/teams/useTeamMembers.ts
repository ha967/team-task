import { useEffect, useState } from 'react';
import { toErrorMessage } from '../../shared/api/error-message';
import { teamsApi } from './api';
import type { TeamMember } from './types';

/**
 * 取某个团队的成员列表（任务表单里的「负责人」下拉要用）。
 *
 * teamId 为空时清空结果：新建任务时用户还没选团队，这时不该留着上一个团队的成员。
 * 请求带 cancelled 标记，团队切得快时不会把旧响应写进新状态。
 */
export function useTeamMembers(teamId: string | null) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) {
      setMembers([]);
      setError(null);
      // 必须一并复位 loading：上一个请求的 finally 会被 cancelled 挡掉，
      // 否则这里会永久停在「加载中」，负责人下拉再也解不开禁用
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError(null);

    teamsApi
      .detail(teamId)
      .then((team) => {
        if (!cancelled) {
          setMembers(team.members);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(toErrorMessage(err, '团队成员加载失败'));
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
  }, [teamId]);

  return { members, loading, error };
}
