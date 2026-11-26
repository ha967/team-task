import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/http';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { ErrorNote, LoadingState } from '../../../shared/ui/StateNotes';
import { useToast } from '../../../shared/ui/Toast';
import { useAuth } from '../../auth/AuthContext';
import { commentsApi } from '../api';
import type { Comment } from '../types';
import { CommentComposer } from './CommentComposer';
import { CommentItem } from './CommentItem';

interface CommentSectionProps {
  taskId: string;
}

// 网络层失败时 fetch 抛的是 TypeError（英文），不能把 message 直接透给用户；
// 只有后端返回的 ApiError.message 才是可展示的业务文案
function toUserMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function CommentSection({ taskId }: CommentSectionProps) {
  const { user } = useAuth();
  const toast = useToast();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 初次加载与增删改后的静默刷新可能并发：只认最后一次请求的结果，
  // 否则旧快照会把刚发布的评论覆盖掉
  const requestSeq = useRef(0);
  const loadingSeq = useRef(0);

  const loadComments = useCallback(
    async (silent = false) => {
      const seq = requestSeq.current + 1;
      requestSeq.current = seq;

      if (!silent) {
        loadingSeq.current = seq;
        setLoading(true);
      }

      try {
        const next = await commentsApi.list(taskId);

        if (seq !== requestSeq.current) {
          return;
        }

        setComments(next);
        setError(null);
      } catch (err) {
        if (seq !== requestSeq.current) {
          return;
        }

        const message = toUserMessage(err, '网络异常，请稍后重试');

        // 静默刷新失败时保留已有 error：初次加载失败后不能因为一次静默刷新
        // 失败就退化成「还没有评论」的空态
        if (silent) {
          toast(message, 'error');
        } else {
          setError(message);
        }
      } finally {
        if (!silent && loadingSeq.current === seq) {
          setLoading(false);
        }
      }
    },
    [taskId, toast],
  );

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  async function handleCreate(content: string): Promise<boolean> {
    setSubmitError(null);
    setSubmitting(true);

    try {
      await commentsApi.create(taskId, { content });
      toast('评论已发布', 'success');
      await loadComments(true);
      return true;
    } catch (err) {
      setSubmitError(toUserMessage(err, '评论发布失败，请稍后重试'));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(
    commentId: string,
    content: string,
  ): Promise<string | null> {
    try {
      await commentsApi.update(commentId, { content });
      toast('评论已更新', 'success');
      await loadComments(true);
      return null;
    } catch (err) {
      return toUserMessage(err, '评论更新失败，请稍后重试');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    const target = deleteTarget;
    setDeleteTarget(null);
    setDeleting(true);

    try {
      await commentsApi.remove(target.id);
      toast('评论已删除', 'info');
      await loadComments(true);
    } catch (err) {
      // 普通 MEMBER 删他人评论会在这里收到 403「无权删除该评论」
      toast(toUserMessage(err, '删除失败，请稍后重试'), 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="panel mt-5 p-5 sm:p-6">
      <h2 className="text-base font-semibold">
        评论
        {!loading && error === null ? (
          <span className="caption ml-1.5">· {comments.length}</span>
        ) : null}
      </h2>

      {loading ? (
        <div className="mt-4">
          <LoadingState label="正在读取评论…" bare />
        </div>
      ) : error !== null ? (
        <div className="mt-4">
          <ErrorNote message={error} />
          <button
            type="button"
            className="btn btn-ghost mt-3"
            onClick={() => {
              void loadComments();
            }}
          >
            重试
          </button>
        </div>
      ) : comments.length === 0 ? (
        <p className="caption mt-4 rounded-lg bg-panel-2 px-3 py-4 text-center">
          还没有评论，来说两句吧。
        </p>
      ) : (
        <ul className="mt-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={user?.id ?? null}
              deleting={deleting}
              onUpdate={handleUpdate}
              onRequestDelete={(target) => {
                setDeleteTarget(target);
              }}
            />
          ))}
        </ul>
      )}

      <CommentComposer
        submitting={submitting}
        error={submitError}
        onSubmit={handleCreate}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除这条评论？"
        description="删除后评论将从列表中消失，且暂不支持恢复。"
        confirmLabel="确认删除"
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />
    </section>
  );
}
