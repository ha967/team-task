# 任务详情接口

> 由 `/spec` 生成。实现前把这份文档写完，验收时逐条勾这里。

## 背景

`tasks` 模块已经能列表 / 创建 / 更新 / 删除，但**没有单任务读取接口**：`GET /api/tasks` 只能拿到自己所属团队的分页列表，想取一条任务必须把列表拉下来再在客户端里找。任务详情页、评论页（后续轮次）都需要一个稳定的「按 id 读一条任务」的入口。

## 目标

登录用户能通过 `GET /api/tasks/:taskId` 读取**其所属团队内**任意一条未删除任务的详情；非团队成员 403，任务不存在或已软删 404，非法 UUID 400，响应不含 `createdById` / `deletedAt`。

## 不在范围内

明确排除，本轮不做。出现了就是越界改动：

- 评论：详情**不**返回评论列表，也不返回 `commentCount`（`src/comments/` 仍为空目录，评论是独立一轮）
- 前端：不新增任务详情页、不改 `web/` 任何文件
- 改动 `TASK_SELECT`（它被列表 / 创建 / 更新 / 删除四处的响应共用，改它会连带改变那四个接口的返回体）
- 任务列表的筛选能力（`teamId` / `priority` / 关键词 / 排序）—— 仍只有 `status` / `assigneeId` / 分页
- `PATCH` / `DELETE` 的权限规则、`getTaskOrThrow` 的既有行为
- `prisma/schema.prisma`、迁移、新依赖、新环境变量
- Swagger / OpenAPI 文档（项目目前没有，不因本接口引入）
- 团队改删、成员管理、用户资料修改

## 验收标准

### 机器可验

用 seed 数据（alice=Frontend Platform 的 OWNER、bob=Frontend Platform 的 ADMIN + Mobile App 的 OWNER、carol=Frontend Platform 的 MEMBER），通过 supertest 断言。新用例写在 `test/tasks.e2e-spec.ts`。

**鉴权与权限**

- [ ] AC1：未登录 `GET /api/tasks/<任一任务的 id>` → **401**
- [ ] AC2：alice 请求 Frontend Platform 的 `设计任务看板 UI` 详情 → **200**
- [ ] AC3：carol（Frontend Platform 的 `MEMBER`，既不是该任务的创建者也不是负责人）请求同一条任务详情 → **200**（与列表语义一致：团队成员都能读，不按创建者/负责人收紧）
- [ ] AC4：carol 请求 Mobile App 的 `修复登录页崩溃` 详情 → **403**，`message` 为 `你不是该团队成员`
- [ ] AC5：`GET /api/tasks/<不存在的合法 UUID>` → **404**，`message` 为 `任务不存在`
- [ ] AC6：`GET /api/tasks/not-a-uuid` → **400**（`ParseUUIDPipe`，而不是 Prisma 抛 500）

**响应体形状**

- [ ] AC7：AC2 的响应体顶层键**恰好**为 `id` / `teamId` / `title` / `description` / `estimateHours` / `status` / `priority` / `assigneeId` / `dueAt` / `completedAt` / `createdAt` / `updatedAt` / `assignee` / `createdBy` / `team`
- [ ] AC8：响应体**不含** `createdById`、`deletedAt`、`passwordHash`（用 `JSON.stringify(body)` 断言不含这三个 key）
- [ ] AC9：`assignee` 为 `{ id, username } | null`；`createdBy` 为 `{ id, username }`（创建者是谁能被读出，`createdById` 本身不漏）。两个分支都要有覆盖：非 `null` 由 TD2（seed 任务）验，`null` 由 TD9（自建未指派任务）验；断言只钉形状，不钉具体用户名（seed 的 `assigneeId` 可被手工改派）
- [ ] AC10：`team` 为 `{ id, name }`，且 `team.id === body.teamId`
- [ ] AC11：`estimateHours` 类型为 `number | null`，`dueAt` / `completedAt` 是 ISO 字符串或 `null`（与列表返回的序列化形式一致）

**软删语义**

- [ ] AC12：自建一条任务后把它的 `deletedAt` 置为当前时间，再请求其详情 → **404**，`message` 为 `任务不存在`
- [ ] AC13：自建一个团队 + 一条任务，把该团队的 `deletedAt` 置为当前时间后请求该任务详情 → **404**（与 `GET /api/tasks` 的 `team: { deletedAt: null }` 过滤保持一致）；用例结束自行清理自建数据

**不回归**（`TASK_SELECT` 被四处共用，这四条把「改动前就有的返回体」钉死）

下面的「列表 13 键」指 `id` / `teamId` / `title` / `description` / `estimateHours` / `status` / `priority` / `assigneeId` / `dueAt` / `completedAt` / `createdAt` / `updatedAt` / `assignee`，**不含** `createdBy`、`team`、`createdById`、`deletedAt`。四处断言必须共用同一份键常量 + 一个 helper，不许复制四份。

