export type ApiStatus = 'idle' | 'loading' | 'ok' | 'error';

let status: ApiStatus = 'idle';
let pending = 0;
const listeners = new Set<() => void>();

function emit(next: ApiStatus) {
  if (status === next) {
    return;
  }

  status = next;

  for (const listener of listeners) {
    listener();
  }
}

/**
 * apiFetch 的统一状态源：Topbar 的「本地已同步」不再是写死的绿点，
 * 而是跟随最近一次真实请求的结果。并发请求全部结束前保持 loading。
 */
export function beginApiRequest() {
  pending += 1;
  emit('loading');
}

export function settleApiRequest(ok: boolean) {
  pending = Math.max(0, pending - 1);

  if (!ok) {
    emit('error');
    return;
  }

  if (pending === 0) {
    emit('ok');
  }
}

export function getApiStatus() {
  return status;
}

export function subscribeApiStatus(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
