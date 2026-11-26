import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { Prisma } from '../src/generated/prisma/client.js';

const DEMO_PASSWORD = 'Password123!';

// 固定 ID：重复执行不会产生新数据，也方便在测试和 .http 文件里直接引用
const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const BOB_ID = '22222222-2222-4222-8222-222222222222';
const CAROL_ID = '33333333-3333-4333-8333-333333333333';

const FRONTEND_TEAM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const MOBILE_TEAM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

const TASK_BOARD_UI_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const TASK_FILTER_API_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const TASK_CI_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
const TASK_LOGIN_CRASH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4';
const TASK_PUSH_NOTIFICATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5';

const COMMENT_UI_1_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const COMMENT_UI_2_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const COMMENT_FILTER_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed the database in production');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function day(dayOfJanuary: number, hour = 9) {
  return new Date(Date.UTC(2026, 0, dayOfJanuary, hour, 0, 0, 0));
}

/**
 * TeamMember 现在是 id 主键 + leftAt，不能再按 teamId_userId upsert。
 * seed 只保证「这几个演示成员处于活跃状态」：找到活跃行就更新角色，
 * 找不到才新建（可能是从未加入，也可能是退出后重新 seed）。
 * 不删除 leftAt 非空的历史行，也不把旧历史「复活」。
 */
