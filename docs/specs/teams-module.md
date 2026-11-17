# 补全团队模块

> 由 `/spec` 生成。实现前把这份文档写完，验收时逐条勾这里。

## 背景

`src/teams/` 是半成品：`teams.module.ts` 已注册进 `app.module.ts:36`，但 `teams.controller.ts` 是空类（`GET /api/teams` 返回 404）、`teams.service.ts` 只有一个无 `select` 的 `findMany`、`ListTeamsQueryDto` 从 query 里取 `userId`（水平越权入口）且 `teamName` 挂了 `@IsOptional()` 却没配任何校验。门禁（lint + tsc）全绿，但接口实际不存在。

同时 `TasksService` 里有一份私有的 `assertTeamMember`。团队模块一补就会形成第二份权限判定副本。

## 目标

登录用户能查询自己所属的团队列表、查看团队详情（含成员与各自角色）、创建团队并自动成为该团队的 OWNER。权限判定只有一份实现，tasks 与 teams 共用。

## 不在范围内

明确排除，本轮不做。出现了就是越界改动：

- 团队的 `PATCH` / `DELETE`（改名、改简介、解散团队）
- 成员管理：添加 / 移除成员、修改成员角色、退出团队
- 前端：`web/src/features/teams/` 下一轮再做，本轮只出后端
- `prisma/schema.prisma` 的任何修改与迁移（含团队名唯一约束）
- 任务与评论模块的功能变更（只允许为抽取 `TeamAccessService` 而改 `tasks.service.ts` 的调用方式）

## 验收标准

### tasks 回归基线（**先写**，重构前后都必须绿）

tasks 零测试，而本轮要改它的权限判定方式。所以先给它补三条 e2e，形成「改前绿 → 改 → 仍绿」的回归保护。这三条**必须先于任何 `src/` 改动提交**。

- [ ] TB1：未登录 `GET /api/tasks` → 401
- [ ] TB2：alice 请求 `GET /api/tasks` → 200，`items` 含 frontendTeam 的三个 seed 任务（`设计任务看板 UI` / `实现任务筛选 API` / `搭建 CI 流水线`），且**不含** mobileTeam 的 `修复登录页崩溃`、`接入推送通知`
- [ ] TB3：alice 向 frontendTeam `POST /api/tasks` → 201，且新任务出现在随后的列表中；carol 向 mobileTeam 建任务 → **403**（她不是该团队成员）

断言不用精确总数（e2e 会往库里写数据，重跑会累积），只断言「包含 / 不包含指定标题」。

### 机器可验

用 seed 数据（alice=frontendTeam 的 OWNER、bob=frontendTeam 的 ADMIN + mobileTeam 的 OWNER、carol=frontendTeam 的 MEMBER）通过 supertest 断言。

**鉴权**

- [ ] AC1：未登录 `GET /api/teams` → 401
- [ ] AC2：未登录 `POST /api/teams` → 401

**列表 `GET /api/teams`**

- [ ] AC3：alice 请求 → 200，`items` 里**有** frontendTeam、**没有** mobileTeam
- [ ] AC4：bob 请求 → 200，`items` 里 frontendTeam 和 mobileTeam **都有**
- [ ] AC5：`items[0]` 的每个元素只含 `id` / `name` / `description` / `createdAt` / `updatedAt` / `role` 六个键，**不含** `createdById`、`deletedAt`
- [ ] AC6：alice 看到的 frontendTeam 那一条 `role === 'OWNER'`；carol 同一条 `role === 'MEMBER'`
- [ ] AC7：列表按 `createdAt` 降序排列
- [ ] AC8：`?page=0` → 400；`?pageSize=0` → 400；`?pageSize=101` → 400；`?pageSize=abc` → 400
- [ ] AC9：`?userId=<bob 的 id>` → **400**（DTO 已无此字段，`forbidNonWhitelisted` 生效）
- [ ] AC10：`?teamName[x]=y` → **400**（`@IsString` 生效，而不是把对象漏进 Prisma 抛 500）
- [ ] AC11：`?teamName=<frontend 全名>` → 200 且只返回匹配项；teamName 用 `contains` 模糊匹配、大小写不敏感
- [ ] AC12：`?teamName=<超过 64 字符>` → 400（`@MaxLength(64)` 对齐 `VarChar(64)`）

**详情 `GET /api/teams/:id`**

