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
 * 评论模块验收（对应 docs/specs/comments-module.md 的 AC1–AC21）。
 *
 * seed 事实：
 * - Frontend Platform：alice=OWNER / bob=ADMIN / carol=MEMBER
 * - Mobile App：只有 bob=OWNER
 * - 「设计任务看板 UI」下有 2 条 seed 评论（bob 10:00 / alice 11:00）
 *
 * 所有写操作都只碰本套用例自己创建的评论 / 任务 / 团队，afterAll 按 id 硬删；
 * seed 评论只读，绝不软删或改写 —— 否则重跑时会污染后续断言。
 */

// 评论视图的 7 个顶层键（与 comments.service.ts 的 COMMENT_SELECT 对齐）
const COMMENT_KEYS = [
  'id',
  'taskId',
  'authorId',
  'content',
  'createdAt',
  'updatedAt',
  'author',
] as const;

const SEED_BOARD_COMMENTS = [
  '看板列宽先按 320px 做，后面再做自适应。',
  '拖拽交互我补一个原型，今天下班前发群里。',
] as const;

// seed 的三条评论 id 是固定的（见 prisma/seed.ts）。afterAll 用它们验证本套用例
// 没有误软删 / 误改 seed 数据 —— 「只写自建数据」是意图，必须被断言证明。
const SEED_COMMENT_IDS = [
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
] as const;

// 顶层键必须完全一致（不是「包含」）：多一个键也算违约
function expectExactKeys(body: unknown, keys: readonly string[]) {
  expect(Object.keys(body as Record<string, unknown>).sort()).toEqual(
    [...keys].sort(),
  );
}

