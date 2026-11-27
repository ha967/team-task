import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { toErrorMessage } from '../../../shared/api/error-message';
import { useToast } from '../../../shared/ui/Toast';
import { teamsApi } from '../api';

export function TeamCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();

    // <input required> 只拦空串，纯空格算「有值」；后端 DTO 会回 400，前端先挡更直观
    if (trimmedName === '') {
      setLocalError('团队名称不能为空');
      return;
    }

    setLocalError(null);
    setError(null);
    setSubmitting(true);

    try {
      const team = await teamsApi.create({
        name: trimmedName,
        description: description.trim() === '' ? null : description.trim(),
      });

      toast(`已创建「${team.name}」`);
      navigate(`/teams/${team.id}`, { replace: true });
    } catch (err) {
      setError(toErrorMessage(err, '创建团队失败'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <Link
        to="/teams"
        className="inline-flex items-center gap-1 text-[13px] text-softink transition-colors hover:text-ink"
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
        返回团队列表
      </Link>

      <div className="mt-3">
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">新建团队</h1>
        <p className="mt-1 text-[13px] text-softink">
          创建后你将成为该团队的所有者，可以邀请成员一起协作。
        </p>
      </div>

      <form className="panel mt-5 p-5 sm:p-6" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="field-label">团队名称</span>
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              className="field-input"
              maxLength={64}
              placeholder="例如：Frontend Platform"
              required
              autoFocus
            />
          </label>

          <label className="block">
            <span className="field-label">简介（可选）</span>
            <textarea
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
              className="field-textarea"
              maxLength={500}
              rows={4}
              placeholder="这个团队负责什么？"
            />
          </label>
        </div>

        {(localError ?? error) !== null ? (
          <p className="mt-4 rounded-lg border border-ruby/20 bg-ruby/5 px-3 py-2 text-[13px] text-ruby">
            {localError ?? error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-4">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate('/teams')}
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? '创建中…' : '创建团队'}
          </button>
        </div>
      </form>
    </div>
  );
}
