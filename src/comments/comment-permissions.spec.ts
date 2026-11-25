import { canDeleteComment, canEditComment } from './comment-permissions.js';

describe('canEditComment', () => {
  it('作者本人可以编辑', () => {
    expect(canEditComment('user-1', 'user-1')).toBe(true);
  });

  it('非作者不能编辑（角色不参与这条判定，ADMIN 也不行）', () => {
    expect(canEditComment('user-1', 'user-2')).toBe(false);
  });
});

describe('canDeleteComment', () => {
  it('作者本人可以删除，无论角色', () => {
    expect(canDeleteComment('user-1', 'user-1', 'MEMBER')).toBe(true);
    expect(canDeleteComment('user-1', 'user-1', 'ADMIN')).toBe(true);
    expect(canDeleteComment('user-1', 'user-1', 'OWNER')).toBe(true);
  });

  it('OWNER / ADMIN 可以删除他人评论', () => {
    expect(canDeleteComment('user-1', 'user-2', 'ADMIN')).toBe(true);
    expect(canDeleteComment('user-1', 'user-2', 'OWNER')).toBe(true);
  });

  it('普通 MEMBER 不能删除他人评论', () => {
    expect(canDeleteComment('user-1', 'user-2', 'MEMBER')).toBe(false);
  });
});
