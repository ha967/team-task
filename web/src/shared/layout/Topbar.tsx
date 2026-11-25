import { useSyncExternalStore } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import {
  getApiStatus,
  subscribeApiStatus,
  type ApiStatus,
} from '../api/status';
import { InitialsDot } from '../ui/InitialsDot';

interface TopbarProps {
  title: string;
  subtitle: string;
}

const API_STATUS_META: Record<
  ApiStatus,
  { dot: string; label: string; title: string }
> = {
  idle: {
    dot: 'bg-softink/40',
    label: '本机 API',
    title: '数据来自本机 API 服务',
  },
  loading: {
    dot: 'bg-amber',
    label: '同步中…',
    title: '正在请求本机 API',
  },
  ok: {
    dot: 'bg-good',
    label: '本机 API 已连接',
    title: '最近一次请求已完成',
  },
  error: {
    dot: 'bg-ruby',
    label: '同步失败',
    title: '最近一次请求失败，请检查 API 是否在运行',
  },
};

export function Topbar({ title, subtitle }: TopbarProps) {
  const { user, logout } = useAuth();
  const apiStatus = useSyncExternalStore(subscribeApiStatus, getApiStatus);
  const status = API_STATUS_META[apiStatus];

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line bg-panel px-5 nav:px-8">
      <div className="min-w-0">
        <p className="truncate text-base font-semibold leading-tight">
          {title}
        </p>
        <p className="truncate text-[13px] leading-tight text-softink">
          {subtitle}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <span
          className="hidden items-center gap-1.5 text-[12.5px] text-softink sm:inline-flex"
          title={status.title}
        >
          <span className={`h-2 w-2 rounded-full ${status.dot}`} />
          {status.label}
        </span>

        <span className="hidden h-5 w-px bg-line sm:block" />

        <span className="hidden items-center gap-2 sm:flex">
          <InitialsDot name={user?.username ?? null} />
          <span className="text-[13px] font-medium">
            {user?.username ?? '未登录'}
          </span>
        </span>

        <button
          type="button"
          className="btn btn-ghost px-2.5"
          onClick={() => {
            void logout();
          }}
          title="退出登录"
        >
          <LogOut size={16} strokeWidth={1.75} />
          <span className="hidden sm:inline">退出</span>
        </button>
      </div>
    </header>
  );
}
