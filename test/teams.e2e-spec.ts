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
 * 团队模块验收（对应 docs/specs/teams-module.md 的 AC1–AC26）。
 *
 * seed 事实：Frontend Platform（alice=OWNER / bob=ADMIN / carol=MEMBER）、
 *           Mobile App（只有 bob=OWNER）。
 */
describe('团队模块 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let aliceToken: string;
  let bobToken: string;
  let carolToken: string;
  let aliceUserId: string;
  let bobUserId: string;
  let frontendTeamId: string;
  let mobileTeamId: string;
  const createdTeamIds: string[] = [];
  const ghostUserIds: string[] = [];

  // 创建团队并登记，afterAll 统一清理，避免污染 seed 数据
  const createTeam = async (
    token: string,
    body: Record<string, unknown>,
    expectedStatus = 201,
  ) => {
    const res = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(expectedStatus);

    if (res.status === 201) {
      createdTeamIds.push(res.body.id);
    }

    return res;
  };

  const listTeams = (token: string, query = '') =>
    request(app.getHttpServer())
      .get(`/api/teams${query}`)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const [frontend, mobile, aliceUser, bobUser] = await Promise.all([
      prisma.team.findFirst({
        where: { name: SEED_TEAM_NAMES.frontend, deletedAt: null },
        select: { id: true },
      }),
      prisma.team.findFirst({
        where: { name: SEED_TEAM_NAMES.mobile, deletedAt: null },
        select: { id: true },
      }),
      // User.email 不是唯一字段（唯一性由部分唯一索引保证，见 schema-integrity-fixes），
      // 所以按 email 查只能用 findFirst
      prisma.user.findFirst({
        where: { email: SEED_EMAILS.alice, deletedAt: null },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { email: SEED_EMAILS.bob, deletedAt: null },
        select: { id: true },
      }),
    ]);

    if (!frontend || !mobile || !aliceUser || !bobUser) {
      throw new Error('seed 数据缺失，先执行 npx prisma db seed');
    }

    frontendTeamId = frontend.id;
    mobileTeamId = mobile.id;
    aliceUserId = aliceUser.id;
    bobUserId = bobUser.id;

    aliceToken = await login(app, SEED_EMAILS.alice);
    bobToken = await login(app, SEED_EMAILS.bob);
    carolToken = await login(app, SEED_EMAILS.carol);
  });

  afterAll(async () => {
    if (createdTeamIds.length > 0) {
      // team_members 是 onDelete: Cascade，成员关系一并清掉
      await prisma.team.deleteMany({ where: { id: { in: createdTeamIds } } });
    }

    if (ghostUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: ghostUserIds } } });
    }

    await app.close();
  });

  describe('鉴权', () => {
    it('AC1 未登录访问团队列表返回 401', async () => {
      await request(app.getHttpServer()).get('/api/teams').expect(401);
    });

    it('AC2 未登录创建团队返回 401', async () => {
      await request(app.getHttpServer())
        .post('/api/teams')
        .send({ name: '未登录不该建成' })
        .expect(401);
    });
  });

  describe('列表 GET /api/teams', () => {
    it('AC3 alice 只能看到自己所属的团队', async () => {
      const res = await listTeams(aliceToken).expect(200);
      const names = res.body.items.map((item: { name: string }) => item.name);

      expect(names).toContain(SEED_TEAM_NAMES.frontend);
      expect(names).not.toContain(SEED_TEAM_NAMES.mobile);

      // 响应契约是分页信封，不是裸数组
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
      expect(res.body.total).toBeGreaterThanOrEqual(res.body.items.length);
    });

    it('AC4 bob 同时属于两个团队，两个都能看到', async () => {
      const res = await listTeams(bobToken).expect(200);
      const names = res.body.items.map((item: { name: string }) => item.name);

      expect(names).toContain(SEED_TEAM_NAMES.frontend);
      expect(names).toContain(SEED_TEAM_NAMES.mobile);
    });

    it('AC5 列表项只含约定的六个字段，不透内部字段', async () => {
      const res = await listTeams(aliceToken).expect(200);
      const item = res.body.items[0];

      expect(Object.keys(item).sort()).toEqual([
        'createdAt',
        'description',
        'id',
        'name',
        'role',
        'updatedAt',
      ]);
    });

    it('AC6 列表带出当前用户在该团队的角色', async () => {
      const aliceRes = await listTeams(aliceToken).expect(200);
      const aliceFrontend = aliceRes.body.items.find(
        (item: { name: string }) => item.name === SEED_TEAM_NAMES.frontend,
      );
      expect(aliceFrontend.role).toBe('OWNER');

      const carolRes = await listTeams(carolToken).expect(200);
      const carolFrontend = carolRes.body.items.find(
        (item: { name: string }) => item.name === SEED_TEAM_NAMES.frontend,
      );
      expect(carolFrontend.role).toBe('MEMBER');
    });

    it('AC7 列表按 createdAt 降序，最新的团队在最前', async () => {
      const first = await createTeam(aliceToken, { name: '排序测试A' });
      // createdAt 是毫秒精度，等一下才能保证两条时间不同
      await new Promise((resolve) => setTimeout(resolve, 10));
      const second = await createTeam(aliceToken, { name: '排序测试B' });

      const res = await listTeams(aliceToken).expect(200);
      const ids = res.body.items.map((item: { id: string }) => item.id);

      expect(ids.indexOf(second.body.id)).toBeLessThan(
        ids.indexOf(first.body.id),
      );
    });

    it('AC8 分页参数越界或非数字返回 400', async () => {
      await listTeams(aliceToken, '?page=0').expect(400);
      await listTeams(aliceToken, '?pageSize=0').expect(400);
      await listTeams(aliceToken, '?pageSize=101').expect(400);
      await listTeams(aliceToken, '?pageSize=abc').expect(400);
    });

    it('AC9 客户端传 userId 查询参数直接被拒，无法越权查别人的团队', async () => {
      await listTeams(aliceToken, `?userId=${bobUserId}`).expect(400);
    });

    it('AC10 teamName 传对象时被校验拦下，而不是漏进 Prisma 报 500', async () => {
      await listTeams(aliceToken, '?teamName%5Bx%5D=y').expect(400);
    });

    it('AC11 teamName 支持大小写不敏感的模糊匹配', async () => {
      const res = await listTeams(aliceToken, '?teamName=platform').expect(200);
      const names = res.body.items.map((item: { name: string }) => item.name);

      expect(names).toEqual([SEED_TEAM_NAMES.frontend]);
    });

    it('AC12 teamName 超过 64 字符返回 400', async () => {
      await listTeams(aliceToken, `?teamName=${'x'.repeat(65)}`).expect(400);
    });
  });

  describe('详情 GET /api/teams/:teamId', () => {
    it('AC13/AC14/AC15 成员列表含三人，字段最小化且角色正确', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/teams/${frontendTeamId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      expect(res.body.members).toHaveLength(3);

      for (const member of res.body.members) {
        expect(Object.keys(member).sort()).toEqual([
          'avatarUrl',
          'joinedAt',
          'role',
          'userId',
          'username',
        ]);
      }

      const byName = Object.fromEntries(
        res.body.members.map((member: { username: string; role: string }) => [
          member.username,
          member.role,
        ]),
      );
      expect(byName.bob).toBe('ADMIN');
      expect(byName.carol).toBe('MEMBER');
      expect(byName.alice).toBe('OWNER');
    });

    it('AC16 非成员查看团队详情返回 403', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/teams/${mobileTeamId}`)
        .set('Authorization', `Bearer ${carolToken}`)
        .expect(403);

      expect(res.body.message).toBe('你不是该团队成员');
    });

    it('AC17 不存在的团队返回 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/teams/${randomUUID()}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(404);

      expect(res.body.message).toBe('团队不存在');
    });

    it('AC18 非法 UUID 返回 400 而不是 500', async () => {
      await request(app.getHttpServer())
        .get('/api/teams/not-a-uuid')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(400);
    });

    it('AC19 已软删的团队不出现在列表里，详情返回 404', async () => {
      const created = await createTeam(aliceToken, { name: '待软删团队' });

      await prisma.team.update({
        where: { id: created.body.id },
        data: { deletedAt: new Date() },
        select: { id: true },
      });

      const list = await listTeams(aliceToken).expect(200);
      const ids = list.body.items.map((item: { id: string }) => item.id);
      expect(ids).not.toContain(created.body.id);

      await request(app.getHttpServer())
        .get(`/api/teams/${created.body.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(404);
    });

    it('AC32 已软删的用户不再算团队成员', async () => {
      const created = await createTeam(aliceToken, {
        name: '软删用户测试团队',
      });

      // 造一个一次性用户，避免动 seed 里的 alice/bob/carol
      const suffix = randomUUID().slice(0, 8);
      const ghost = await prisma.user.create({
        data: {
          username: `ghost-${suffix}`,
          email: `ghost-${suffix}@example.com`,
          passwordHash: 'not-a-real-hash',
        },
        select: { id: true },
      });
      ghostUserIds.push(ghost.id);

      await prisma.teamMember.create({
        data: { teamId: created.body.id, userId: ghost.id, role: 'MEMBER' },
        select: { teamId: true },
      });

      // 先确认软删之前他确实在成员列表里 —— 这条断言让下面的「不包含」有意义
      const before = await request(app.getHttpServer())
        .get(`/api/teams/${created.body.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);
      expect(
        before.body.members.map((member: { userId: string }) => member.userId),
      ).toContain(ghost.id);

      // 软删用户：team_members 的行还在（Cascade 只在硬删时触发），但不应再计入成员
      await prisma.user.update({
        where: { id: ghost.id },
        data: { deletedAt: new Date() },
        select: { id: true },
      });

      const after = await request(app.getHttpServer())
        .get(`/api/teams/${created.body.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      expect(
        after.body.members.map((member: { userId: string }) => member.userId),
      ).not.toContain(ghost.id);
      // 只剩创建者 alice 一人
      expect(after.body.members).toHaveLength(1);
    });
  });

  describe('创建 POST /api/teams', () => {
    it('AC20 name 缺失、为空、超长都返回 400', async () => {
      await createTeam(aliceToken, {}, 400);
      await createTeam(aliceToken, { name: '' }, 400);
      await createTeam(aliceToken, { name: 'x'.repeat(65) }, 400);
    });

    it('AC21 未声明的字段返回 400', async () => {
      await createTeam(aliceToken, { name: '合法名', foo: 'bar' }, 400);
    });

    it('AC22/AC23/AC24 创建成功，创建者自动成为 OWNER，团队立刻出现在自己列表里', async () => {
      const res = await createTeam(aliceToken, {
        name: '新团队',
        description: '简介',
      });

      expect(res.body.id).toBeTruthy();
      expect(res.body.name).toBe('新团队');
      expect(res.body.role).toBe('OWNER');

      const membership = await prisma.teamMember.findUnique({
        where: {
          teamId_userId: { teamId: res.body.id, userId: aliceUserId },
        },
        select: { role: true },
      });
      expect(membership?.role).toBe('OWNER');

      const list = await listTeams(aliceToken).expect(200);
      const ids = list.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(res.body.id);
    });

    it('AC25 允许创建同名团队', async () => {
      await createTeam(aliceToken, { name: '重名团队' });
      await createTeam(aliceToken, { name: '重名团队' });
    });

    it('AC26 不传 description 也能创建', async () => {
      const res = await createTeam(aliceToken, { name: '只有名字' });
      expect(res.body.description).toBeNull();
    });
  });
});
