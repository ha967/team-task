import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createTestApp,
  login,
  SEED_EMAILS,
  SEED_TEAM_NAMES,
} from './utils/test-app.js';

/**
 * TASK_SELECT 的字段白名单（13 个键）。
 *
 * 列表 / 创建 / 更新 三条路径都复用它，删除返回的是 { id, deleted }。
 * 键集合在这里钉死：谁把详情视图复用进列表（或反过来），这四条断言会直接红。
 * 以后往 TASK_SELECT 加字段，必须同步改这份常量 —— 那等于改公共响应契约，本就该被拦一次。
 */
const TASK_LIST_KEYS = [
  'id',
  'teamId',
  'title',
  'description',
  'estimateHours',
  'status',
  'priority',
  'assigneeId',
  'dueAt',
  'completedAt',
  'createdAt',
  'updatedAt',
  'assignee',
] as const;

// 顶层键必须与 keys 完全一致（不是「包含」）：多一个键也算违约
function expectExactKeys(body: unknown, keys: readonly string[]) {
  expect(Object.keys(body as Record<string, unknown>).sort()).toEqual(
    [...keys].sort(),
  );
}

/**
 * tasks 的回归基线 + 任务详情。
 *
 * TB1–TB3 是抽出 TeamAccessService 时留下的回归保护，改动前跑绿、改动后仍必须绿；
 * TB4–TB5 钉住更新 / 删除的返回体键集合；
 * TD1–TD9 覆盖 GET /api/tasks/:taskId（读路径）；
 * TE1–TE3 覆盖「团队被软删」下的读 / 写路径 —— 列表、详情、PATCH、DELETE 四处对同一个
 * 已软删团队必须给出同一个结论（那条任务不存在）。
 *
 * 数量断言刻意不用精确总数：e2e 会往库里写数据，重跑会累积，只断言「包含 / 不包含」。
 * 但「字段集合」是精确断言（expectExactKeys）—— 两件事不要混，不要因为前半句就以为本轮没加硬断言。
 */
