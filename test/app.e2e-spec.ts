import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils/test-app.js';

/**
 * 应用级别的最小验证：/api 前缀生效、全局守卫默认拒绝、@Public() 放行。
 *
 */
describe('应用启动与全局守卫 (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('未登录访问受保护路由返回 401', async () => {
    // 返回 401 而不是 404，同时证明路由挂在 /api 前缀下
    await request(app.getHttpServer()).get('/api/tasks').expect(401);
  });

  it('登录接口是公开路由，空 body 返回 400 而不是 401', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({})
      .expect(400);
  });
});