describe('评论模块 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let aliceToken: string;
  let bobToken: string;
  let carolToken: string;
  let aliceUserId: string;
  let bobUserId: string;
  let carolUserId: string;
  let frontendTeamId: string;
  let boardUiTaskId: string;
  let mobileTaskId: string;

  const createdCommentIds: string[] = [];
  const createdTaskIds: string[] = [];
  const createdTeamIds: string[] = [];

  const getComments = (token: string, taskId: string) =>
    request(app.getHttpServer())
      .get(`/api/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${token}`);

  const postComment = (token: string, taskId: string, body: object) =>
    request(app.getHttpServer())
      .post(`/api/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  // 创建评论并登记，afterAll 统一硬删
  const createComment = async (
    token: string,
    taskId: string,
    content: string,
  ) => {
    const res = await postComment(token, taskId, { content }).expect(201);
    createdCommentIds.push(res.body.id);
    return res;
  };

  const createTask = async (token: string, teamId: string, title: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamId, title })
      .expect(201);

    createdTaskIds.push(res.body.id);
    return res;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const [
      frontend,
      boardUiTask,
      loginMobileTask,
      aliceUser,
      bobUser,
      carolUser,
    ] = await Promise.all([
      prisma.team.findFirst({
        where: { name: SEED_TEAM_NAMES.frontend, deletedAt: null },
        select: { id: true },
      }),
      prisma.task.findFirst({
        where: { title: '设计任务看板 UI', deletedAt: null },
        select: { id: true },
      }),
      prisma.task.findFirst({
        where: { title: '修复登录页崩溃', deletedAt: null },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { email: SEED_EMAILS.alice, deletedAt: null },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { email: SEED_EMAILS.bob, deletedAt: null },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { email: SEED_EMAILS.carol, deletedAt: null },
        select: { id: true },
      }),
    ]);

    if (
      !frontend ||
      !boardUiTask ||
      !loginMobileTask ||
      !aliceUser ||
      !bobUser ||
      !carolUser
    ) {
      throw new Error('seed 数据缺失，先执行 npx prisma db seed');
    }

    frontendTeamId = frontend.id;
    boardUiTaskId = boardUiTask.id;
    mobileTaskId = loginMobileTask.id;
    aliceUserId = aliceUser.id;
    bobUserId = bobUser.id;
    carolUserId = carolUser.id;

    [aliceToken, bobToken, carolToken] = await Promise.all([
      login(app, SEED_EMAILS.alice),
      login(app, SEED_EMAILS.bob),
      login(app, SEED_EMAILS.carol),
    ]);
  });

  afterAll(async () => {
    try {
      // AC24：seed 评论是只读夹具，本套用例结束后必须仍是 3 条且未软删
      const seedComments = await prisma.comment.findMany({
        where: { id: { in: [...SEED_COMMENT_IDS] } },
        select: { id: true, deletedAt: true },
      });

      expect(seedComments).toHaveLength(SEED_COMMENT_IDS.length);

      for (const comment of seedComments) {
        expect(comment.deletedAt).toBeNull();
      }
    } finally {
      // 顺序不能反：先清评论，再清任务，团队最后（team_members 是 Cascade，一并清掉）
      if (createdCommentIds.length > 0) {
        await prisma.comment.deleteMany({
          where: { id: { in: createdCommentIds } },
        });
      }

      if (createdTaskIds.length > 0) {
        await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } });
      }

      if (createdTeamIds.length > 0) {
        await prisma.team.deleteMany({ where: { id: { in: createdTeamIds } } });
      }

      await app.close();
    }
  });

  describe('鉴权', () => {
    it('AC1 未登录访问四个评论接口均返回 401', async () => {
      const anyId = randomUUID();

      await request(app.getHttpServer())
        .get(`/api/tasks/${boardUiTaskId}/comments`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/tasks/${boardUiTaskId}/comments`)
        .send({ content: '未登录不该建成' })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/comments/${anyId}`)
        .send({ content: '未登录不该改成' })
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/comments/${anyId}`)
        .expect(401);
    });
  });

  describe('列表 GET /api/tasks/:taskId/comments', () => {
    it('AC2 团队成员只能读到该任务下的 2 条 seed 评论', async () => {
      const res = await getComments(aliceToken, boardUiTaskId).expect(200);

      expect(Array.isArray(res.body)).toBe(true);

      // 每一条都必须归属这条任务：只断言「包含」两条 seed 评论的话，
      // 实现若漏掉 taskId 过滤（改成按团队取），兄弟任务的评论会混进来而测试全绿
      for (const item of res.body) {
        expect(item.taskId).toBe(boardUiTaskId);
      }

      const contents = res.body.map(
        (item: { content: string }) => item.content,
      );

      expect([...contents].sort()).toEqual([...SEED_BOARD_COMMENTS].sort());
    });

    it('AC3 评论视图键集合固定，不透内部字段', async () => {
      const res = await getComments(aliceToken, boardUiTaskId).expect(200);

      for (const item of res.body) {
        expectExactKeys(item, COMMENT_KEYS);
        expect(Object.keys(item.author).sort()).toEqual(['id', 'username']);
      }

      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('deletedAt');
      expect(raw).not.toContain('passwordHash');
      expect(raw).not.toContain('email');
    });

    it('AC4 列表按 createdAt 升序，seed 的两条顺序正确', async () => {
      const res = await getComments(aliceToken, boardUiTaskId).expect(200);

      for (let index = 1; index < res.body.length; index += 1) {
        const previous = new Date(res.body[index - 1].createdAt).getTime();
        const current = new Date(res.body[index].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(previous);
      }

      const contents = res.body.map(
        (item: { content: string }) => item.content,
      );
      const first = contents.indexOf(SEED_BOARD_COMMENTS[0]);
      const second = contents.indexOf(SEED_BOARD_COMMENTS[1]);

      expect(first).toBeGreaterThanOrEqual(0);
      expect(second).toBeGreaterThan(first);
    });

    it('AC4b 同一毫秒的评论按 id 升序兜底', async () => {
      // 用自建任务，避免往 seed 看板任务里写数据、污染 AC2 的「恰好 2 条」断言
      const task = await createTask(
        aliceToken,
        frontendTeamId,
        `[comments-e2e] 同毫秒排序 ${randomUUID()}`,
      );

      // 造两条 createdAt 相同的评论，并**反着插入**：先插 id 较大的 secondId，
      // 再插 id 较小的 firstId。这样堆 / 索引的物理顺序与 id 升序相反 ——
      // 去掉 orderBy 的第二个键（id）后，这条用例才能稳定变红。
      const sharedTime = new Date();
      const [firstId, secondId] = [randomUUID(), randomUUID()].sort();

      await prisma.comment.createMany({
        data: [
          {
            id: secondId,
            taskId: task.body.id,
            authorId: aliceUserId,
            content: '同毫秒 B',
            createdAt: sharedTime,
          },
          {
            id: firstId,
            taskId: task.body.id,
            authorId: aliceUserId,
            content: '同毫秒 A',
            createdAt: sharedTime,
          },
        ],
      });
      createdCommentIds.push(firstId, secondId);

      const res = await getComments(aliceToken, task.body.id).expect(200);

      // 自建任务下只有这两条，直接断言完整顺序，顺便验证列表按任务收敛
      expect(res.body.map((item: { id: string }) => item.id)).toEqual([
        firstId,
        secondId,
      ]);
    });

    it('AC5 已软删的评论不出现在列表里', async () => {
      const created = await createComment(
        aliceToken,
        boardUiTaskId,
        '这条评论稍后会被软删',
      );

      await prisma.comment.update({
        where: { id: created.body.id },
        data: { deletedAt: new Date() },
      });

      const res = await getComments(aliceToken, boardUiTaskId).expect(200);
      const ids = res.body.map((item: { id: string }) => item.id);

      expect(ids).not.toContain(created.body.id);
    });

    it('AC6 taskId / commentId 非法 UUID 返回 400', async () => {
      await getComments(aliceToken, 'not-a-uuid').expect(400);

      await request(app.getHttpServer())
        .patch('/api/comments/not-a-uuid')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: '非法 id' })
        .expect(400);

      await request(app.getHttpServer())
        .delete('/api/comments/not-a-uuid')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(400);
    });

    it('AC6b 合法但不存在的 taskId 返回 404', async () => {
      await getComments(aliceToken, randomUUID()).expect(404);
    });
  });

  describe('权限', () => {
    it('AC7 非团队成员不能读 / 写任务评论', async () => {
      await getComments(carolToken, mobileTaskId).expect(403);
      await postComment(carolToken, mobileTaskId, {
        content: '越权评论',
      }).expect(403);

      // bob 在 Mobile App 下建一条评论，carol 尝试改 / 删
      const comment = await createComment(
        bobToken,
        mobileTaskId,
        'carol 不该改得动的评论',
      );

      await request(app.getHttpServer())
        .patch(`/api/comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${carolToken}`)
        .send({ content: '越权修改' })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/api/comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${carolToken}`)
        .expect(403);
    });

    it('AC8 普通 MEMBER 不能编辑 / 删除他人评论', async () => {
      const comment = await createComment(
        bobToken,
        boardUiTaskId,
        'MEMBER 不该动的评论',
      );

      await request(app.getHttpServer())
        .patch(`/api/comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${carolToken}`)
        .send({ content: 'MEMBER 改别人的' })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/api/comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${carolToken}`)
        .expect(403);
    });

    it('AC9 ADMIN 不能编辑他人评论，但可以删除', async () => {
      const comment = await createComment(
        carolToken,
        boardUiTaskId,
        'ADMIN 能删不能改的评论',
      );

      await request(app.getHttpServer())
        .patch(`/api/comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ content: 'ADMIN 代改' })
        .expect(403);

      const deleted = await request(app.getHttpServer())
        .delete(`/api/comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);

      expect(deleted.body).toEqual({ id: comment.body.id, deleted: true });
    });

    it('AC10 OWNER 可以删除任意成员的评论', async () => {
      const comment = await createComment(
        bobToken,
        boardUiTaskId,
        'OWNER 可以清理的评论',
      );

      await request(app.getHttpServer())
        .delete(`/api/comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);
    });

    it('AC11 作者本人可以编辑并删除自己的评论', async () => {
      const comment = await createComment(
        carolToken,
        boardUiTaskId,
        '作者自己的评论',
      );

      await request(app.getHttpServer())
        .patch(`/api/comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${carolToken}`)
        .send({ content: '作者改过的评论' })
        .expect(200);

      const deleted = await request(app.getHttpServer())
        .delete(`/api/comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${carolToken}`)
        .expect(200);

      expect(deleted.body).toEqual({ id: comment.body.id, deleted: true });
    });
  });

  describe('创建 POST /api/tasks/:taskId/comments', () => {
    it('AC12 合法内容返回 201，作者取自登录态', async () => {
      const res = await createComment(
        aliceToken,
        boardUiTaskId,
        '这条评论的键集合会被逐项检查',
      );

      expectExactKeys(res.body, COMMENT_KEYS);
      expect(res.body.taskId).toBe(boardUiTaskId);
      expect(res.body.authorId).toBe(aliceUserId);
      expect(res.body.author).toEqual({ id: aliceUserId, username: 'alice' });
      expect(Object.keys(res.body.author).sort()).toEqual(['id', 'username']);

      const row = await prisma.comment.findUnique({
        where: { id: res.body.id },
        select: { deletedAt: true, authorId: true, taskId: true },
      });

      expect(row).not.toBeNull();
      expect(row?.deletedAt).toBeNull();
      expect(row?.authorId).toBe(aliceUserId);
      expect(row?.taskId).toBe(boardUiTaskId);
    });

    it('AC13 请求体带未声明字段返回 400，作者无法伪造', async () => {
      await postComment(aliceToken, boardUiTaskId, {
        content: '伪造作者',
        authorId: bobUserId,
      }).expect(400);

      await postComment(aliceToken, boardUiTaskId, {
        content: '伪造任务',
        taskId: mobileTaskId,
      }).expect(400);

      await postComment(aliceToken, boardUiTaskId, {
        content: '伪造软删时间',
        deletedAt: new Date().toISOString(),
      }).expect(400);
    });

    it('AC14 内容为空 / 超长 / 非字符串 / 缺失均返回 400', async () => {
      await postComment(aliceToken, boardUiTaskId, { content: '' }).expect(400);
      await postComment(aliceToken, boardUiTaskId, {
        content: 'a'.repeat(2001),
      }).expect(400);
      await postComment(aliceToken, boardUiTaskId, { content: 123 }).expect(
        400,
      );
      await postComment(aliceToken, boardUiTaskId, {}).expect(400);
    });

    it('AC15 纯空白内容可以通过（DTO 不 trim）', async () => {
      await createComment(aliceToken, boardUiTaskId, '   ');
    });

    it('AC16 长度恰好 2000 可以通过', async () => {
      const res = await createComment(
        aliceToken,
        boardUiTaskId,
        'a'.repeat(2000),
      );

      expect(res.body.content).toHaveLength(2000);
    });
  });

  describe('编辑与软删', () => {
    it('AC17 作者编辑后内容与 updatedAt 更新，归属字段不变', async () => {
      const created = await createComment(
        carolToken,
        boardUiTaskId,
        '编辑前的内容',
      );

      // @updatedAt 的精度是毫秒，等一下确保两个时间戳可区分
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await request(app.getHttpServer())
        .patch(`/api/comments/${created.body.id}`)
        .set('Authorization', `Bearer ${carolToken}`)
        .send({ content: '编辑后的内容' })
        .expect(200);

      expectExactKeys(updated.body, COMMENT_KEYS);
      expect(updated.body.content).toBe('编辑后的内容');
      expect(updated.body.id).toBe(created.body.id);
      expect(updated.body.taskId).toBe(boardUiTaskId);
      expect(updated.body.authorId).toBe(carolUserId);
      expect(new Date(updated.body.updatedAt).getTime()).toBeGreaterThan(
        new Date(created.body.createdAt).getTime(),
      );
    });

    it('AC18 编辑 / 删除不存在的评论返回 404', async () => {
      const ghostId = randomUUID();

      await request(app.getHttpServer())
        .patch(`/api/comments/${ghostId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: '不存在' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/comments/${ghostId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(404);
    });

    it('AC19 软删后列表不可见、数据库保留 deleted_at、再次操作 404', async () => {
      const created = await createComment(
        aliceToken,
        boardUiTaskId,
        '待软删的评论',
      );

      const deleted = await request(app.getHttpServer())
        .delete(`/api/comments/${created.body.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      expectExactKeys(deleted.body, ['id', 'deleted']);
      expect(deleted.body).toEqual({ id: created.body.id, deleted: true });

      const list = await getComments(aliceToken, boardUiTaskId).expect(200);
      const ids = list.body.map((item: { id: string }) => item.id);
      expect(ids).not.toContain(created.body.id);

      const row = await prisma.comment.findUnique({
        where: { id: created.body.id },
        select: { deletedAt: true },
      });
      expect(row?.deletedAt).not.toBeNull();

      await request(app.getHttpServer())
        .patch(`/api/comments/${created.body.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: '软删后不该改得动' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/comments/${created.body.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(404);
    });

    it('AC20 任务软删后评论读写均 404，恢复后重新可读', async () => {
      const task = await createTask(
        aliceToken,
        frontendTeamId,
        `[comments-e2e] 软删任务 ${randomUUID()}`,
      );
      const comment = await createComment(
        aliceToken,
        task.body.id,
        '任务软删后不该再出现',
      );

      await prisma.task.update({
        where: { id: task.body.id },
        data: { deletedAt: new Date() },
      });

      await getComments(aliceToken, task.body.id).expect(404);
      await postComment(aliceToken, task.body.id, {
        content: '写不进去',
      }).expect(404);
      await request(app.getHttpServer())
        .patch(`/api/comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: '改不动' })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/api/comments/${comment.body.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(404);

      // 恢复任务，证明 404 来自任务的软删状态而不是其他原因
      await prisma.task.update({
        where: { id: task.body.id },
        data: { deletedAt: null },
      });

      await getComments(aliceToken, task.body.id).expect(200);
    });

    it('AC21 团队软删后评论读写均 404，恢复后重新可读', async () => {
      const team = await request(app.getHttpServer())
        .post('/api/teams')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ name: `[comments-e2e] 临时团队 ${randomUUID()}` })
        .expect(201);

      createdTeamIds.push(team.body.id);

      const task = await createTask(
        aliceToken,
        team.body.id,
        `[comments-e2e] 团队软删任务 ${randomUUID()}`,
      );
      await createComment(aliceToken, task.body.id, '团队软删后不该再出现');

      await prisma.team.update({
        where: { id: team.body.id },
        data: { deletedAt: new Date() },
      });

      await getComments(aliceToken, task.body.id).expect(404);
      await postComment(aliceToken, task.body.id, {
        content: '写不进去',
      }).expect(404);

      await prisma.team.update({
        where: { id: team.body.id },
        data: { deletedAt: null },
      });

      await getComments(aliceToken, task.body.id).expect(200);
    });
  });
});
