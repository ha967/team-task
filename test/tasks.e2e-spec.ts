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
 * tasks 的回归基线。
 *
 * 本轮要把 TasksService 里的权限判定抽到 TeamAccessService，
 * 而 tasks 此前零测试 —— 这三条必须在改动前跑绿、改动后仍然绿。
 *
 * 断言刻意不用精确总数：e2e 会往库里写数据，重跑会累积，只断言「包含 / 不包含」。
 */
describe('Tasks 回归基线 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let aliceToken: string;
  let carolToken: string;
  let frontendTeamId: string;
  let mobileTeamId: string;
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
  });

  it('TB3 团队成员可以建任务，非成员被 403 拦住', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ teamId: frontendTeamId, title: 'e2e 基线任务' })
      .expect(201);

    createdTaskIds.push(created.body.id);

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
});
