export interface CommentAuthor {
  id: string;
  username: string;
}

// 与后端 COMMENT_SELECT 的 7 个键一一对应；不要加软删标记、邮箱之类的内部字段
export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor;
}

export interface CreateCommentPayload {
  content: string;
}

export interface UpdateCommentPayload {
  content: string;
}
