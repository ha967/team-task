# Project Instructions — team-task

团队协作任务管理项目：根目录是 NestJS API，`web/` 是 React 前端（npm workspace）。

## Tech Stack
- 后端：NestJS 12（platform-express）+ TypeScript，ESM（`"type": "module"`、`module: nodenext`）
- 数据库：PostgreSQL 17（`compose.yml`）+ Prisma 7，走 driver adapter `@prisma/adapter-pg`
- 校验：class-validator / class-transformer（全局 ValidationPipe）
- 认证：`@nestjs/jwt` + bcryptjs，自建全局 `JwtAuthGuard`
- 前端：React 19 + Vite 8 + react-router-dom 7
- 测试：Vitest 4（`**/*.spec.ts`、`test/*.e2e-spec.ts` + supertest）
- Lint / 格式化：oxlint + prettier

## 代码风格
- **必须写分号**，单引号，`trailingComma: "all"`。
- **缩进 2 空格**（与全局规范一致：`.prettierrc` 的 `tabWidth: 2`、`.vscode/settings.json` 的 `editor.tabSize: 2`，保存即格式化）。
- ESM 相对导入**必须带 `.js` 后缀**：`import { UserService } from './user.service.js';`；纯类型用 `import type`。
- 命名：类 / 类型 PascalCase，函数 / 变量 camelCase，常量 UPPER_SNAKE_CASE。
- 文件命名 kebab-case 或 Nest 领域名：`x.controller.ts` / `x.service.ts` / `x.module.ts` / `dto/`。
- 注释与面向用户的错误信息用中文。

## 后端约定
- 所有路由统一挂 `/api`（`app.setGlobalPrefix('api')`），并启用 URI 版本化（目前无 `@Version`，即默认版本）。
- **默认拒绝**：全局 `APP_GUARD` = `JwtAuthGuard`，所有接口都要登录。放行用 `@Public()`（`src/common/decorators/public.decorator.ts`），取当前用户用 `@CurrentUser('sub')`。
- JWT payload 形状：`{ sub, typ: 'access' | 'refresh', jti? }`；`typ` 必须校验，refresh token 不能当 access token 用。
- Refresh token 只存 SHA-256 哈希，登录/刷新时轮换；旧令牌被复用则撤销该用户全部活跃令牌（见 `src/auth/auth.service.ts`）。
- 入参一律 DTO + class-validator；全局 `ValidationPipe({ transform, whitelist, forbidNonWhitelisted })`，未声明字段直接 400。
- Prisma 查询必须显式 `select`，禁止把 `passwordHash`、`createdById` 等内部字段透给前端；软删除统一 `deletedAt: null` 过滤。
- 业务异常用 Nest 内置异常类（`NotFoundException` / `ForbiddenException` / `ConflictException`），不要手写 `res.status()`。
- 权限判定放 service（如 `assertTeamMember`、`canModify`），controller 保持薄；`:id` 参数用 `ParseUUIDPipe`。

## 前端约定
- 目录按 feature 切分：`web/src/features/<domain>/{api.ts,types.ts,pages/,components/}`，跨域共享放 `web/src/shared/`。
- 请求一律走 `shared/api/http.ts` 的 `apiFetch`：自动带 Bearer、401 单飞刷新并重试、失败抛 `ApiError(status, message, body)`。
- access token 只放内存，refresh token 放 localStorage（`token-storage.ts`）；不要在别处直接读 `localStorage`。
- 组件 PascalCase，页面文件 `XxxPage.tsx`；别名 `@/*` → `web/src/*` 已配置，但现有代码多用相对路径。
- 开发环境前端通过 Vite proxy `/api` → `http://localhost:3001`，后端无需开 CORS。

## 常用命令
```bash
npm run dev            # 同时起 API(:3001) + web(:5173)
npm run dev:api        # 只起后端 watch
npm run dev:web        # 只起前端
docker compose up -d   # 起 Postgres
npm run build          # nest build
npm run build:web      # tsc --noEmit && vite build
npm run lint           # oxlint src/ test/（不含 web）
npm run format         # prettier 写回 src/、test/（不含 web/，web 需手动 npx prettier --write "web/src/**/*.{ts,tsx}")
npm test               # vitest run（*.spec.ts）
npm run test:e2e       # vitest run -c vitest.config.e2e.ts
npx prisma migrate dev --name add_xxx   # 改完 schema 后
npx prisma generate                     # 迁移后重新生成 client
npx prisma db seed                      # tsx prisma/seed.ts（alice/bob/carol，密码 Password123!）
npx prisma studio
```

## 数据库
- schema 源文件：`prisma/schema.prisma`；client 生成到 `src/generated/prisma/`，**已 gitignore**，clone 后必须先 `npx prisma generate`。
- Prisma 配置写在 `prisma7.config.ts`（Prisma 7 CLI 识别的文件名，加载 dotenv + schema/migrations/seed 路径），不要改成 `prisma.config.ts`。
- `PrismaService` 继承生成的 `PrismaClient` 并注入 `PrismaPg` adapter，`DATABASE_URL` 缺失时 `getOrThrow` 会拒绝启动。
- 模型：User / Team / TeamMember / Task / Comment / RefreshToken；全部 snake_case 列名映射 + 软删除。
- 环境变量启动期校验：`src/config/env.validation.ts`（`JWT_SECRET` 至少 32 字符）。

## 项目结构
| 路径 | 用途 |
| --- | --- |
| `src/main.ts` | bootstrap：`/api` 前缀、URI 版本化、全局 ValidationPipe、端口 3001 |
| `src/app.module.ts` | 模块装配 + 全局 JwtAuthGuard + 配置校验 |
| `src/auth/` | 注册 / 登录 / 刷新 / 登出、JWT 守卫 |
| `src/user/` | 用户查询（`GET /users/me`） |
| `src/tasks/` | 任务 CRUD（`/tasks`）+ 团队权限校验 |
| `src/prisma/` | `PrismaService` / `PrismaModule` |
| `src/common/` | `@Public()`、`@CurrentUser()`、`JwtPayload` 类型 |
| `prisma/` | schema、migrations、seed |
| `web/src/` | React 前端（`app/` 路由、`features/`、`shared/`） |
| `docs/README.md` | 中文学习笔记（Nest / Prisma 基础概念） |
| `test/` | e2e 测试目录 |

## 已知缺口（改动时留意）
- 没有 teams / comments 的 controller；团队和评论目前只有 schema + seed 数据。
- `GET /tasks` 未按调用者所属团队过滤，任何登录用户都能看到全库未删除任务。
- 除默认 e2e 外没有单元测试；`test/app.e2e-spec.ts` 期望 `GET /` 返回 `Hello World!`，与现有代码不符（无 `AppController`）。
- `src/logger.middeware.ts` 是未接入的示例中间件（文件名拼写如此）。
- `ObserveModule` 的 appKey / appSecret 仍是占位值。

## 提交规范
- 目前直接在 `main` 上开发；commit message 形如 `feat: 中文描述`（Conventional Commits 前缀 + 中文短语）。
