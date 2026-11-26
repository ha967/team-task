import {
  canRemoveOthers,
  canRemoveOthersAtAll,
  evaluateChangeRole,
  evaluateInvite,
  evaluateRemoveMember,
} from './team-member-permissions.js';

describe('evaluateInvite', () => {
  it('OWNER / ADMIN 可以邀请', () => {
    expect(evaluateInvite('OWNER')).toBe('ALLOW');
    expect(evaluateInvite('ADMIN')).toBe('ALLOW');
  });

  it('MEMBER 不能邀请', () => {
    expect(evaluateInvite('MEMBER')).toBe('FORBIDDEN');
  });
});

describe('evaluateChangeRole', () => {
  it('只有 OWNER 能改角色，ADMIN / MEMBER 都不行', () => {
    expect(evaluateChangeRole('ADMIN', 'MEMBER', 'ADMIN', 2)).toBe('FORBIDDEN');
    expect(evaluateChangeRole('MEMBER', 'MEMBER', 'ADMIN', 2)).toBe(
      'FORBIDDEN',
    );
  });

  it('OWNER 可以改任意非最后 OWNER 的角色', () => {
    expect(evaluateChangeRole('OWNER', 'MEMBER', 'ADMIN', 1)).toBe('ALLOW');
    expect(evaluateChangeRole('OWNER', 'ADMIN', 'MEMBER', 1)).toBe('ALLOW');
    expect(evaluateChangeRole('OWNER', 'MEMBER', 'OWNER', 1)).toBe('ALLOW');
  });

  it('不能降级最后一个活跃 OWNER', () => {
    expect(evaluateChangeRole('OWNER', 'OWNER', 'ADMIN', 1)).toBe('LAST_OWNER');
    expect(evaluateChangeRole('OWNER', 'OWNER', 'MEMBER', 1)).toBe(
      'LAST_OWNER',
    );
  });

  it('还有别的 OWNER 时可以降级', () => {
    expect(evaluateChangeRole('OWNER', 'OWNER', 'ADMIN', 2)).toBe('ALLOW');
  });

  it('把最后一个 OWNER 再设成 OWNER 是幂等，不算降级', () => {
    expect(evaluateChangeRole('OWNER', 'OWNER', 'OWNER', 1)).toBe('ALLOW');
  });
});

describe('canRemoveOthers / canRemoveOthersAtAll', () => {
  it('OWNER 可移除任意角色，ADMIN 只能移除 MEMBER', () => {
    expect(canRemoveOthers('OWNER', 'OWNER')).toBe(true);
    expect(canRemoveOthers('OWNER', 'ADMIN')).toBe(true);
    expect(canRemoveOthers('OWNER', 'MEMBER')).toBe(true);
    expect(canRemoveOthers('ADMIN', 'MEMBER')).toBe(true);
    expect(canRemoveOthers('ADMIN', 'ADMIN')).toBe(false);
    expect(canRemoveOthers('ADMIN', 'OWNER')).toBe(false);
    expect(canRemoveOthers('MEMBER', 'MEMBER')).toBe(false);
  });

  it('粗判只看角色：OWNER / ADMIN 放行，MEMBER 拦下', () => {
    expect(canRemoveOthersAtAll('OWNER')).toBe(true);
    expect(canRemoveOthersAtAll('ADMIN')).toBe(true);
    expect(canRemoveOthersAtAll('MEMBER')).toBe(false);
  });
});

describe('evaluateRemoveMember', () => {
  it('任何角色都可以退出自己（团队还有其他 OWNER 时）', () => {
    expect(evaluateRemoveMember('OWNER', 'u1', 'u1', 'OWNER', 2)).toBe('ALLOW');
    expect(evaluateRemoveMember('ADMIN', 'u1', 'u1', 'ADMIN', 1)).toBe('ALLOW');
    expect(evaluateRemoveMember('MEMBER', 'u1', 'u1', 'MEMBER', 1)).toBe(
      'ALLOW',
    );
  });

  it('最后一个 OWNER 不能退出自己', () => {
    expect(evaluateRemoveMember('OWNER', 'u1', 'u1', 'OWNER', 1)).toBe(
      'LAST_OWNER',
    );
  });

  it('OWNER 可以移除其他 MEMBER / ADMIN', () => {
    expect(evaluateRemoveMember('OWNER', 'u1', 'u2', 'MEMBER', 1)).toBe(
      'ALLOW',
    );
    expect(evaluateRemoveMember('OWNER', 'u1', 'u2', 'ADMIN', 1)).toBe('ALLOW');
  });

  it('OWNER 可以移除另一个 OWNER（只要不是最后一个）', () => {
    expect(evaluateRemoveMember('OWNER', 'u1', 'u2', 'OWNER', 2)).toBe('ALLOW');
  });

  it('ADMIN 只能移除 MEMBER', () => {
    expect(evaluateRemoveMember('ADMIN', 'u1', 'u2', 'MEMBER', 1)).toBe(
      'ALLOW',
    );
    expect(evaluateRemoveMember('ADMIN', 'u1', 'u2', 'ADMIN', 1)).toBe(
      'FORBIDDEN',
    );
    expect(evaluateRemoveMember('ADMIN', 'u1', 'u2', 'OWNER', 2)).toBe(
      'FORBIDDEN',
    );
  });

  it('MEMBER 不能移除他人', () => {
    expect(evaluateRemoveMember('MEMBER', 'u1', 'u2', 'MEMBER', 1)).toBe(
      'FORBIDDEN',
    );
    expect(evaluateRemoveMember('MEMBER', 'u1', 'u2', 'OWNER', 2)).toBe(
      'FORBIDDEN',
    );
  });
});