async function upsertActiveMember(
  tx: Prisma.TransactionClient,
  data: {
    teamId: string;
    userId: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER';
    joinedAt: Date;
  },
) {
  const active = await tx.teamMember.findFirst({
    where: { teamId: data.teamId, userId: data.userId, leftAt: null },
    select: { id: true },
  });

  if (active) {
    await tx.teamMember.update({
      where: { id: active.id },
      data: { role: data.role },
      select: { id: true },
    });
    return;
  }

  await tx.teamMember.create({
    data,
    select: { id: true },
  });
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await prisma.$transaction(async (tx) => {
    const alice = await tx.user.upsert({
      where: { id: ALICE_ID },
      update: { username: 'alice', email: 'alice@example.com', passwordHash, deletedAt: null },
      create: {
        id: ALICE_ID,
        username: 'alice',
        email: 'alice@example.com',
        passwordHash,
        createdAt: day(1),
      },
    });

    const bob = await tx.user.upsert({
      where: { id: BOB_ID },
      update: { username: 'bob', email: 'bob@example.com', passwordHash, deletedAt: null },
      create: {
        id: BOB_ID,
        username: 'bob',
        email: 'bob@example.com',
        passwordHash,
        createdAt: day(2),
      },
    });

    const carol = await tx.user.upsert({
      where: { id: CAROL_ID },
      update: { username: 'carol', email: 'carol@example.com', passwordHash, deletedAt: null },
      create: {
        id: CAROL_ID,
        username: 'carol',
        email: 'carol@example.com',
        passwordHash,
        createdAt: day(3),
      },
    });

    const frontendTeam = await tx.team.upsert({
      where: { id: FRONTEND_TEAM_ID },
      update: { name: 'Frontend Platform', description: 'Web 端基础设施与业务页面', deletedAt: null },
      create: {
        id: FRONTEND_TEAM_ID,
        name: 'Frontend Platform',
        description: 'Web 端基础设施与业务页面',
        createdById: alice.id,
        createdAt: day(4),
      },
    });

    const mobileTeam = await tx.team.upsert({
      where: { id: MOBILE_TEAM_ID },
      update: { name: 'Mobile App', description: 'iOS 与 Android 客户端', deletedAt: null },
      create: {
        id: MOBILE_TEAM_ID,
        name: 'Mobile App',
        description: 'iOS 与 Android 客户端',
        createdById: bob.id,
        createdAt: day(5),
      },
    });

    await upsertActiveMember(tx, {
      teamId: frontendTeam.id,
      userId: alice.id,
      role: 'OWNER',
      joinedAt: day(4),
    });

    await upsertActiveMember(tx, {
      teamId: frontendTeam.id,
      userId: bob.id,
      role: 'ADMIN',
      joinedAt: day(5),
    });

    await upsertActiveMember(tx, {
      teamId: frontendTeam.id,
      userId: carol.id,
      role: 'MEMBER',
      joinedAt: day(6),
    });

    await upsertActiveMember(tx, {
      teamId: mobileTeam.id,
      userId: bob.id,
      role: 'OWNER',
      joinedAt: day(5),
    });

    const boardUiTask = await tx.task.upsert({
      where: { id: TASK_BOARD_UI_ID },
      update: { title: '设计任务看板 UI', status: 'IN_PROGRESS', deletedAt: null },
      create: {
        id: TASK_BOARD_UI_ID,
        teamId: frontendTeam.id,
        title: '设计任务看板 UI',
        description: '支持按状态分列展示，拖动卡片更新状态。',
        status: 'IN_PROGRESS',
        priority: 3,
        assigneeId: alice.id,
        createdById: alice.id,
        dueAt: day(10, 18),
        createdAt: day(6),
      },
    });

    const filterApiTask = await tx.task.upsert({
      where: { id: TASK_FILTER_API_ID },
      update: { title: '实现任务筛选 API', status: 'TODO', deletedAt: null },
      create: {
        id: TASK_FILTER_API_ID,
        teamId: frontendTeam.id,
        title: '实现任务筛选 API',
        description: '支持 status、priority、assigneeId 组合筛选，并按创建时间分页。',
        status: 'TODO',
        priority: 2,
        assigneeId: bob.id,
        createdById: alice.id,
        dueAt: day(12, 18),
        createdAt: day(7),
      },
    });

    const ciTask = await tx.task.upsert({
      where: { id: TASK_CI_ID },
      update: { title: '搭建 CI 流水线', status: 'DONE', deletedAt: null },
      create: {
        id: TASK_CI_ID,
        teamId: frontendTeam.id,
        title: '搭建 CI 流水线',
        description: '提交时执行 lint、单测和构建，合并前必须通过。',
        status: 'DONE',
        priority: 1,
        assigneeId: carol.id,
        createdById: bob.id,
        completedAt: day(8, 16),
        createdAt: day(5),
      },
    });

    await tx.task.upsert({
      where: { id: TASK_LOGIN_CRASH_ID },
      update: { title: '修复登录页崩溃', status: 'TODO', deletedAt: null },
      create: {
        id: TASK_LOGIN_CRASH_ID,
        teamId: mobileTeam.id,
        title: '修复登录页崩溃',
        description: '冷启动后直接进入登录页会闪退，仅 Android 14 复现。',
        status: 'TODO',
        priority: 3,
        assigneeId: bob.id,
        createdById: bob.id,
        createdAt: day(9),
      },
    });

    await tx.comment.upsert({
      where: { id: COMMENT_UI_1_ID },
      update: { content: '看板列宽先按 320px 做，后面再做自适应。', deletedAt: null },
      create: {
        id: COMMENT_UI_1_ID,
        taskId: boardUiTask.id,
        authorId: bob.id,
        content: '看板列宽先按 320px 做，后面再做自适应。',
        createdAt: day(7, 10),
      },
    });

    await tx.comment.upsert({
      where: { id: COMMENT_UI_2_ID },
      update: { content: '拖拽交互我补一个原型，今天下班前发群里。', deletedAt: null },
      create: {
        id: COMMENT_UI_2_ID,
        taskId: boardUiTask.id,
        authorId: alice.id,
        content: '拖拽交互我补一个原型，今天下班前发群里。',
        createdAt: day(7, 11),
      },
    });

    await tx.comment.upsert({
      where: { id: COMMENT_FILTER_ID },
      update: { content: '分页参数统一用 page/pageSize，返回 total。', deletedAt: null },
      create: {
        id: COMMENT_FILTER_ID,
        taskId: filterApiTask.id,
        authorId: carol.id,
        content: '分页参数统一用 page/pageSize，返回 total。',
        createdAt: day(8, 9),
      },
    });

    await tx.task.upsert({
      where: { id: TASK_PUSH_NOTIFICATION_ID },
      update: { title: '接入推送通知', status: 'TODO', deletedAt: null },
      create: {
        id: TASK_PUSH_NOTIFICATION_ID,
        teamId: mobileTeam.id,
        title: '接入推送通知',
        description: '任务被分配或评论时推送提醒。',
        status: 'TODO',
        priority: 2,
        createdById: bob.id,
        createdAt: day(10),
      },
    });
  });

  const [userCount, teamCount, taskCount, commentCount] = await Promise.all([
    prisma.user.count(),
    prisma.team.count(),
    prisma.task.count(),
    prisma.comment.count(),
  ]);

  console.log(
    `Seed 完成：${userCount} 个用户、${teamCount} 个团队、${taskCount} 个任务、${commentCount} 条评论`,
  );
  console.log(`演示账号：alice / bob / carol，统一密码：${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
