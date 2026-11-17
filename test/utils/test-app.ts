import type { INestApplication } from '@nestjs/common';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';

// seed 里三个用户的密码统一是这个（见 prisma/seed.ts）
export const SEED_PASSWORD = 'Password123!';

export const SEED_EMAILS = {
  alice: 'alice@example.com',
  bob: 'bob@example.com',
  carol: 'carol@example.com',
} as const;

// Frontend Platform：alice=OWNER / bob=ADMIN / carol=MEMBER
// Mobile App：只有 bob=OWNER
export const SEED_TEAM_NAMES = {
  frontend: 'Frontend Platform',
  mobile: 'Mobile App',
} as const;

/**
 * 复刻 src/main.ts 的 bootstrap。
 *
 * 直接 createNestApplication() 会缺失 /api 前缀和全局 ValidationPipe，
 * 那样 e2e 断言的其实是另一套路由与校验行为 —— 测试绿了但线上仍 404。
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.init();
  return app;
}

/**
 * 登录取 access token。失败时把响应体带出来，否则只剩一句「expected 200」很难查。
 */
export async function login(
  app: INestApplication,
  email: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: SEED_PASSWORD });

  if (res.status !== 200) {
    throw new Error(
      `登录失败（${email}）：HTTP ${res.status} ${JSON.stringify(res.body)}`,
    );
  }

  return res.body.accessToken as string;
}