- [ ] AC13：alice 请求 frontendTeam → 200，`members` 长度 3
- [ ] AC14：`members` 每项只含 `userId` / `username` / `avatarUrl` / `role` / `joinedAt`，**不含** `email`、`passwordHash`
- [ ] AC15：`members` 里 carol 的 `role === 'MEMBER'`，bob 的 `role === 'ADMIN'`
- [ ] AC16：carol 请求 mobileTeam（她不是成员）→ **403**，message 为 `你不是该团队成员`
- [ ] AC17：`GET /api/teams/<不存在的 UUID>` → 404，message 为 `团队不存在`
- [ ] AC18：`GET /api/teams/not-a-uuid` → **400**（`ParseUUIDPipe`，而不是 Prisma 抛 500）
- [ ] AC19：把某团队 `deletedAt` 手动置为当前时间后，列表不含它、详情返回 404

**创建 `POST /api/teams`**

- [ ] AC20：body `{}` → 400；body `{ name: '' }` → 400；body `{ name: '<65 字符>' }` → 400
- [ ] AC21：body `{ name: 'x', foo: 'bar' }` → 400（未声明字段）
- [ ] AC22：alice 创建 `{ name: '新团队', description: '简介' }` → **201**，响应体含 `id`、`name`、`role === 'OWNER'`
- [ ] AC23：AC22 之后，数据库 `team_members` 里存在 `(teamId=新团队 id, userId=alice id, role=OWNER)` 一行
- [ ] AC24：AC22 之后，该团队立刻出现在 alice 的 `GET /api/teams` 结果里
- [ ] AC25：连续创建两个同名团队都返回 201（允许重名）
- [ ] AC26：`{ name: 'x' }` 不带 description 也能 201

**门禁**

- [ ] AC27：`bash .claude/hooks/gate.sh < /dev/null` 退出 0（lint + src 类型 + 测试类型 + 单元测试 + e2e）
- [ ] AC32：把某团队成员对应的用户软删后，该成员不再出现在 `members` 里（成员关系行仍在，靠查询过滤）

### 人工判定

- [ ] AC28：所有错误信息是中文、可直接呈现给用户（不是 `PrismaClientKnownRequestError` 之类的原文）
- [ ] AC29：`git diff` 里没有「不在范围内」一节列出的东西
- [ ] AC30：`src/teams/` 下没有残留的 `any`、没有只挂 `@IsOptional()` 不配校验的字段
- [ ] AC31：权限判定只有一份实现 —— 全仓库 `assertTeamMember` 的定义只有 `team-access.service.ts` 一处

## 已定的决策

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 端点范围 | 列表 + 详情 + 创建（无改 / 无删 / 无成员管理） | 成员管理是权限泥潭，值得单独一轮 |
| 权限判定位置 | 抽 `TeamAccessService`，tasks 与 teams 共同注入 | 复制副本必然分叉，权限不一致最难查 |
| 列表响应契约 | `{ items, total, page, pageSize }`，与 tasks 一致 | 前端已在消费信封；裸数组在 Prisma 里顺序不保证 |
| 前端 | 本轮不做 | 一次 diff 跨语言会让验收失效 |
| 谁能创建团队 | 任何登录用户 | B 方案会让新用户建不了第一个团队 |
| 创建者角色 | 同一事务写 `Team` + `TeamMember(OWNER)` | 否则会造出创建者自己都看不见的黑洞团队 |
| 非成员看详情 | 403（而非 404） | UUID 枚举不出来；与 tasks 的 403 语义一致 |
| 团队名唯一性 | 允许重名，不动 schema | 唯一约束会撞上软删冲突，要手写部分唯一索引 |
| 测试方式 | e2e + 用例自建自清，仍连开发库 | 权限 bug 只有真库 + 三角色才暴露；mock Prisma 等于没验 |
| 改动 tasks 的前置条件 | 先补 3 条 tasks e2e 基线，改前绿、改后仍绿 | tasks 零测试，直接改权限判定等于盲改 |
| 门禁是否跑 e2e | 跑。`gate.sh` 同时跑单元测试与 e2e，并新增 `tsconfig.test.json` 检查测试类型 | 宁可 hook 慢一点、依赖 Postgres，也不接受「删掉测试文件门禁仍绿」 |

**本轮由我代定、你可在验收前否决的两项**：

