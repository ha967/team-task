import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  SquarePlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { InitialsDot } from '../ui/InitialsDot';
import { Wordmark } from './Wordmark';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/tasks', label: '概览', icon: LayoutDashboard, end: true },
  // 不设 end：/teams/new 与 /teams/:teamId 也要保持「团队」高亮
  { to: '/teams', label: '团队', icon: Users },
  { to: '/tasks/new', label: '新建任务', icon: SquarePlus, end: true },
];

const COLLAPSE_KEY = 'team-task.sidebar-collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      // 隐私模式下 localStorage 可能不可写，收起状态退化为仅本次会话
    }
  }, [collapsed]);

  return { collapsed, setCollapsed };
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuth();

  return (
    <aside
      style={{ width: collapsed ? 64 : 232 }}
      className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-panel transition-[width] duration-200 nav:flex"
    >
      <Wordmark collapsed={collapsed} />

      <nav className="flex flex-col gap-1 px-2 pt-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? 'bg-indigo-mist text-indigo'
                  : 'text-softink hover:bg-panel-2 hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-indigo transition-opacity ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <Icon size={18} strokeWidth={1.75} className="shrink-0" />
                {collapsed ? null : <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-line p-2.5">
        <div
          className={`flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <InitialsDot name={user?.username ?? null} />
          {collapsed ? null : (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight">
                {user?.username ?? '未登录'}
              </p>
              <p className="truncate text-[11px] leading-tight text-softink">
                {user?.email ?? ''}
              </p>
            </div>
          )}
          {collapsed ? null : (
            <button
              type="button"
              className="btn-icon"
              title="退出登录"
              onClick={() => {
                void logout();
              }}
            >
              <LogOut size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>

        {collapsed ? (
          <button
            type="button"
            className="btn-icon mx-auto mt-1"
            title="退出登录"
            onClick={() => {
              void logout();
            }}
          >
            <LogOut size={16} strokeWidth={1.75} />
          </button>
        ) : (
          <a
            href="https://vibefather.ai/t/e-commerce-admin-dashboard"
            target="_blank"
            rel="noreferrer"
            className="mt-1 block px-1.5 text-[10px] leading-4 text-softink/75 transition-colors hover:text-softink"
          >
            Built with a VibeFather template
          </a>
        )}

        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? '展开侧栏' : '收起侧栏'}
          className={`mt-1.5 flex h-8 w-full items-center gap-2 rounded-lg px-1.5 text-[12px] text-softink transition-colors hover:bg-panel-2 hover:text-ink ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} strokeWidth={1.75} />
          ) : (
            <>
              <PanelLeftClose size={16} strokeWidth={1.75} />
              <span>收起侧栏</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

// 900px 以下侧栏变成底部图标条
export function MobileNav() {
  const { logout } = useAuth();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] nav:hidden">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
              isActive ? 'text-indigo' : 'text-softink'
            }`
          }
        >
          <Icon size={20} strokeWidth={1.75} />
          {label}
        </NavLink>
      ))}
      <button
        type="button"
        onClick={() => {
          void logout();
        }}
        className="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-softink"
      >
        <LogOut size={20} strokeWidth={1.75} />
        退出
      </button>
    </nav>
  );
}