describe('Tasks 回归基线 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let aliceToken: string;
  let carolToken: string;
  let frontendTeamId: string;
  let mobileTeamId: string;
  let frontendTaskId: string;
  let mobileTaskId: string;
  const createdTaskIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const [frontend, mobile] = await Promise.all([
      prisma.team.findFirst({
        where: { name: SEED_TEAM_NAMES.frontend, deletedAt: null },
        select: { id: true },
      }),
      prisma.team.findFirst({
        where: { name: SEED_TEAM_NAMES.mobile, deletedAt: null },
        select: { id: true },
      }),
    ]);

    if (!frontend || !mobile) {
      throw new Error('seed 数据缺失，先执行 npx prisma db seed');
    }

    frontendTeamId = frontend.id;
    mobileTeamId = mobile.id;

    const [frontendTask, mobileTask] = await Promise.all([
      prisma.task.findFirst({
        where: { title: '设计任务看板 UI', deletedAt: null },
        select: { id: true },
      }),
      prisma.task.findFirst({
        where: { title: '修复登录页崩溃', deletedAt: null },
        select: { id: true },
      }),
    ]);

    if (!frontendTask || !mobileTask) {
      throw new Error('seed 任务缺失，先执行 npx prisma db seed');
    }

    frontendTaskId = frontendTask.id;
    mobileTaskId = mobileTask.id;

    aliceToken = await login(app, SEED_EMAILS.alice);
    carolToken = await login(app, SEED_EMAILS.carol);
  });

  afterAll(async () => {
    // 只清理本套用例自己创建的数据，不碰 seed 内容
    if (createdTaskIds.length > 0) {
      await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } });
    }

    await app.close();
  });

  it('TB1 未登录访问任务列表返回 401', async () => {
    await request(app.getHttpServer()).get('/api/tasks').expect(401);
  });

  it('TB2 任务列表只包含调用者所属团队的任务', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tasks')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    const titles = res.body.items.map((item: { title: string }) => item.title);

    expect(titles).toEqual(
      expect.arrayContaining([
        '设计任务看板 UI',
        '实现任务筛选 API',
        '搭建 CI 流水线',
      ]),
    );
    // alice 不属于 Mobile App，那两个任务不该出现
    expect(titles).not.toContain('修复登录页崩溃');
    expect(titles).not.toContain('接入推送通知');

    // 每个列表 item 的顶层键都必须是 TASK_SELECT 那 13 个，不能混进详情专属的 createdBy / team。
    // 逐条验而不是只验 items[0]：将来某个 item 因 select 分支被加宽时，只验首条会漏。
    for (const item of res.body.items) {
      expectExactKeys(item, TASK_LIST_KEYS);
    }
  });

  it('TB3 团队成员可以建任务，非成员被 403 拦住', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ teamId: frontendTeamId, title: 'e2e 基线任务' })
      .expect(201);

    createdTaskIds.push(created.body.id);
    expectExactKeys(created.body, TASK_LIST_KEYS);

    const list = await request(app.getHttpServer())
      .get('/api/tasks')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    const ids = list.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(created.body.id);

    // carol 不是 Mobile App 成员，建任务必须被拒
    await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ teamId: mobileTeamId, title: '不该建成功的任务' })
      .expect(403);
  });

  it('TB4 更新任务的返回体键集合与列表一致', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ teamId: frontendTeamId, title: 'e2e 更新基线任务' })
      .expect(201);

    createdTaskIds.push(created.body.id);

    const updated = await request(app.getHttpServer())
      .patch(`/api/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    expectExactKeys(updated.body, TASK_LIST_KEYS);
    expect(updated.body.status).toBe('IN_PROGRESS');
  });

  it('TB5 删除任务的返回体只有 id 与 deleted', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ teamId: frontendTeamId, title: 'e2e 删除基线任务' })
      .expect(201);

    createdTaskIds.push(created.body.id);

    const deleted = await request(app.getHttpServer())
      .delete(`/api/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expectExactKeys(deleted.body, ['id', 'deleted']);
    expect(deleted.body).toEqual({ id: created.body.id, deleted: true });
  });

  describe('任务详情 GET /api/tasks/:taskId', () => {
    // 详情 = 列表 13 键 + createdBy + team，严格超集且只多这两个
    const DETAIL_KEYS = [...TASK_LIST_KEYS, 'createdBy', 'team'] as const;

    it('TD1 未登录访问任务详情返回 401', async () => {
      await request(app.getHttpServer())
        .get(`/api/tasks/${frontendTaskId}`)
        .expect(401);
    });

    it('TD2 团队成员能读详情，键集合比列表只多 createdBy / team', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${frontendTaskId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      expectExactKeys(res.body, DETAIL_KEYS);

      // 内部字段一个都不许透
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('createdById');
      expect(raw).not.toContain('deletedAt');
      expect(raw).not.toContain('passwordHash');

      expect(Object.keys(res.body.assignee).sort()).toEqual(['id', 'username']);
      expect(Object.keys(res.body.createdBy).sort()).toEqual([
        'id',
        'username',
      ]);
      expect(Object.keys(res.body.team).sort()).toEqual(['id', 'name']);
      expect(res.body.team).toEqual({
        id: res.body.teamId,
        name: SEED_TEAM_NAMES.frontend,
      });
      expect(res.body.title).toBe('设计任务看板 UI');
      // 只钉形状、不钉具体是谁：seed 的 assigneeId 可被手工改派，绑死名字会让本用例
      // 以和详情接口无关的理由红掉（AC9 要的是形状，不是某个人）
      expect(typeof res.body.assignee.username).toBe('string');
      expect(typeof res.body.createdBy.username).toBe('string');
      // 序列化形式与列表一致：数值或 null / ISO 字符串或 null
      expect(
        res.body.estimateHours === null ||
          typeof res.body.estimateHours === 'number',
      ).toBe(true);
      expect(
        res.body.dueAt === null || typeof res.body.dueAt === 'string',
      ).toBe(true);
      expect(
        res.body.completedAt === null ||
          typeof res.body.completedAt === 'string',
      ).toBe(true);
    });

    it('TD3 MEMBER 也能读同团队任意任务（不按创建者 / 负责人收紧）', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${frontendTaskId}`)
        .set('Authorization', `Bearer ${carolToken}`)
        .expect(200);

      expect(res.body.id).toBe(frontendTaskId);
    });

    it('TD4 非团队成员读详情返回 403', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${mobileTaskId}`)
        .set('Authorization', `Bearer ${carolToken}`)
        .expect(403);

      expect(res.body.message).toBe('你不是该团队成员');
    });

    it('TD5 不存在的任务返回 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tasks/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(404);

      expect(res.body.message).toBe('任务不存在');
    });

    it('TD6 非法 UUID 返回 400 而不是 500', async () => {
      await request(app.getHttpServer())
        .get('/api/tasks/not-a-uuid')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(400);
    });

    it('TD7 任务被软删后详情返回 404', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ teamId: frontendTeamId, title: 'e2e 软删任务' })
        .expect(201);

      createdTaskIds.push(created.body.id);

      // 软删前可读，证明 404 是软删造成的、不是路由写错
      await request(app.getHttpServer())
        .get(`/api/tasks/${created.body.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      await prisma.task.update({
        where: { id: created.body.id },
        data: { deletedAt: new Date() },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${created.body.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(404);

      expect(res.body.message).toBe('任务不存在');
    });

    it('TD8 团队被软删后其任务详情返回 404（与列表过滤一致）', async () => {
      let teamId: string | undefined;
      let taskId: string | undefined;

      try {
        const team = await request(app.getHttpServer())
          .post('/api/teams')
          .set('Authorization', `Bearer ${aliceToken}`)
          .send({ name: `e2e 软删团队 ${Date.now()}` })
          .expect(201);

        teamId = team.body.id as string;

        const task = await request(app.getHttpServer())
          .post('/api/tasks')
          .set('Authorization', `Bearer ${aliceToken}`)
          .send({ teamId, title: 'e2e 软删团队下的任务' })
          .expect(201);

        taskId = task.body.id as string;
        createdTaskIds.push(taskId);

        await request(app.getHttpServer())
          .get(`/api/tasks/${taskId}`)
          .set('Authorization', `Bearer ${aliceToken}`)
          .expect(200);

        // 级联只发生在硬删，这里软删必须只动 teams.deleted_at
        await prisma.team.update({
          where: { id: teamId },
          data: { deletedAt: new Date() },
        });

        const res = await request(app.getHttpServer())
          .get(`/api/tasks/${taskId}`)
          .set('Authorization', `Bearer ${aliceToken}`)
          .expect(404);

        expect(res.body.message).toBe('任务不存在');
      } finally {
        // 用例失败也要清掉自建团队，否则软删团队会留在库里影响后续轮次
        if (taskId) {
          await prisma.task.deleteMany({ where: { id: taskId } });
        }

        if (teamId) {
          // team_members 对 team 是 onDelete: Cascade，删团队会连带清掉成员关系
          await prisma.team.deleteMany({ where: { id: teamId } });
        }
      }
    });

    it('TD9 未指派任务的详情里 assignee 为 null', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ teamId: frontendTeamId, title: 'e2e 未指派任务' })
        .expect(201);

      createdTaskIds.push(created.body.id);

      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${created.body.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      // assignee 的 null 分支：seed 的任务都有负责人，只能自建一条来验形状
      expectExactKeys(res.body, DETAIL_KEYS);
      expect(res.body.assigneeId).toBeNull();
      expect(res.body.assignee).toBeNull();
      expect(typeof res.body.createdBy.username).toBe('string');
    });
  });

  describe('软删团队后的读写路径', () => {
    // helper 中途失败时（比如建任务那步 500），已经建好的团队仍要能被 finally 清掉，
    // 所以 id 记在调用方持有的 refs 里，而不是藏在 helper 的局部变量里
    interface CreatedRefs {
      teamId?: string;
      taskId?: string;
    }

    /**
     * 自建一个团队 + 一条任务，返回两者的 id，并把它们记进 refs 供清理。
     *
     * 团队软删不删 team_members 行，所以 assertTeamMember 仍会通过 —— 这些用例验的是
     * 「存在性判定」有没有挡住读 / 写，而不是成员关系兜不兜得住。
     */
    async function createTaskInTeam(
      refs: CreatedRefs,
    ): Promise<{ teamId: string; taskId: string }> {
      const team = await request(app.getHttpServer())
        .post('/api/teams')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ name: `e2e 软删团队 ${Date.now()}` })
        .expect(201);

      const teamId = team.body.id as string;
      refs.teamId = teamId;

      const task = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ teamId, title: 'e2e 软删团队下的任务' })
        .expect(201);

      const taskId = task.body.id as string;
      refs.taskId = taskId;

      return { teamId, taskId };
    }

    // 级联只发生在硬删，这里软删必须只动 teams.deleted_at
    async function softDeleteTeam(teamId: string) {
      await prisma.team.update({
        where: { id: teamId },
        data: { deletedAt: new Date() },
      });
    }

    async function cleanup(refs: CreatedRefs) {
      if (refs.taskId) {
        await prisma.task.deleteMany({ where: { id: refs.taskId } });
      }

      if (refs.teamId) {
        // team_members 对 team 是 onDelete: Cascade，删团队会连带清掉成员关系
        await prisma.team.deleteMany({ where: { id: refs.teamId } });
      }
    }

    it('TE1 团队被软删后 PATCH 返回 404（与详情一致）', async () => {
      const refs: CreatedRefs = {};

      try {
        const { teamId, taskId } = await createTaskInTeam(refs);
        await softDeleteTeam(teamId);

        const res = await request(app.getHttpServer())
          .patch(`/api/tasks/${taskId}`)
          .set('Authorization', `Bearer ${aliceToken}`)
          .send({ title: '不该改成功的标题' })
          .expect(404);

        expect(res.body.message).toBe('任务不存在');

        // 确认真的没写进去：绕过接口直接看库，唯一的过滤只能来自写路径
        const row = await prisma.task.findUnique({
          where: { id: taskId },
          select: { title: true },
        });

        expect(row?.title).toBe('e2e 软删团队下的任务');
      } finally {
        await cleanup(refs);
      }
    });

    it('TE2 团队被软删后 DELETE 返回 404（与详情一致）', async () => {
      const refs: CreatedRefs = {};

      try {
        const { teamId, taskId } = await createTaskInTeam(refs);
        await softDeleteTeam(teamId);

        const res = await request(app.getHttpServer())
          .delete(`/api/tasks/${taskId}`)
          .set('Authorization', `Bearer ${aliceToken}`)
          .expect(404);

        expect(res.body.message).toBe('任务不存在');

        // 不能被软删：deletedAt 必须仍是 null
        const row = await prisma.task.findUnique({
          where: { id: taskId },
          select: { deletedAt: true },
        });

        expect(row?.deletedAt).toBeNull();
      } finally {
        await cleanup(refs);
      }
    });

    it('TE3 团队被软删后其任务不出现在列表里', async () => {
      const refs: CreatedRefs = {};

      try {
        const { teamId, taskId } = await createTaskInTeam(refs);

        // 正向对照：团队还活着时这条任务必须在列表里，否则下面的「不在」毫无意义
        const before = await request(app.getHttpServer())
          .get('/api/tasks')
          .set('Authorization', `Bearer ${aliceToken}`)
          .expect(200);

        const beforeIds = before.body.items.map(
          (item: { id: string }) => item.id,
        );
        expect(beforeIds).toContain(taskId);

        await softDeleteTeam(teamId);

        const after = await request(app.getHttpServer())
          .get('/api/tasks')
          .set('Authorization', `Bearer ${aliceToken}`)
          .expect(200);

        const afterIds = after.body.items.map(
          (item: { id: string }) => item.id,
        );
        expect(afterIds).not.toContain(taskId);
      } finally {
        await cleanup(refs);
      }
    });
  });
});
