import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await register({ email, username, password });
      navigate('/tasks', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-ground px-5 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-indigo-mist/80 to-transparent"
      />

      <div className="relative w-full max-w-[400px]">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-indigo">
            <span className="flex flex-col items-start gap-[3px]">
              <span className="h-[3px] w-5 rounded-full bg-white" />
              <span className="h-[3px] w-3.5 rounded-full bg-white" />
              <span className="h-[3px] w-2.5 rounded-full bg-white" />
            </span>
          </span>
          <div>
            <p className="text-[19px] font-semibold leading-tight">任务台</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-softink">
              TASK ADMIN
            </p>
          </div>
        </div>

        <form
          className="panel mt-6 p-6 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_12px_32px_rgb(16_24_40/0.06)]"
          onSubmit={handleSubmit}
        >
          <h1 className="text-xl font-semibold">注册</h1>
          <p className="caption mt-1">创建一个账号，加入你的团队。</p>

          <div className="mt-5 flex flex-col gap-4">
            <label className="block">
              <span className="field-label">邮箱</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field-input"
                required
              />
            </label>

            <label className="block">
              <span className="field-label">用户名</span>
              <input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="field-input"
                minLength={3}
                maxLength={32}
                pattern="[a-zA-Z0-9_]+"
                title="只能包含字母、数字和下划线"
                required
              />
              <span className="caption mt-1 block">
                3–32 位，只能包含字母、数字和下划线。
              </span>
            </label>

            <label className="block">
              <span className="field-label">密码</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="field-input"
                minLength={8}
                maxLength={72}
                required
              />
              <span className="caption mt-1 block">至少 8 位。</span>
            </label>

            {error ? (
              <p className="rounded-lg border border-ruby/20 bg-ruby/5 px-3 py-2 text-[13px] leading-5 text-ruby">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={submitting}
            >
              {submitting ? '注册中…' : '注册'}
            </button>
          </div>

          <p className="mt-4 text-center text-[13px] text-softink">
            已有账号？{' '}
            <Link
              to="/login"
              className="font-medium text-indigo transition-colors hover:text-indigo-deep"
            >
              去登录
            </Link>
          </p>
        </form>

        <p className="mt-5 text-center text-[10px] text-softink/75">
          <a
            href="https://vibefather.ai/t/e-commerce-admin-dashboard"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-softink"
          >
            Built with a VibeFather template
          </a>
        </p>
      </div>
    </div>
  );
}