| 代定项 | 结论 | 理由 |
| --- | --- | --- |
| `teamName` 过滤 | 保留，`@IsString` + `@MaxLength(64)`，`contains` + `mode: 'insensitive'` | 原 DTO 已声明该字段；删掉会让前端失去搜索能力，保留的成本只是两行 |
| 详情成员字段 | 含 `username` / `avatarUrl`，**不含** `email` | 成员列表的用途是认人，不需要邮箱；少透一个个人字段 |

顺带删掉的：原 DTO 的 `teamId` 参数（详情接口已覆盖，留着只会造成两种查法）。

## 已知取舍

接受以下代价，验收时不要当成 bug：

- **要动 `src/tasks/tasks.service.ts` 的两个调用点。** 靠新补的 TB1–TB3 兜底，但这三条只覆盖列表过滤、创建、非成员 403，**改任务删除 / 更新权限逻辑不在基线范围内** —— 本轮也不该碰这两处。
- **403 会泄露「该团队存在」。** 团队 id 是 UUID，枚举不出，接受这点泄露换取与 tasks 的语义一致。
- **e2e 直连开发库 `team_task`。** 用例漏清理就会污染 seed 数据，恢复方式是 `npx prisma db seed`。
- **允许重名。** 将来若要唯一，得先解决软删与唯一约束的冲突，写成 `WHERE deleted_at IS NULL` 的部分唯一索引，且无法用 Prisma schema DSL 表达。
- **门禁现在依赖 Postgres。** `gate.sh` 会跑 e2e，因此 Docker 没起时，只要有 `src` 改动，每轮结束都会被 exit 2 拦下。这是「覆盖优先于速度」的选择，不是 bug；应急可先 `docker compose up -d`。

## 预计改动

| 文件 | New / Edit | 说明 |
| --- | --- | --- |
| `src/teams/team-access.service.ts` | New | `assertTeamExists` / `assertTeamMember` / `assertRole`，从 tasks 搬来并扩展 |
| `src/teams/teams.service.ts` | Edit | `getTeams` 加分页 + `select` + `role`；新增 `getTeamDetail` / `createTeam` |
| `src/teams/teams.controller.ts` | Edit | `GET /`、`GET /:id`、`POST /`，`ParseUUIDPipe`，`@CurrentUser('sub')` |
| `src/teams/dto/list-teams-query.dto.ts` | Edit | 删 `userId` / `teamId`，修 `teamName` 校验 |
| `src/teams/dto/create-team.dto.ts` | New | `name` 必填 1–64；`description?` 可选 |
| `src/teams/teams.module.ts` | Edit | 注册并 `exports: [TeamAccessService]` |
| `src/tasks/tasks.service.ts` | Edit | 改注入 `TeamAccessService`，删掉两个私有 assert |
| `src/tasks/tasks.module.ts` | Edit | `imports` 加 `TeamsModule` |
| `test/utils/test-app.ts` | New | 复刻 `main.ts` 的 bootstrap（`/api` 前缀 + URI 版本化 + ValidationPipe），并提供登录取 token 的 helper |
| `test/tasks.e2e-spec.ts` | New | TB1–TB3，重构前就得绿 |
| `test/teams.e2e-spec.ts` | New | AC3–AC26 |
| `test/app.e2e-spec.ts` | Edit | 删掉对不存在的 `AppController` 的 `Hello World!` 断言，改成「未登录访问受保护路由返回 401」 |
| `tsconfig.test.json` | New | 让 tsc 覆盖 `test/`，此前测试文件的类型完全没被检查 |
| `.claude/hooks/gate.sh` | Edit | 门禁加入 e2e 与测试类型检查 |

## 风险与回滚

- **无 schema 变更，无迁移风险。**
- **主要风险是动 tasks**：`TasksService` 换成注入 `TeamAccessService` 后，若 `TeamsModule` 的 `exports` 漏写，`app.module` 会在启动时直接报 `Nest can't resolve dependencies` —— 这是好事，属于启动期失败而非运行时静默错误。
- **次生风险是循环依赖**：`TasksModule` 导入 `TeamsModule`。当前 teams 不依赖 tasks，方向是单向的；但将来若 teams 需要 tasks 的能力，就会出现循环，届时要把 `TeamAccessService` 挪进独立的 `src/common/` 模块。
- **回滚**：`git revert <commit>` 即可整体撤回，无数据形态变更。若 e2e 污染了数据，`npx prisma db seed` 恢复。
