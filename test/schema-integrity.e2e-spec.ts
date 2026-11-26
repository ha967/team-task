import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createTestApp,
  login,
  SEED_EMAILS,
  SEED_TEAM_NAMES,
} from './utils/test-app.js';

/**
 * schema 层约束验收（对应 docs/specs/schema-integrity-fixes.md 的 AC9–AC19）。
 *
 * 验证的是「库里做得到的事交给库」：
 *   1. 邮箱/用户名唯一性只对 deleted_at IS NULL 的行生效（部分唯一索引）
 *   2. tasks.priority 有 0–3 的 CHECK 兜底
 *   3. comments.author_id 是 ON DELETE RESTRICT，删用户不连带删评论
 *
 * 用例造的数据一律带 EMAIL_PREFIX / TASK_TITLE_PREFIX 前缀，afterAll 按前缀清理，
 * 不碰 seed 的 alice / bob / carol。
 */

const EMAIL_PREFIX = 'schema-check-';
const TASK_TITLE_PREFIX = '[schema-check] ';
const OLD_PASSWORD = 'OldPassword123!';
const NEW_PASSWORD = 'NewPassword123!';
// 直接写库造的假用户不用于登录，passwordHash 随便给个非空值即可
const PLACEHOLDER_HASH = 'schema-check-placeholder-hash';

const uniqueEmail = () =>
  `${EMAIL_PREFIX}${randomUUID().replace(/-/g, '')}@example.com`;
