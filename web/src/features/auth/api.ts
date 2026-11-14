import { apiFetch } from '../../shared/api/http';
import type { AuthResponse, LoginPayload, RegisterPayload, User } from './types';

export const authApi = {
  login(payload: LoginPayload) {
    return apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: payload,
      skipAuth: true,
    });
  },

  register(payload: RegisterPayload) {
    return apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: payload,
      skipAuth: true,
    });
  },

  logout(refreshToken: string) {
    return apiFetch<{ success: boolean }>('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
      skipAuth: true,
    });
  },

  me() {
    return apiFetch<User>('/users/me');
  },
};
