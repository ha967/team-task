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
npx prisma studio                      # 图形化查看数据，默认 http://localhost:5555（详见 README.md）
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
| `README.md` | 项目总览 + 中文学习笔记（Nest / Prisma 基础概念） |
| `docs/specs/` | 每轮开发的 spec（`_template.md` 为模板） |
| `.claude/commands/` | `/spec`、`/verify` 两个工作流命令 |
| `.claude/agents/` | `reviewer` 独立审查者（只读） |
| `.claude/hooks/` | `gate.sh` 机械门禁，挂在 Stop hook 上 |
| `test/` | e2e 测试目录 |

## 已知缺口（改动时留意）
- 没有 comments 的 controller；评论目前只有 schema + seed 数据（`src/comments/` 是空目录）。
- **单元测试只有一处**：`src/user/user.service.spec.ts`（`normalizeEmail` / `extractUniqueTargets` / `mapUniqueConflict` 三个纯函数，不需要数据库）。`tasks.service.ts` 的角色判定、`team-access.service.ts` 的成员校验仍只有 e2e 覆盖 —— 改这类纯逻辑时优先补 `*.spec.ts`，别只靠 e2e 撞。
- `src/logger.middeware.ts` 是未接入的示例中间件（文件名拼写如此）。
- `ObserveModule` 的 appKey / appSecret 仍是占位值。
- **`users` 的 `username` / `email` 唯一性只存在于迁移 SQL 里**：部分唯一索引 `users_email_active_key` / `users_username_active_key`（`WHERE deleted_at IS NULL`）。`schema.prisma` 里**没有** `@unique`，不要加回去——那会让下一次 `migrate dev` 重建全量唯一索引，把「软删用户占着邮箱」的 bug 带回来。按 email 查用户一律 `findFirst({ where: { email, deletedAt: null } })`，`findUnique` 现在连类型都过不了。
- schema 层还剩两条**故意不修**的问题（详见 `README.md` 的「本项目现有设计的已知问题」）：`tasks.assignee_id` 没有复合外键保证「被指派人属于该团队」（靠 `TeamAccessService` 兜）；`team_members` 没有 `leftAt`——一旦实现成员管理接口（邀请 / 移除 / 退出）必须先补 `leftAt` 再动接口。

## 开发工作流
三档，别一律全套跑（流程比改动重就是负担）。
`/spec` 和 `/verify` 都由我手动敲，模型不要自行发起；实现完成后**提醒我跑 `/verify`** 即可。
- **轻**（1–2 个文件 / 修 bug）：动手前用 5 行复述 + 列出不确定点，确认后实现，然后提醒我 `/verify`。
- **中**（单模块新功能）：`/spec` → 实现 → 提醒我 `/verify`。
- **重**（跨模块 / 动 schema / 碰认证权限 / 新依赖）：`/spec` 走完多轮追问 → 小步实现 → 提醒我 `/verify`。

## 必须停下来问的情况
不要靠猜，也不要替我做决定。命中任一条就先问：
- 有多种合理实现且成本差异大（要不要新建 module、要不要抽公共方法）
- 需要打破既有约定，或要改公共接口 / `prisma/schema.prisma` / 迁移 / 新依赖 / 新环境变量
- 业务语义需要猜（权限规则、状态流转、默认值）
- 需求里出现「顺便」「也」「优化一下」「更友好」这类模糊词 —— 追问出具体含义
- 我给的方案有明显代价而我没意识到 —— 直接指出来，别闷头照做

能自己从代码库查到的事实一律自己查，不要拿能查的东西问我。

## 验收
- 机械门禁由 Stop hook 自动执行（`.claude/hooks/gate.sh`：lint + 源码 tsc + 测试 tsc + 单元测试 + e2e，后两者有对应文件时才跑；`src` / `test` / tsconfig 无改动时跳过）。跑 e2e 需要 Postgres，Docker 没起时会拦下。
- `/verify` 的 L0 用 `GATE_ALWAYS=1` 强制真跑，不受「无改动则跳过」影响 —— 否则先提交再验收会得到假绿。
- 审查一律派**独立上下文的 `reviewer` 子代理**，只给它 diff 和 spec，**不要先给它我的判断** —— 带着结论去审只会验证结论。
- 审查发现的新问题，回写进 `.claude/agents/reviewer.md` 的清单，让它越用越准。

## 提交规范
- 目前直接在 `main` 上开发；commit message 形如 `feat: 中文描述`（Conventional Commits 前缀 + 中文短语）。
- **不要自行提交**：改完把改动留在工作区，先给出 `git status --short` + `git diff --stat` + 改动说明（关键片段 + 为什么这么改），等我看过 diff、明确说「提交」再 commit。提交信息也要先拟好给我看。
- 只有我明确说了「提交」「拆成 N 个提交」这类指令才执行 `git add` / `git commit`；「改完/做完/可以了」不算授权。
