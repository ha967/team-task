import type { TokenPair } from './types';

const REFRESH_TOKEN_KEY = 'team-task.refresh-token';

// access token 只放在内存里：页面刷新后需要重新用 refresh token 换取，
// 这样即使发生 XSS，攻击者也拿不到长效凭证。
// refresh token 放 localStorage 只是为了让刷新页面后还能恢复会话；
// 生产环境更稳妥的做法是 httpOnly + Secure cookie，并配合 CSRF 防护。
let accessToken: string | null = null;

export const tokenStorage = {
  getAccessToken(): string | null {
    return accessToken;
  },

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  setTokens(tokens: TokenPair) {
    accessToken = tokens.accessToken;
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  },

  clear() {
    accessToken = null;
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};
