import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { toErrorMessage } from '../../../shared/api/error-message';

interface InviteMemberFormProps {
  // 父组件负责调接口、toast、成功后刷新；失败时把错误抛回来，由表单内联展示
  onSubmit: (email: string) => Promise<void>;
}

// 只拦「明显不是邮箱」的输入；真正的合法性以后端 @IsEmail 为准
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteMemberForm({ onSubmit }: InviteMemberFormProps) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = email.trim();

    // 浏览器原生 type=email 只管格式，空值 / 纯空格仍会进到这里；
    // 后端 @IsEmail 的英文报错不该直接给用户看，所以前端先拦明显非法的输入。
    if (trimmed === '') {
      setError('请输入邮箱');
      return;
    }

    if (!EMAIL_PATTERN.test(trimmed)) {
      setError('请输入有效的邮箱');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await onSubmit(trimmed);
      setEmail('');
    } catch (err) {
      setError(toErrorMessage(err, '邀请失败'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">成员邮箱</span>
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            placeholder="成员邮箱（已注册用户）"
            aria-label="成员邮箱"
            maxLength={255}
            className="field-input"
            disabled={submitting}
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary shrink-0"
          disabled={submitting}
        >
          <Send size={16} strokeWidth={1.75} />
          {submitting ? '邀请中…' : '邀请'}
        </button>
      </div>

      <p className="caption mt-2">
        只能邀请已注册用户；被邀请人入队角色为「成员」。
      </p>

      {error !== null ? (
        <p className="mt-2 rounded-lg border border-ruby/20 bg-ruby/5 px-3 py-2 text-[13px] text-ruby">
          {error}
        </p>
      ) : null}
    </form>
  );
}
