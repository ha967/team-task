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
 * 团队成员管理验收（对应 docs/specs/team-member-management.md 的 AC1–AC36）。
 *
 * 关键约定：
 * - 每个用例自建团队，afterAll 删团队（team_members 是 Cascade），不碰 seed 的
 *   Frontend Platform / Mobile App 成员关系，避免重复运行互相污染。
 * - 邀请 / 移除会保留 leftAt 历史行，所以清理只按团队删，不按成员删。
 */

const PLACEHOLDER_HASH = 'team-member-e2e-placeholder-hash';

describe('团队成员管理 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let aliceToken: string;
  let bobToken: string;
  let carolToken: string;
  let aliceUserId: string;
  let bobUserId: string;
  let carolUserId: string;

  const createdTeamIds: string[] = [];
  const ghostUserIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createTeam = async (
    token: string,
    name = `成员测试-${randomUUID().slice(0, 8)}`,
  ) => {
    const res = await request(app.getHttpServer())
      .post('/api/teams')
      .set(auth(token))
      .send({ name })
      .expect(201);

    createdTeamIds.push(res.body.id as string);

    return res.body.id as string;
  };

  // alice 通过接口建团队自动成为 OWNER；bob / carol 直接写库加入，
  // joinedAt 故意错开，供 AC36 断言排序
  const createTeamWithMembers = async () => {
    const teamId = await createTeam(aliceToken);

    await prisma.teamMember.create({
      data: {
        teamId,
        userId: bobUserId,
        role: 'ADMIN',
        joinedAt: new Date(Date.now() - 2000),
      },
      select: { id: true },
    });

    await prisma.teamMember.create({
      data: {
        teamId,
        userId: carolUserId,
        role: 'MEMBER',
        joinedAt: new Date(Date.now() - 1000),
      },
      select: { id: true },
    });

    return teamId;
  };

  const createGhostUser = async (options?: { softDeleted?: boolean }) => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const user = await prisma.user.create({
      data: {
        username: `member-${suffix}`,
        email: `member-${suffix}@example.com`,
        passwordHash: PLACEHOLDER_HASH,
        ...(options?.softDeleted ? { deletedAt: new Date() } : {}),
      },
      select: { id: true, email: true },
    });

    ghostUserIds.push(user.id);

    return user;
  };

  const invite = (
    teamId: string,
    token: string,
    body: Record<string, unknown>,
  ) =>
    request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set(auth(token))
      .send(body);

  const changeRole = (
    teamId: string,
    token: string,
    userId: string,
    body: Record<string, unknown>,
  ) =>
    request(app.getHttpServer())
      .patch(`/api/teams/${teamId}/members/${userId}`)
      .set(auth(token))
      .send(body);

  const removeMember = (teamId: string, token: string, userId: string) =>
    request(app.getHttpServer())
      .delete(`/api/teams/${teamId}/members/${userId}`)
      .set(auth(token));

  const getTeam = (teamId: string, token: string) =>
    request(app.getHttpServer()).get(`/api/teams/${teamId}`).set(auth(token));

  const countActiveOwners = (teamId: string) =>
    prisma.teamMember.count({
      where: { teamId, role: 'OWNER', leftAt: null },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const [alice, bob, carol] = await Promise.all(
      [SEED_EMAILS.alice, SEED_EMAILS.bob, SEED_EMAILS.carol].map((email) =>
        prisma.user.findFirst({
          where: { email, deletedAt: null },
          select: { id: true },
        }),
      ),
    );

    if (!alice || !bob || !carol) {
      throw new Error('seed 数据缺失，先执行 npx prisma db seed');
    }

    aliceUserId = alice.id;
    bobUserId = bob.id;
    carolUserId = carol.id;

    [aliceToken, bobToken, carolToken] = await Promise.all([
      login(app, SEED_EMAILS.alice),
      login(app, SEED_EMAILS.bob),
      login(app, SEED_EMAILS.carol),
    ]);
  });

  afterAll(async () => {
    if (createdTeamIds.length > 0) {
      // 任务 / 评论 / 成员关系都是 Cascade，一并清掉
      await prisma.team.deleteMany({
        where: { id: { in: createdTeamIds } },
      });
    }

    if (ghostUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: ghostUserIds } } });
    }

    await app.close();
  });

  describe('鉴权', () => {
    it('AC1 未登录访问三个成员接口都返回 401', async () => {
      const teamId = randomUUID();
      const userId = randomUUID();

      await request(app.getHttpServer())
        .post(`/api/teams/${teamId}/members`)
        .send({ email: 'x@example.com' })
        .expect(401);

      await request(app.getHttpServer())
        .patch(`/api/teams/${teamId}/members/${userId}`)
        .send({ role: 'ADMIN' })
        .expect(401);

      await request(app.getHttpServer())
        .delete(`/api/teams/${teamId}/members/${userId}`)
        .expect(401);
    });
  });

  describe('邀请 POST /api/teams/:teamId/members', () => {
    it('AC2/AC3 OWNER 邀请成功：返回成员视图，库里是活跃行，详情可见', async () => {
      const teamId = await createTeamWithMembers();
      const ghost = await createGhostUser();

      const res = await invite(teamId, aliceToken, {
        email: ghost.email,
      }).expect(201);

      expect(Object.keys(res.body).sort()).toEqual([
        'avatarUrl',
        'joinedAt',
        'role',
        'userId',
        'username',
      ]);
      expect(res.body.userId).toBe(ghost.id);
      expect(res.body.role).toBe('MEMBER');

      const row = await prisma.teamMember.findFirst({
        where: { teamId, userId: ghost.id, leftAt: null },
        select: { id: true },
      });
      expect(row).not.toBeNull();

      const detail = await getTeam(teamId, aliceToken).expect(200);
      expect(
        detail.body.members.map((member: { userId: string }) => member.userId),
      ).toContain(ghost.id);
    });

    it('AC4 ADMIN 邀请成功，入队角色固定 MEMBER', async () => {
      const teamId = await createTeamWithMembers();
      const ghost = await createGhostUser();

      const res = await invite(teamId, bobToken, {
        email: ghost.email,
      }).expect(201);

      expect(res.body.userId).toBe(ghost.id);
      expect(res.body.role).toBe('MEMBER');
    });

    it('AC5 MEMBER 邀请返回 403', async () => {
      const teamId = await createTeamWithMembers();
      const ghost = await createGhostUser();

      const res = await invite(teamId, carolToken, {
        email: ghost.email,
      }).expect(403);

      expect(res.body.message).toBe('无权邀请成员');
    });

    it('AC6 非成员邀请返回 403', async () => {
      const teamId = await createTeam(bobToken);
      const ghost = await createGhostUser();

      const res = await invite(teamId, aliceToken, {
        email: ghost.email,
      }).expect(403);

      expect(res.body.message).toBe('你不是该团队成员');
    });

    it('AC7 邮箱不存在返回 404', async () => {
      const teamId = await createTeamWithMembers();

      const res = await invite(teamId, aliceToken, {
        email: `nobody-${randomUUID()}@example.com`,
      }).expect(404);

      expect(res.body.message).toBe('用户不存在');
    });

    it('AC8 已是活跃成员返回 409', async () => {
      const teamId = await createTeamWithMembers();

      const res = await invite(teamId, aliceToken, {
        email: SEED_EMAILS.bob,
      }).expect(409);

      expect(res.body.message).toBe('该用户已是团队成员');
    });

    it('AC9 邮箱大小写 / 空格变体同样命中 409（归一化生效）', async () => {
      const teamId = await createTeamWithMembers();

      const res = await invite(teamId, aliceToken, {
        email: '  BOB@EXAMPLE.COM  ',
      }).expect(409);

      expect(res.body.message).toBe('该用户已是团队成员');
    });

    it('AC10 软删用户的邮箱返回 404', async () => {
      const teamId = await createTeamWithMembers();
      const ghost = await createGhostUser({ softDeleted: true });

      const res = await invite(teamId, aliceToken, {
        email: ghost.email,
      }).expect(404);

      expect(res.body.message).toBe('用户不存在');
    });

    it('AC11 缺 email / 非邮箱 / 未声明字段 / 非 UUID teamId 都返回 400', async () => {
      const teamId = await createTeamWithMembers();

      await invite(teamId, aliceToken, {}).expect(400);
      await invite(teamId, aliceToken, { email: 'not-an-email' }).expect(400);
      await invite(teamId, aliceToken, {
        email: `x-${randomUUID()}@example.com`,
        role: 'ADMIN',
      }).expect(400);

      await request(app.getHttpServer())
        .post('/api/teams/not-a-uuid/members')
        .set(auth(aliceToken))
        .send({ email: 'x@example.com' })
        .expect(400);
    });

    it('AC12 不存在 / 已软删的团队返回 404', async () => {
      const ghost = await createGhostUser();

      const missing = await invite(randomUUID(), aliceToken, {
        email: ghost.email,
      }).expect(404);
      expect(missing.body.message).toBe('团队不存在');

      const teamId = await createTeamWithMembers();
      await prisma.team.update({
        where: { id: teamId },
        data: { deletedAt: new Date() },
        select: { id: true },
      });

      const deleted = await invite(teamId, aliceToken, {
        email: ghost.email,
      }).expect(404);
      expect(deleted.body.message).toBe('团队不存在');
    });

    it('AC13 退出后重新邀请：新建一行，旧行保留 leftAt', async () => {
      const teamId = await createTeamWithMembers();
      const ghost = await createGhostUser();

      await invite(teamId, aliceToken, { email: ghost.email }).expect(201);
      await removeMember(teamId, aliceToken, ghost.id).expect(200);

      // 让两段 joinedAt 明确拉开，避免毫秒级并列
      await new Promise((resolve) => setTimeout(resolve, 10));

      const reinvited = await invite(teamId, aliceToken, {
        email: ghost.email,
      }).expect(201);
      expect(reinvited.body.userId).toBe(ghost.id);

      const rows = await prisma.teamMember.findMany({
        where: { teamId, userId: ghost.id },
        orderBy: { joinedAt: 'asc' },
        select: { joinedAt: true, leftAt: true },
      });

      expect(rows).toHaveLength(2);
      expect(rows[0].leftAt).not.toBeNull();
      expect(rows[1].leftAt).toBeNull();
      expect(rows[1].joinedAt.getTime()).toBeGreaterThan(
        rows[0].joinedAt.getTime(),
      );
    });

    // getTeams 的「我在此团队的角色」子查询是独立的一次过滤：只验证库里有两条行，
    // 不能证明列表取到的是新角色。先用 ADMIN 身份留下旧历史行，再以 MEMBER 重新加入，
    // 如果子查询漏掉 leftAt: null，members[0] 可能取到旧的 ADMIN 行，这条就会红。
    it('AC13 重新加入后，GET /api/teams 返回新角色而不是历史行旧角色', async () => {
      const teamId = await createTeamWithMembers();

      await changeRole(teamId, aliceToken, carolUserId, {
        role: 'ADMIN',
      }).expect(200);
      await removeMember(teamId, aliceToken, carolUserId).expect(200);
      await invite(teamId, aliceToken, { email: SEED_EMAILS.carol }).expect(
        201,
      );

      const list = await request(app.getHttpServer())
        .get('/api/teams')
        .set(auth(carolToken))
        .expect(200);

      const team = list.body.items.find(
        (item: { id: string }) => item.id === teamId,
      );
      expect(team).toBeTruthy();
      expect(team.role).toBe('MEMBER');
    });
  });

  describe('改角色 PATCH /api/teams/:teamId/members/:userId', () => {
    it('AC15 OWNER 把 MEMBER 改成 ADMIN', async () => {
      const teamId = await createTeamWithMembers();

      const res = await changeRole(teamId, aliceToken, carolUserId, {
        role: 'ADMIN',
      }).expect(200);

      expect(res.body.role).toBe('ADMIN');

      const row = await prisma.teamMember.findFirst({
        where: { teamId, userId: carolUserId, leftAt: null },
        select: { role: true },
      });
      expect(row?.role).toBe('ADMIN');
    });

    it('AC16 OWNER 可以把成员提升为 OWNER，活跃 OWNER 变 2', async () => {
      const teamId = await createTeamWithMembers();

      await changeRole(teamId, aliceToken, carolUserId, {
        role: 'OWNER',
      }).expect(200);

      await expect(countActiveOwners(teamId)).resolves.toBe(2);
    });

    it('AC17 ADMIN 改角色返回 403', async () => {
      const teamId = await createTeamWithMembers();

      const res = await changeRole(teamId, bobToken, carolUserId, {
        role: 'ADMIN',
      }).expect(403);

      expect(res.body.message).toBe('无权修改成员角色');
    });

    it('AC18 MEMBER 改角色返回 403', async () => {
      const teamId = await createTeamWithMembers();

      const res = await changeRole(teamId, carolToken, bobUserId, {
        role: 'MEMBER',
      }).expect(403);

      expect(res.body.message).toBe('无权修改成员角色');
    });

    it('AC19 不能降级最后一个 OWNER', async () => {
      const teamId = await createTeamWithMembers();

      const res = await changeRole(teamId, aliceToken, aliceUserId, {
        role: 'ADMIN',
      }).expect(409);

      expect(res.body.message).toBe('不能降级团队最后一个 OWNER');

      const row = await prisma.teamMember.findFirst({
        where: { teamId, userId: aliceUserId, leftAt: null },
        select: { role: true },
      });
      expect(row?.role).toBe('OWNER');
    });

    it('AC20 目标不是活跃成员返回 404', async () => {
      const teamId = await createTeamWithMembers();

      const res = await changeRole(teamId, aliceToken, randomUUID(), {
        role: 'ADMIN',
      }).expect(404);

      expect(res.body.message).toBe('成员不存在');
    });

    it('AC21 非法 role / 未声明字段 / 非 UUID userId 都返回 400', async () => {
      const teamId = await createTeamWithMembers();

      await changeRole(teamId, aliceToken, carolUserId, {
        role: 'SUPER',
      }).expect(400);
      await changeRole(teamId, aliceToken, carolUserId, {
        role: 'ADMIN',
        foo: 'bar',
      }).expect(400);

      await request(app.getHttpServer())
        .patch(`/api/teams/${teamId}/members/not-a-uuid`)
        .set(auth(aliceToken))
        .send({ role: 'ADMIN' })
        .expect(400);
    });

    it('AC22 设置成当前角色是幂等的 200', async () => {
      const teamId = await createTeamWithMembers();

      const res = await changeRole(teamId, aliceToken, carolUserId, {
        role: 'MEMBER',
      }).expect(200);

      expect(res.body.role).toBe('MEMBER');
    });

    it('AC23 非成员改角色返回 403', async () => {
      const teamId = await createTeam(bobToken);

      const res = await changeRole(teamId, aliceToken, bobUserId, {
        role: 'ADMIN',
      }).expect(403);

      expect(res.body.message).toBe('你不是该团队成员');
    });
  });

  describe('移除 / 退出 DELETE /api/teams/:teamId/members/:userId', () => {
    it('AC24 OWNER 移除 MEMBER：行保留 leftAt，权限立即失效', async () => {
      const teamId = await createTeamWithMembers();

      const res = await removeMember(teamId, aliceToken, carolUserId).expect(
        200,
      );
      expect(res.body).toEqual({ userId: carolUserId, left: true });

      const row = await prisma.teamMember.findFirst({
        where: { teamId, userId: carolUserId },
        select: { id: true, leftAt: true },
      });
      expect(row).not.toBeNull();
      expect(row?.leftAt).not.toBeNull();

      const detail = await getTeam(teamId, aliceToken).expect(200);
      expect(
        detail.body.members.map((member: { userId: string }) => member.userId),
      ).not.toContain(carolUserId);

      const list = await request(app.getHttpServer())
        .get('/api/teams')
        .set(auth(carolToken))
        .expect(200);
      expect(
        list.body.items.map((team: { id: string }) => team.id),
      ).not.toContain(teamId);

      await getTeam(teamId, carolToken).expect(403);
    });

    it('AC25 ADMIN 可以移除 MEMBER', async () => {
      const teamId = await createTeamWithMembers();

      await removeMember(teamId, bobToken, carolUserId).expect(200);
    });

    it('AC26 ADMIN 不能移除 OWNER', async () => {
      const teamId = await createTeamWithMembers();

      const res = await removeMember(teamId, bobToken, aliceUserId).expect(403);

      expect(res.body.message).toBe('无权移除该成员');
    });

    it('AC27 ADMIN 不能移除另一个 ADMIN', async () => {
      const teamId = await createTeamWithMembers();

      await changeRole(teamId, aliceToken, carolUserId, {
        role: 'ADMIN',
      }).expect(200);

      const res = await removeMember(teamId, bobToken, carolUserId).expect(403);

      expect(res.body.message).toBe('无权移除该成员');
    });

    it('AC28 MEMBER 不能移除他人', async () => {
      const teamId = await createTeamWithMembers();

      const res = await removeMember(teamId, carolToken, bobUserId).expect(403);

      expect(res.body.message).toBe('无权移除该成员');
    });

    it('AC29 MEMBER 可以退出自己，随后失去访问权', async () => {
      const teamId = await createTeamWithMembers();

      await removeMember(teamId, carolToken, carolUserId).expect(200);

      await getTeam(teamId, carolToken).expect(403);
    });

    it('AC30 最后一个 OWNER 不能退出自己', async () => {
      const teamId = await createTeamWithMembers();

      const res = await removeMember(teamId, aliceToken, aliceUserId).expect(
        409,
      );

      expect(res.body.message).toBe('不能移除团队最后一个 OWNER');

      const row = await prisma.teamMember.findFirst({
        where: { teamId, userId: aliceUserId },
        select: { leftAt: true },
      });
      expect(row?.leftAt).toBeNull();
    });

    it('AC31 有两个 OWNER 时，其中一个可以退出', async () => {
      const teamId = await createTeamWithMembers();

      await changeRole(teamId, aliceToken, carolUserId, {
        role: 'OWNER',
      }).expect(200);

      await removeMember(teamId, aliceToken, aliceUserId).expect(200);

      await expect(countActiveOwners(teamId)).resolves.toBe(1);
    });

    it('AC32 对同一人第二次 DELETE 返回 404', async () => {
      const teamId = await createTeamWithMembers();

      await removeMember(teamId, aliceToken, carolUserId).expect(200);

      const res = await removeMember(teamId, aliceToken, carolUserId).expect(
        404,
      );

      expect(res.body.message).toBe('成员不存在');
    });

    it('AC33 非成员移除他人 / 自己都返回 403', async () => {
      const teamId = await createTeam(bobToken);

      const other = await removeMember(teamId, aliceToken, bobUserId).expect(
        403,
      );
      expect(other.body.message).toBe('你不是该团队成员');

      await removeMember(teamId, aliceToken, aliceUserId).expect(403);
    });

    it('AC34 软删团队上的成员操作返回 404', async () => {
      const teamId = await createTeamWithMembers();

      await prisma.team.update({
        where: { id: teamId },
        data: { deletedAt: new Date() },
        select: { id: true },
      });

      const removed = await removeMember(
        teamId,
        aliceToken,
        carolUserId,
      ).expect(404);
      expect(removed.body.message).toBe('团队不存在');

      const invited = await invite(teamId, aliceToken, {
        email: SEED_EMAILS.bob,
      }).expect(404);
      expect(invited.body.message).toBe('团队不存在');

      const patched = await changeRole(teamId, aliceToken, carolUserId, {
        role: 'ADMIN',
      }).expect(404);
      expect(patched.body.message).toBe('团队不存在');
    });

    it('AC35 离开者在原团队的任务 / 评论链路全部被拒', async () => {
      const teamId = await createTeamWithMembers();

      const created = await request(app.getHttpServer())
        .post('/api/tasks')
        .set(auth(aliceToken))
        .send({ teamId, title: '成员离开后的任务权限' })
        .expect(201);
      const taskId = created.body.id as string;

      await removeMember(teamId, aliceToken, carolUserId).expect(200);

      const list = await request(app.getHttpServer())
        .get('/api/tasks')
        .set(auth(carolToken))
        .expect(200);
      expect(
        list.body.items.map((task: { id: string }) => task.id),
      ).not.toContain(taskId);

      await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}/comments`)
        .set(auth(carolToken))
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/tasks')
        .set(auth(carolToken))
        .send({ teamId, title: '离开后不该能建' })
        .expect(403);
    });

    it('AC36 详情成员按 joinedAt 升序、字段仍是五个且不含 leftAt', async () => {
      const teamId = await createTeamWithMembers();

      // 顺带验证邀请进来的新成员也走同一套成员视图
      const ghost = await createGhostUser();
      await invite(teamId, aliceToken, { email: ghost.email }).expect(201);

      const res = await getTeam(teamId, aliceToken).expect(200);
      const members = res.body.members as Array<Record<string, unknown>>;

      expect(members).toHaveLength(4);

      for (const member of members) {
        expect(Object.keys(member).sort()).toEqual([
          'avatarUrl',
          'joinedAt',
          'role',
          'userId',
          'username',
        ]);
        expect(member).not.toHaveProperty('leftAt');
      }

      const times = members.map((member) =>
        new Date(member.joinedAt as string).getTime(),
      );
      expect(times).toEqual([...times].sort((a, b) => a - b));
    });
  });

  describe('数据完整性', () => {
    it('AC38 迁移后没有 id 为空的成员行，也没有重复的活跃关系', async () => {
      const nullIds = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM team_members
        WHERE id IS NULL
      `;
      expect(Number(nullIds[0].count)).toBe(0);

      const duplicates = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM (
          SELECT team_id, user_id
          FROM team_members
          WHERE left_at IS NULL
          GROUP BY team_id, user_id
          HAVING COUNT(*) > 1
        ) AS dup
      `;
      expect(Number(duplicates[0].count)).toBe(0);
    });

    it('本轮没有污染 seed 团队：Frontend Platform 仍是 alice=OWNER / bob=ADMIN / carol=MEMBER', async () => {
      const team = await prisma.team.findFirst({
        where: { name: SEED_TEAM_NAMES.frontend, deletedAt: null },
        select: { id: true },
      });
      expect(team).not.toBeNull();

      const members = await prisma.teamMember.findMany({
        where: { teamId: team!.id, leftAt: null },
        select: { role: true, user: { select: { username: true } } },
      });

      const roles = Object.fromEntries(
        members.map((member) => [member.user.username, member.role]),
      );
      expect(roles).toEqual({
        alice: 'OWNER',
        bob: 'ADMIN',
        carol: 'MEMBER',
      });
    });
  });
});
