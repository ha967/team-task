import { tokenStorage } from '../../features/auth/token-storage';
import type { TokenPair } from '../../features/auth/types';
import { beginApiRequest, settleApiRequest } from './status';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown;
  headers?: Record<string, string>;
  // 登录、注册、刷新等公共接口不携带 access token，也不触发自动刷新
  skipAuth?: boolean;
}

// 多个请求同时 401 时，只发起一次刷新，其余的等同一个 Promise
let refreshPromise: Promise<boolean> | null = null;

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  beginApiRequest();
  let reachable = false;

  try {
    const result = await request<T>(path, options);
    reachable = true;
    return result;
  } catch (error) {
    // 4xx（401 除外）说明 API 是通的，只是业务拒绝（例如 403 / 404）；
    // 页面会展示具体错误，顶栏不应因此报「连接失败」。
    if (
      error instanceof ApiError &&
      error.status < 500 &&
      error.status !== 401
    ) {
      reachable = true;
    }

    throw error;
  } finally {
    settleApiRequest(reachable);
  }
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const { body, headers, skipAuth = false, ...rest } = options;

  const send = (token: string | null) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let response = await send(skipAuth ? null : tokenStorage.getAccessToken());

  if (response.status === 401 && !skipAuth && tokenStorage.getRefreshToken()) {
    refreshPromise ??= refreshTokens().finally(() => {
      refreshPromise = null;
    });

    if (await refreshPromise) {
      response = await send(tokenStorage.getAccessToken());
    }
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokenStorage.getRefreshToken();

  if (!refreshToken) {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      tokenStorage.clear();
      return false;
    }

    tokenStorage.setTokens((await response.json()) as TokenPair);
    return true;
  } catch {
    // 网络异常时保留本地令牌，下次请求还能再试
    return false;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null;

  try {
    body = await response.json();
  } catch {
    // 响应不是 JSON（例如代理返回的 HTML），保持 body 为 null
  }

  return new ApiError(
    response.status,
    extractMessage(body) ?? `请求失败（${response.status}）`,
    body,
  );
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('message' in body)) {
    return null;
  }

  const message = (body as { message: unknown }).message;

  if (Array.isArray(message)) {
    return message.join('；');
  }

  return typeof message === 'string' ? message : null;
}