- [ ] AC14：`GET /api/tasks` 列表 item 的顶层键**恰好**是列表 13 键（`Object.keys(item).sort()` 与常量全等），**不含** `createdBy`、`team`
- [ ] AC15：`POST /api/tasks` 201 响应体的顶层键**恰好**是列表 13 键
- [ ] AC16：`PATCH /api/tasks/:taskId` 200 响应体的顶层键**恰好**是列表 13 键
- [ ] AC17：`DELETE /api/tasks/:taskId` 200 响应体的顶层键**恰好**是 `id`、`deleted`（值为 `true`），键集合与 `{ id: string, deleted: true }` 全等
- [ ] AC18：AC7 的详情键集 = 列表 13 键 + `createdBy` + `team`，即详情是列表的**严格超集**且只多这两个键
- [ ] AC19：`npm run lint` 通过
- [ ] AC20：`npx tsc -p tsconfig.build.json --noEmit` 与 `npx tsc -p tsconfig.test.json --noEmit` 均通过
- [ ] AC21：`npm run test:e2e` 全绿（新增用例 + 既有 TB1–TB3），且用例自建的数据在 `afterAll` 里清理
- [ ] AC22：`bash .claude/hooks/gate.sh < /dev/null` 退出 0

### 人工判定

- [ ] AC23：错误信息是中文、可直接呈现给用户（不是 `PrismaClientKnownRequestError` 之类的原文）
- [ ] AC24：`src/tasks/` 下没有新增 `any`，没有只挂 `@IsOptional()` 不配校验的字段（本接口无入参 DTO，不需要新增 DTO 文件）
- [ ] AC25：`git diff` 里没有「不在范围内」一节列出的东西（重点看 `web/`、`prisma/`、`src/comments/` 是否完全没动）
- [ ] AC26：controller 仍是薄的一层——只有 `@Param(..., ParseUUIDPipe)` 取参与一次 service 调用，没有内联 Prisma 查询
- [ ] AC27：AC15–AC17 的三条老路径断言，其期望值等于**改动前**的实际返回体（如需先跑一次老代码确认基线，就在改动前跑）；若发现某条老路径的现状与「列表 13 键」不一致，**报出来、不要顺手改实现** —— 那属于另一个 bug，不在本轮范围

## 已定的决策

第 3 步追问里定下来的选择，附一句理由。防止实现阶段反复摇摆。

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 详情字段范围 | 列表字段 + `createdBy: { id, username }` + `team: { id, name }`，不含 `commentCount` | 详情页必然要显示「谁创建的 / 属于哪个团队」，不带就得再打一次 `/teams/:id`；两项都是白名单内安全字段 |
| 评论是否属于本轮 | 不属于，连 `commentCount` 都不给 | `src/comments/` 是空目录、未注册进 `app.module.ts`；混进来会让 diff 从「一个只读接口」变成半个评论模块 |
| 前端是否属于本轮 | 不属于，只出后端 | 原需求是「后端任务详情」；前端还没有任务 CRUD 表单，单独的只读详情页价值有限，跨语言 diff 会让验收失效 |
| 谁能读详情 | 该任务所属团队的**任意成员** | 与 `GET /api/tasks` 的语义一致（列表已把团队全部任务给到每个成员），详情比列表更严会制造「列表里有、点进去 403」的诡异情况 |
| 非成员 / 不存在 | 非成员 **403**，不存在或已软删 **404** | 沿用 `docs/specs/teams-module.md` 的 AC16/AC17 决策；UUID 枚举不出来，且与 tasks 其余接口的 403 语义一致 |
| 判定顺序 | **先判任务存在（404）再判成员身份（403）** | 反过来会把「任务不存在」误报成「你不是该团队成员」，`teams.service.ts:78-84` 已写明这个顺序的理由 |
| 响应形状 | 裸对象，不包 `{ task }` / 信封 | 与 `getTeamDetail` 一致；分页信封只在列表接口用 |
| `TASK_SELECT` | **不改**，新增独立的 `TASK_DETAIL_SELECT = { ...TASK_SELECT, createdBy, team }` | `TASK_SELECT` 被列表 / 创建 / 更新 / 删除四处共用，改它会静默改变那四个接口的返回体 |
| 团队的软删 | 详情要求 `team.deletedAt: null`，团队被软删即视为任务不存在（404） | 列表已按此过滤；否则会造出「列表里查不到、但知道 id 就能打开」的幽灵任务 |
| 路由形状 | `GET /api/tasks/:taskId`（与 `PATCH` / `DELETE` 同层级） | 既有 tasks 路由都是扁平的，不引入 `/teams/:teamId/tasks/:taskId` 第二种查法 |
| 老路径字段断言 | 给 `POST` / `PATCH` / `DELETE` 补上「返回体键集合」硬断言，四处共用一份常量 + 一个 helper | 补断言是本轮唯一能挡住「误改 `TASK_SELECT`」的机械手段；四份复制会在下次改字段时又分叉 |

