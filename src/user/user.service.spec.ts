import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  extractUniqueTargets,
  mapUniqueConflict,
  normalizeEmail,
} from './user.service.js';

/**
 * UserService 里三个纯函数的单元测试。
 *
 * 不起 Nest 应用、不连 Postgres —— 这三段逻辑以前只能靠 e2e 真撞一次唯一约束才覆盖到，
 * 撞不到就等于没测（`mapUniqueConflict` 的字段误判就是这么混过一轮审查的）。
 */

// 构造一个 P2002 错误：只要 code 和 meta 形状对得上，Prisma 不会去连库
function uniqueConflict(meta: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.1',
    meta,
  });
}

// driver adapter 透传的 pg 错误形状：字段信息藏在 constraint.index 里
function adapterHint(indexName: string, originalMessage?: string) {
  return {
    driverAdapterError: {
      cause: {
        constraint: { index: indexName },
        ...(originalMessage === undefined ? {} : { originalMessage }),
      },
    },
  };
}

describe('normalizeEmail', () => {
  it('统一转小写', () => {
    expect(normalizeEmail('Alice@Example.COM')).toBe('alice@example.com');
  });

  it('去掉首尾空白', () => {
    expect(normalizeEmail('  alice@example.com  ')).toBe('alice@example.com');
  });

  it('已经是规范形式时原样返回', () => {
    expect(normalizeEmail('alice@example.com')).toBe('alice@example.com');
  });
});

describe('extractUniqueTargets', () => {
  it('meta.target 是数组时按数组取字段', () => {
    expect(extractUniqueTargets(uniqueConflict({ target: ['email'] }))).toEqual(
      ['email'],
    );
  });

  it('meta.target 是字符串时包成数组', () => {
    expect(
      extractUniqueTargets(uniqueConflict({ target: 'username' })),
    ).toEqual(['username']);
  });

  it('driver adapter 的 constraint.index 能识别 email 部分唯一索引', () => {
    expect(
      extractUniqueTargets(
        uniqueConflict(adapterHint('users_email_active_key')),
      ),
    ).toEqual(['email']);
  });

  it('driver adapter 的 constraint.index 能识别 username 部分唯一索引', () => {
    expect(
      extractUniqueTargets(
        uniqueConflict(adapterHint('users_username_active_key')),
      ),
    ).toEqual(['username']);
  });

  // 回归用例：originalMessage 里含冲突的「值」（Key (username)=(my_email_1)），
  // 值里出现 email 字样不得把字段误判成 email —— 老实现拼了 originalMessage，这里会返回两个字段
  it('username 的值里含 email 字样时不会误判成邮箱冲突', () => {
    expect(
      extractUniqueTargets(
        uniqueConflict(
          adapterHint(
            'users_username_active_key',
            'duplicate key value violates unique constraint "users_username_active_key" Key (username)=(my_email_1)',
          ),
        ),
      ),
    ).toEqual(['username']);
  });

  it('认不出的索引名返回空数组（交给调用方给通用文案）', () => {
    expect(
      extractUniqueTargets(uniqueConflict(adapterHint('some_other_key'))),
    ).toEqual([]);
  });

  it('meta 里什么都没有时返回空数组', () => {
    expect(extractUniqueTargets(uniqueConflict({}))).toEqual([]);
  });
});

describe('mapUniqueConflict', () => {
  it('邮箱冲突 → ConflictException「该邮箱已被注册」', () => {
    const mapped = mapUniqueConflict(
      uniqueConflict(adapterHint('users_email_active_key')),
    );

    expect(mapped).toBeInstanceOf(ConflictException);
    expect((mapped as ConflictException).message).toBe('该邮箱已被注册');
  });

  it('用户名冲突 → ConflictException「该用户名已被占用」', () => {
    const mapped = mapUniqueConflict(
      uniqueConflict(adapterHint('users_username_active_key')),
    );

    expect(mapped).toBeInstanceOf(ConflictException);
    expect((mapped as ConflictException).message).toBe('该用户名已被占用');
  });

  it('字段认不出时给出通用文案「用户已存在」', () => {
    const mapped = mapUniqueConflict(uniqueConflict({}));

    expect(mapped).toBeInstanceOf(ConflictException);
    expect((mapped as ConflictException).message).toBe('用户已存在');
  });

  it('非 P2002 的 Prisma 错误原样返回', () => {
    const original = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      { code: 'P2003', clientVersion: '7.10.1', meta: {} },
    );

    expect(mapUniqueConflict(original)).toBe(original);
  });

  it('普通 Error 原样返回（不能把真实错误吞成 409）', () => {
    const original = new Error('数据库连不上');

    expect(mapUniqueConflict(original)).toBe(original);
  });
});