const uniqueUsername = () =>
  `sc_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

// 期望抛错时用它取 error.code / message，比 rejects.toThrow 更容易断言到具体约束名
async function captureError(
  fn: () => Promise<unknown>,
): Promise<{ code?: string; message: string }> {
  try {
    await fn();
  } catch (error) {
    const err = error as { code?: string; message?: string };
    return { code: err.code, message: err.message ?? String(error) };
  }

  throw new Error('期望这次调用失败，但它成功了');
}

describe('schema 层约束 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let aliceToken: string;
  let taskAuthorId: string;
  let frontendTeamId: string;
  const createdTeamIds: string[] = [];

  const register = (email: string, username: string, password: string) =>
    request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, username, password });

  const createUserRow = (email: string, username: string) =>
    prisma.user.create({
      data: { email, username, passwordHash: PLACEHOLDER_HASH },
      select: { id: true },
    });

  // 软删：只置 deletedAt，不删行
  const softDeleteUser = (id: string) =>
    prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const frontend = await prisma.team.findFirst({
      where: { name: SEED_TEAM_NAMES.frontend, deletedAt: null },
      select: { id: true },
    });

    if (!frontend) {
      throw new Error('seed 数据缺失，先执行 npx prisma db seed');
    }

    frontendTeamId = frontend.id;
    aliceToken = await login(app, SEED_EMAILS.alice);

    // 直连库造的 task 用这个一次性用户当 createdBy，不冒用 seed 用户的名义；
    // 它带 EMAIL_PREFIX，afterAll 会在 task 之后清掉它（createdBy 是 Restrict，顺序不能反）
    taskAuthorId = (await createUserRow(uniqueEmail(), uniqueUsername())).id;
  });

  afterAll(async () => {
    // team_members 是 Cascade，删团队会一并清掉本轮造的成员关系
    if (createdTeamIds.length > 0) {
      await prisma.team.deleteMany({ where: { id: { in: createdTeamIds } } });
    }

    // 顺序不能反：comments.author_id 现在是 Restrict，先清评论才删得掉用户
    await prisma.comment.deleteMany({
      where: { author: { email: { startsWith: EMAIL_PREFIX } } },
    });

    await prisma.task.deleteMany({
      where: { title: { startsWith: TASK_TITLE_PREFIX } },
    });

    // refresh_tokens / team_members 是 Cascade，会一起清掉
    await prisma.user.deleteMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
    });

    await app.close();
  });

  describe('软删 × 唯一约束（部分唯一索引）', () => {
    it('AC9 两行活跃用户不能同 email —— 库层抛 P2002', async () => {
      const email = uniqueEmail();
      await createUserRow(email, uniqueUsername());

      const error = await captureError(() =>
        createUserRow(email, uniqueUsername()),
      );

      // 主断言绑错误码：Prisma 把约束名渲染成 constraint: xxx 还是 fields: (xxx)
      // 取决于 driver adapter 有没有拿到 pg 的 column_name，绑文案会随实现细节失效
      expect(error.code).toBe('P2002');
      // 宽松匹配 email：无论上面哪种渲染方式都能命中，也仍能证明是 email 那条索引在拦
      expect(error.message).toMatch(/email/i);
    });

    it('AC10 软删之后同 email 可以重新建用户', async () => {
      const email = uniqueEmail();
      const first = await createUserRow(email, uniqueUsername());
      await softDeleteUser(first.id);

      const second = await createUserRow(email, uniqueUsername());

      expect(second.id).not.toBe(first.id);
    });

    it('AC11 两行都软删时可以同 email、同 username 共存', async () => {
      const email = uniqueEmail();
      const username = uniqueUsername();

      const first = await createUserRow(email, username);
      await softDeleteUser(first.id);

      const second = await createUserRow(email, username);
      await softDeleteUser(second.id);

      const third = await createUserRow(email, username);

      expect(third.id).not.toBe(first.id);
      expect(third.id).not.toBe(second.id);
    });

    it('AC14 软删用户后，同 email + 同 username 可以通过 API 重新注册', async () => {
      const email = uniqueEmail();
      const username = uniqueUsername();

      const firstRes = await register(email, username, OLD_PASSWORD).expect(
        201,
      );
      await softDeleteUser(firstRes.body.user.id);

      const secondRes = await register(email, username, NEW_PASSWORD).expect(
        201,
      );

      expect(secondRes.body.user.id).not.toBe(firstRes.body.user.id);
      expect(secondRes.body.user.email).toBe(email);
      expect(secondRes.body.user).not.toHaveProperty('passwordHash');
      expect(secondRes.body.accessToken).toBeTruthy();
    });

    it('AC15 活跃用户占用的邮箱 → 409「该邮箱已被注册」', async () => {
      const email = uniqueEmail();
      await register(email, uniqueUsername(), OLD_PASSWORD).expect(201);

      const res = await register(email, uniqueUsername(), OLD_PASSWORD).expect(
        409,
      );

      expect(res.body.message).toBe('该邮箱已被注册');
    });

    it('AC16 活跃用户占用的用户名 → 409「该用户名已被占用」', async () => {
      const username = uniqueUsername();
      await register(uniqueEmail(), username, OLD_PASSWORD).expect(201);

      const res = await register(uniqueEmail(), username, OLD_PASSWORD).expect(
        409,
      );

      expect(res.body.message).toBe('该用户名已被占用');
    });

    it('AC17 新账号可用新密码登录；已软删的账号登录 401', async () => {
      const email = uniqueEmail();
      const username = uniqueUsername();

      const firstRes = await register(email, username, OLD_PASSWORD).expect(
        201,
      );
      // 软删前能登录 —— 这条让下面的 401 有意义
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: OLD_PASSWORD })
        .expect(200);

      await softDeleteUser(firstRes.body.user.id);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: OLD_PASSWORD })
        .expect(401);

      await register(email, username, NEW_PASSWORD).expect(201);

      // 该邮箱此刻归属新账号：新密码 200、旧密码 401
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: NEW_PASSWORD })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: OLD_PASSWORD })
        .expect(401);
    });
  });

  describe('tasks.priority 的 CHECK 约束', () => {
    it('AC12 绕过 API 直接写 priority 99 会被库层拦下；0 和 3 可以写入', async () => {
      const error = await captureError(() =>
        prisma.task.create({
          data: {
            teamId: frontendTeamId,
            title: `${TASK_TITLE_PREFIX}priority 99`,
            createdById: taskAuthorId,
            priority: 99,
          },
          select: { id: true },
        }),
      );

      expect(error.message).toContain('tasks_priority_range');

      for (const priority of [0, 3]) {
        const task = await prisma.task.create({
          data: {
            teamId: frontendTeamId,
            title: `${TASK_TITLE_PREFIX}priority ${priority}`,
            createdById: taskAuthorId,
            priority,
          },
          select: { id: true, priority: true },
        });

        expect(task.priority).toBe(priority);
      }
    });

    it('AC18 API 层 priority 越界 → 400（DTO 先挡住，请求打不到库层）', async () => {
      for (const priority of [-1, 4, 1.5]) {
        await request(app.getHttpServer())
          .post('/api/tasks')
          .set('Authorization', `Bearer ${aliceToken}`)
          .send({
            teamId: frontendTeamId,
            title: `${TASK_TITLE_PREFIX}bad priority ${priority}`,
            priority,
          })
          .expect(400);
      }
    });

    it('AC19 不传 priority 时默认 2', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          teamId: frontendTeamId,
          title: `${TASK_TITLE_PREFIX}default priority`,
        })
        .expect(201);

      expect(res.body.priority).toBe(2);
    });
  });

  describe('comments.author 的 ON DELETE RESTRICT', () => {
    it('AC13 删除有评论的用户被外键挡住，评论仍在', async () => {
      const author = await createUserRow(uniqueEmail(), uniqueUsername());

      const task = await prisma.task.create({
        data: {
          teamId: frontendTeamId,
          title: `${TASK_TITLE_PREFIX}restrict comment`,
          createdById: taskAuthorId,
        },
        select: { id: true },
      });

      const comment = await prisma.comment.create({
        data: {
          taskId: task.id,
          authorId: author.id,
          content: 'schema-check: 这条评论不能因为删作者而消失',
        },
        select: { id: true },
      });

      const error = await captureError(() =>
        prisma.user.delete({ where: { id: author.id }, select: { id: true } }),
      );

      // 同上：绑错误码 P2003（外键违反），文案只做宽松匹配
      expect(error.code).toBe('P2003');
      expect(error.message).toMatch(/author_id/);

      const stillThere = await prisma.comment.findUnique({
        where: { id: comment.id },
        select: { id: true },
      });
      expect(stillThere?.id).toBe(comment.id);
    });
  });

  describe('team_members 的活跃唯一性（部分唯一索引）', () => {
    it('AC14 同一 (team, user) 不能有两条活跃关系，离开后可以重新加入', async () => {
      const team = await prisma.team.create({
        data: {
          name: `schema-check-team-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
          createdById: taskAuthorId,
        },
        select: { id: true },
      });
      createdTeamIds.push(team.id);

      const member = await createUserRow(uniqueEmail(), uniqueUsername());

      const first = await prisma.teamMember.create({
        data: { teamId: team.id, userId: member.id, role: 'MEMBER' },
        select: { id: true },
      });

      // 同一人第二条活跃关系：由 team_members_active_key
      // （(team_id, user_id) WHERE left_at IS NULL）在库层挡下
      const error = await captureError(() =>
        prisma.teamMember.create({
          data: { teamId: team.id, userId: member.id, role: 'ADMIN' },
          select: { id: true },
        }),
      );
      expect(error.code).toBe('P2002');

      // 把第一段标记为离开后，新的一段可以正常加入：历史行与活跃行共存
      await prisma.teamMember.update({
        where: { id: first.id },
        data: { leftAt: new Date() },
        select: { id: true },
      });

      const second = await prisma.teamMember.create({
        data: { teamId: team.id, userId: member.id, role: 'MEMBER' },
        select: { id: true },
      });
      expect(second.id).not.toBe(first.id);
    });
  });
});
