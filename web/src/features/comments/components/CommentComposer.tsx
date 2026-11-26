import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { ErrorNote } from '../../../shared/ui/StateNotes';

const MAX_LENGTH = 2000;

interface CommentComposerProps {
  submitting: boolean;
  error: string | null;
  // 返回 true 表示发布成功，输入框据此清空；失败时保留草稿
  onSubmit: (content: string) => Promise<boolean>;
}

export function CommentComposer({
  submitting,
  error,
  onSubmit,
}: CommentComposerProps) {
  const [content, setContent] = useState('');
  const canSubmit = content.trim() !== '' && !submitting;

  async function submit() {
    if (!canSubmit) {
      return;
    }

    const success = await onSubmit(content);

    if (success) {
      setContent('');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form className="mt-4 border-t border-line pt-4" onSubmit={handleSubmit}>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={handleKeyDown}
        className="field-textarea"
        rows={3}
        maxLength={MAX_LENGTH}
        placeholder="写下你的评论…"
        aria-label="评论内容"
      />

      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="caption mono">
          {content.length}/{MAX_LENGTH}
        </span>
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          <Send size={15} strokeWidth={1.75} />
          {submitting ? '发布中…' : '发表评论'}
        </button>
      </div>

      {error ? (
        <div className="mt-2">
          <ErrorNote message={error} />
        </div>
      ) : null}
    </form>
  );
}
