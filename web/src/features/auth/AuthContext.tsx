import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from './api';
import { tokenStorage } from './token-storage';
import type { AuthResponse, LoginPayload, RegisterPayload, User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 页面刷新后 access token 已经丢失，用 refresh token 恢复会话
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!tokenStorage.getRefreshToken()) {
        setLoading(false);
        return;
      }

      try {
        // 第一次请求会 401，apiFetch 内部会自动刷新并重试
        const me = await authApi.me();

        if (!cancelled) {
          setUser(me);
        }
      } catch {
        tokenStorage.clear();
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    applyAuthResult(await authApi.login(payload), setUser);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    applyAuthResult(await authApi.register(payload), setUser);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokenStorage.getRefreshToken();

    // 先清本地状态再发请求：即使网络失败，用户也已经登出
    tokenStorage.clear();
    setUser(null);

    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // 登出是幂等的，忽略网络错误
      }
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用');
  }

  return context;
}

function applyAuthResult(result: AuthResponse, setUser: (user: User) => void) {
  tokenStorage.setTokens({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
  setUser(result.user);
}
