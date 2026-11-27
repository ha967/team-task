import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Search, SquarePlus } from 'lucide-react';
import { toErrorMessage } from '../../../shared/api/error-message';
import { MonogramTile } from '../../../shared/ui/MonogramTile';
import { ErrorNote, LoadingState } from '../../../shared/ui/StateNotes';
import { teamsApi } from '../api';
import { RoleChip } from '../components/RoleChip';
import type { Team } from '../types';

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    teamsApi
      .listAll()
      .then((result) => {
        if (!cancelled) {
          setTeams(result.items);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(toErrorMessage(err, '团队加载失败'));
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
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    if (keyword === '') {
      return teams;
    }

    return teams.filter((team) => {
      return (
        team.name.toLowerCase().includes(keyword) ||
        (team.description ?? '').toLowerCase().includes(keyword)
      );
    });
  }, [query, teams]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em]">团队</h1>
          <p className="mt-1 text-[13px] text-softink">
            你参与的团队、角色与成员管理。
          </p>
        </div>
        <Link to="/teams/new" className="btn btn-primary">
          <SquarePlus size={16} strokeWidth={1.75} />
          新建团队
        </Link>
      </div>

      {loading ? (
        <div className="mt-5">
          <LoadingState label="正在读取团队…" />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="panel mt-5 flex items-center justify-between gap-4 p-5">
          <ErrorNote message={error} />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setReloadKey((key) => key + 1);
            }}
          >
            重试
          </button>
        </div>
      ) : null}

      {!loading && !error && teams.length === 0 ? (
        <div className="panel mt-5 flex flex-col items-center justify-center px-5 py-16 text-center">
          <p className="text-base font-semibold">你还没有加入任何团队</p>
          <p className="caption mt-1">
            创建一个团队，开始把任务和成员组织起来。
          </p>
          <Link to="/teams/new" className="btn btn-primary mt-5">
            <SquarePlus size={16} strokeWidth={1.75} />
            新建团队
          </Link>
        </div>
      ) : null}

      {!loading && !error && teams.length > 0 ? (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search
                size={16}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-softink"
              />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                placeholder="搜索团队名或简介"
                aria-label="搜索团队"
                className="field-input pl-9"
              />
            </div>
            <p className="caption">
              显示 {filtered.length} / {teams.length}
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className="panel mt-4 px-5 py-12 text-center text-[13px] text-softink">
              没有匹配的团队
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 min-[1100px]:grid-cols-3">
              {filtered.map((team) => (
                <Link
                  key={team.id}
                  to={`/teams/${team.id}`}
                  className="panel group flex flex-col p-5 transition-colors hover:bg-panel-2"
                >
                  <div className="flex items-start gap-3">
                    <MonogramTile label={team.name} />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-semibold">
                        {team.name}
                      </h2>
                      <p className="caption mt-1 line-clamp-2 min-h-[32px]">
                        {team.description ?? '暂无简介'}
                      </p>
                    </div>
                    <RoleChip role={team.role} />
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                    <span className="caption">
                      创建于{' '}
                      {new Date(team.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[12.5px] font-medium text-softink transition-colors group-hover:text-indigo">
                      查看团队
                      <ChevronRight size={14} strokeWidth={2} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
