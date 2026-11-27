import { ApiError } from './http';

/**
 * 把未知错误转成可直接渲染的中文文案。
 *
 * ApiError 是后端业务错误，message 已经是中文，直接用；
 * 网络层失败时 fetch 抛的是 `TypeError: Failed to fetch`，不能把它的英文原文给用户。
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