## 已知取舍

明知不完美但先接受，验收时不要当 bug：

- **`assignee` 与 `createdBy` 都不过滤 `deletedAt`**：与列表一致。负责人 / 创建者被软删后详情仍返回其 `username`（`assigneeId` 只在用户硬删时被 `SetNull`；`createdById` 是 `Restrict`，硬删直接被挡）。要「显示为已注销」得等用户注销相关的一轮统一处理。
- **详情多一次「是否成员」查询**：`getTaskDetail` 先按 id 取任务（带完整 select），再调 `TeamAccessService.assertTeamMember`，比 `updateTask` 那条路径少一次往返，但非成员请求仍会先读到任务行再被 403 拒掉——不影响正确性，只是多读一次库。
- **`createdBy` / `team` 让详情比列表宽**：同一个任务在列表和详情里的字段集合不同，前端不能把两份类型混用（已通过 AC7 固定形状）。
- **`test/tasks.e2e-spec.ts` 的 diff 比「只加详情用例」大一圈**：多出约 15–25 行字段集合断言（常量 + helper + 三处调用）。这是你点名要的硬保证，代价是这一轮测试改动比接口本身还大。
- **四条键集合断言会锁死返回体形状**：以后任何人往 `TASK_SELECT` 加字段，都必须同步改测试里的常量——这是刻意的，加字段等于改公共响应契约，本就该被拦一次。
- **读路径补了 `team.deletedAt` 过滤，写路径没补**：`GET /api/tasks/:taskId` 会 404，但 `PATCH` / `DELETE` 走的 `getTaskOrThrow` 仍只有 `{ id, deletedAt: null }`，团队软删后知道 id 仍能改 / 删该任务。本轮 spec 把 `getTaskOrThrow` 明确划在范围外，因此这是**有意留到下一轮的不一致**，已记进 `docs/README.md` 的「尚未实现 / 已知缺口」。验收时不要把它当本轮 bug；TD8 只覆盖读路径。
- **不做 `include` 参数**（`?include=comments` 之类）：本轮没有评论模块可挂，提前留钩子会变成没人用的死代码。

## 预计改动

| 文件 | New / Edit | 说明 |
| --- | --- | --- |
| `src/tasks/tasks.service.ts` | Edit | 新增 `TASK_DETAIL_SELECT` 与 `getTaskDetail(taskId, userId)`：查 `id + deletedAt: null + team.deletedAt: null` → 404；再 `assertTeamMember` → 403；返回任务 |
| `src/tasks/tasks.controller.ts` | Edit | 新增 `@Get(':taskId')` handler，`@Param('taskId', ParseUUIDPipe)` + `@CurrentUser('sub')` |
| `test/tasks.e2e-spec.ts` | Edit | ① 新增 `TASK_LIST_KEYS` 常量 + `expectExactKeys(body, keys)` helper；② 用它在列表 item（逐条）/ `POST` / `PATCH` / `DELETE` 四处钉住返回体键集合（AC14–AC17）；③ 新增任务详情用例（AC1–AC13、AC18，TD9 补 `assignee: null` 分支）；自建数据在 `afterAll` 清理，复用现有 `createdTaskIds` |
| `docs/README.md` | Edit | 「当前进度 → 已实现」的任务一行补上 `GET /api/tasks/:taskId` |

不新增 DTO 文件（无请求体、无 query）、不新增 module、不动 `app.module.ts`。

## 风险与回滚

- **最坏情况**：`@Get(':taskId')` 的注册顺序或路径与既有 `GET /api/tasks` 冲突，导致列表 404 / 详情命中错误路由。用例 AC2 + AC14 同时绿灯即可排除。
- **次坏情况**：误改 `TASK_SELECT`，列表 / 创建 / 更新 / 删除的响应体悄悄变宽，前端类型与实际不符。AC14–AC17 四条键集合断言专防这一条。
- **实施顺序**：先补 AC14–AC17 的四条断言并跑到绿（此时还没改 `src/`），再动 `src/tasks/` —— 否则「补断言 + 改实现」混在一个红绿周期里，分不清是断言写错还是实现改坏（与 teams 一轮「先补 TB1–TB3 基线」同一思路）。基线若与预期不符，按 AC27 报出来、不改实现。
- **无数据风险**：纯只读接口，不写库、不加迁移、不改 schema，无需回滚数据；出问题 `git revert` 该 commit 即可。
