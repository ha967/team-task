import { useState, type KeyboardEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { InitialsDot } from '../../../shared/ui/InitialsDot';
import { ErrorNote } from '../../../shared/ui/StateNotes';
import { formatDate } from '../../tasks/constants';
import type { Comment } from '../types';

const MAX_LENGTH = 2000;

interface CommentItemProps {
  comment: Comment;
  currentUserId: string | null;
  deleting: boolean;
  // 返回 null 表示保存成功，否则是给用户看的错误文案
  onUpdate: (commentId: string, content: string) => Promise<string | null>;
  onRequestDelete: (comment: Comment) => void;
}

export function CommentItem({
  comment,
  currentUserId,
  deleting,
  onUpdate,
  onRequestDelete,
}: CommentItemProps) {
  // 编辑态与草稿都是单条评论自己的局部状态：
  // 多条评论可以同时处于编辑态，互不影响，也不会因为切换而丢草稿
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthor = currentUserId !== null && currentUserId === comment.authorId;
  const canSave = draft.trim() !== '' && !saving;

  function startEditing() {
    setDraft(comment.content);
    setError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setDraft(comment.content);
    setError(null);
  }

  async function save() {
    if (!canSave) {
      return;
    }

    setSaving(true);
    setError(null);

    const failure = await onUpdate(comment.id, draft);
    setSaving(false);

    if (failure === null) {
      setEditing(false);
    } else {
      setError(failure);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save();
    }
  }

  return (
    <li className="flex gap-3 border-b border-line py-4 first:pt-0 last:border-b-0 last:pb-0">
      <InitialsDot name={comment.author.username} className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-semibold">
            {comment.author.username}
          </span>
          <span className="caption mono">{formatDate(comment.createdAt)}</span>

          <span className="ml-auto flex items-center gap-1">
            {isAuthor ? (
              <button
                type="button"
                className="btn-icon h-8 w-8 disabled:pointer-events-none disabled:opacity-55"
                title="编辑评论"
                aria-label="编辑评论"
                onClick={startEditing}
                disabled={editing || saving}
              >
                <Pencil size={14} strokeWidth={1.75} />
              </button>
            ) : null}
            <button
              type="button"
              className="btn-icon h-8 w-8 text-ruby hover:bg-ruby/5 hover:text-ruby disabled:pointer-events-none disabled:opacity-55"
              title="删除评论"
              aria-label="删除评论"
              onClick={() => onRequestDelete(comment)}
              disabled={deleting}
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </span>
        </div>

        {editing ? (
          <div className="mt-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              className="field-textarea"
              rows={3}
              maxLength={MAX_LENGTH}
              aria-label="编辑评论内容"
            />

            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="caption mono">
                {draft.length}/{MAX_LENGTH}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost h-8 px-3"
                  onClick={cancelEditing}
                  disabled={saving}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-primary h-8 px-3"
                  onClick={() => {
                    void save();
                  }}
                  disabled={!canSave}
                >
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </div>

            {error ? (
              <div className="mt-2">
                <ErrorNote message={error} />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-ink/90">
            {comment.content}
          </p>
        )}
      </div>
    </li>
  );
}
