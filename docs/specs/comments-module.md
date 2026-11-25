# 后端评论模块

> 由 `/spec` 生成。实现前把这份文档写完，验收时逐条勾这里。

## 背景

`Comment` 模型、`comments` 表、软删字段和 3 条 seed 评论都已经存在，但 `src/comments/` 是空目录：没有 module / controller / service / DTO。目前「人 → 团队 → 任务 → 评论」这条主线在 API 层断在最后一环 —— 任务详情页能展示任务，却读不到任何评论。schema 层的连带问题（作者外键 `onDelete: Restrict`、`@@index([taskId, createdAt])`）已经在前一轮修好，本轮只补应用层。

## 目标

新增 `src/comments/` 模块，提供「任务下评论的列表 / 创建 / 编辑 / 软删除」四个接口；所有读写都要求调用者是任务所属团队的成员，编辑限作者本人、删除限作者或团队 `OWNER` / `ADMIN`；不修改 schema、迁移和任何既有接口的返回体。

## 不在范围内

明确排除，本轮不做。出现了就是越界改动：

- `prisma/schema.prisma`、`prisma/migrations/`、`prisma/seed.ts` 的任何改动（`Comment` 模型已够用）
- 前端任何改动（`web/`），包括任务详情页的评论区
- 评论分页（`page` / `pageSize` / `total`）与评论搜索
- 在任务列表 / 详情返回体里加 `commentCount` 或 `comments` 字段（会改 `TASK_SELECT` / `TASK_DETAIL_SELECT` 的公共契约）
- 评论的硬删除接口、回收站 / 恢复接口、审计接口
- 楼中楼 / 回复 / @提及 / 通知 / 富文本 / 附件
- 限流、敏感词、防刷
- 重构 `tasks.service.ts` 现有的权限判定（`canModify` / `canDelete` 保持原样；本轮只给 `TasksService` 增加一个 public 方法并导出）
- 用户注销 / 成员移除相关逻辑（目前都没有接口）

## 接口契约

| 方法 | 路径 | 说明 | 成功状态 |
| --- | --- | --- | --- |
| GET | `/api/tasks/:taskId/comments` | 任务下评论列表，`createdAt` 升序 | 200 |
| POST | `/api/tasks/:taskId/comments` | 创建评论，作者 = 当前登录用户 | 201 |
| PATCH | `/api/comments/:commentId` | 编辑评论内容 | 200 |
| DELETE | `/api/comments/:commentId` | 软删除评论 | 200 |

评论视图（下文称 `COMMENT_SELECT`）顶层键固定为 7 个：

```json
{
  "id": "...",
  "taskId": "...",
  "authorId": "...",
  "content": "...",
  "createdAt": "...",
  "updatedAt": "...",
  "author": { "id": "...", "username": "..." }
}
```

- 不透 `deletedAt`、`passwordHash`、`author.email` 等内部字段。
- `DELETE` 返回 `{ "id": "...", "deleted": true }`，与 `DELETE /api/tasks/:taskId` 一致。
- 列表直接返回数组（不是 `{ items, total, ... }`），排序 `[{ createdAt: 'asc' }, { id: 'asc' }]`（同一毫秒的评论用 id 兜底，保证顺序稳定）。
- 所有 `:taskId` / `:commentId` 参数走 `ParseUUIDPipe`，非法 UUID 返回 400。

## 权限与存在性语义

「任务算不算存在」复用任务的唯一定义：任务未软删 **且** 所属团队未软删。实现上不复制 `TASK_ALIVE_FILTER`，而是给 `TasksService` 增加 public 方法：

```ts
assertTaskAlive(taskId: string): Promise<{ id: string; teamId: string }>
```

不存在时抛 `NotFoundException('任务不存在')`。

| 操作 | 判定顺序 | 结果 |
| --- | --- | --- |
| GET 列表 | 任务不存在 / 团队软删 → 404；非团队成员 → 403 | 任意角色都能读 |
| POST 创建 | 同上；`authorId` 强制取当前用户，请求体不接受 `authorId` | 任意角色都能评论 |
| PATCH 编辑 | 评论不存在或已软删 → 404；评论所属任务不存活 → 404；非团队成员 → 403；非作者 → 403 | 只有作者本人 |
| DELETE 删除 | 同上第一步；非团队成员 → 403；既非作者、角色又为 `MEMBER` → 403 | 作者或 `OWNER` / `ADMIN` |

补充约定：

- 评论软删后不保留墓碑：列表不可见，PATCH / DELETE 再访问返回 404。
- 已 `DONE` 的任务仍然可以评论（评论是讨论，不跟任务状态挂钩）。
- 评论作者的 `username` 不过滤 `deletedAt`，与任务详情的 `assignee` / `createdBy` 口径一致；当前没有用户注销接口，此取舍不影响实际数据。
- 错误信息统一中文：`任务不存在`、`评论不存在`、`无权编辑该评论`、`无权删除该评论`；非成员沿用 `TeamAccessService` 的 `你不是该团队成员`。

## 验收标准

### 机器可验

**路由与鉴权**

- [ ] AC1：未登录调用 `GET /api/tasks/:taskId/comments`、`POST /api/tasks/:taskId/comments`、`PATCH /api/comments/:commentId`、`DELETE /api/comments/:commentId` 均返回 401。
- [ ] AC2：`GET /api/tasks/:taskId/comments` 返回 200 且是数组；seed 任务「设计任务看板 UI」下恰好能读到 2 条 seed 评论，`content` 与 seed 一致。
- [ ] AC3：列表中每一条评论的顶层键按排序后精确等于 `['author','authorId','content','createdAt','id','taskId','updatedAt']`；`author` 的键精确等于 `['id','username']`；序列化后不含 `deletedAt` / `passwordHash` / `email`。
- [ ] AC4：列表按 `createdAt` 升序（seed 的两条 10:00 / 11:00 评论顺序正确），两条同毫秒的数据按 `id` 升序。
- [ ] AC5：直接用 `PrismaService` 把一条评论置 `deletedAt = now()` 后，它从列表中消失；e2e 结束前恢复或硬删该数据。
- [ ] AC6：`taskId` / `commentId` 传非 UUID（如 `not-a-uuid`）→ 400，而不是 500。

**权限**

- [ ] AC7：carol（非 Mobile App 成员）对 Mobile App 任务 `GET` → 403；`POST` → 403；对该任务下评论 `PATCH` / `DELETE` → 403。
- [ ] AC8：carol（`MEMBER`）尝试 `PATCH` bob 的评论 → 403；尝试 `DELETE` bob 的评论 → 403。
- [ ] AC9：bob（`ADMIN`）尝试 `PATCH` carol 的评论 → 403（编辑仍限作者）；`DELETE` carol 的评论 → 200。
- [ ] AC10：alice（`OWNER`）能 `DELETE` 任意成员在 Frontend Platform 下的评论（用 bob 的评论验证）→ 200。
- [ ] AC11：作者本人 `PATCH` 自己的评论 → 200；`DELETE` 自己的评论 → 200。

**创建与校验**

- [ ] AC12：`POST` 合法 `content` → 201；返回体键集合符合 `COMMENT_SELECT`；`authorId` 等于当前登录用户 id；数据库行 `deleted_at IS NULL`。
- [ ] AC13：请求体带 `authorId` / `deletedAt` / `taskId` 等未声明字段 → 400（`forbidNonWhitelisted` 生效，作者不能被伪造或顶替）。
- [ ] AC14：`content` 为空串 `''` → 400；长度 2001 → 400；非字符串（`123`）→ 400；缺失 → 400。
- [ ] AC15：`content` 为纯空白 `'   '` → 201（DTO 不 trim，见「已知取舍」）。
- [ ] AC16：`content` 长度恰好 2000 → 201。

**编辑与软删**

- [ ] AC17：作者 `PATCH` 后返回 200，`content` 为新值，`updatedAt` 晚于 `createdAt`，`authorId` / `taskId` / `id` 不变。
- [ ] AC18：`PATCH` 一条不存在（随机 UUID）的评论 → 404；`DELETE` 同理 → 404。
- [ ] AC19：`DELETE` 后返回 `{ id, deleted: true }`（键集合精确为 `['deleted','id']`）；再次 `GET` 列表不含该条；数据库该行 `deleted_at IS NOT NULL`；再次 `PATCH` / `DELETE` 同一 id → 404。
- [ ] AC20：任务被软删后（e2e 自建一次性任务，置于 `deletedAt = now()`），该任务下评论的 `GET` / `POST` → 404；恢复任务后 `GET` → 200。
- [ ] AC21：团队被软删后（e2e 自建一次性团队 + 任务 + 评论，置团队 `deletedAt`），`GET` / `POST` 该任务评论 → 404；恢复后 → 200。

**工程门禁**

- [ ] AC22：`npm run lint`、`npx tsc -p tsconfig.build.json --noEmit`、`npx tsc -p tsconfig.test.json --noEmit` 全部通过。
- [ ] AC23：`npm test` 通过，且新增 `src/comments/comment-permissions.spec.ts` 覆盖纯判定函数（作者可编辑；作者/管理员可删除；普通成员删他人评论为 false）。
- [ ] AC24：`npm run test:e2e` 连续跑两次都通过（证明 `afterAll` 清理干净、不依赖上一次的残留数据），且两次运行后 seed 的 3 条评论仍存在且 `deletedAt IS NULL`。
- [ ] AC25：`GATE_ALWAYS=1 bash .claude/hooks/gate.sh < /dev/null` 退出 0。

### 人工判定

- [ ] AC26：所有新增的用户可见错误信息是中文，不出现 `PrismaClientKnownRequestError`、表名 / 列名等库内文案。
- [ ] AC27：`git status --short` 与 `git diff --stat` 里**没有**：`prisma/`、`web/`、`prisma/seed.ts`、`src/tasks/tasks.controller.ts`、任务返回体相关常量（`TASK_SELECT` / `TASK_DETAIL_SELECT` / `TASK_ALIVE_FILTER` 字面值）的改动。
- [ ] AC28：`README.md`「当前进度」把评论从「尚未实现」移到「已实现」，列出四个接口和权限口径；「尚未实现」里删掉评论那一行。
- [ ] AC29：`CLAUDE.md`「已知缺口」里「没有 comments 的 controller……」这一行删除或改写为评论模块已完成；其余缺口保持原样。
- [ ] AC30：controller 保持薄：路由参数解析 + 调 service，权限判定全部在 service；`src/comments/` 下没有第二份 `TASK_ALIVE_FILTER` 或成员判定副本。

## 已定的决策

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 功能范围 | 列表 / 创建 / 编辑 / 软删四个接口 | 评论的主线闭环；不做编辑删除会留下「发错了改不了」的死路 |
| 编辑权限 | 仅作者本人 | 编辑改的是个人表达，管理员代改会篡改发言记录 |
| 删除权限 | 作者本人，或团队 `OWNER` / `ADMIN` | 删除是管理动作（清理不当内容），复用 `assertTeamMember` 返回的 role，零额外查询 |
| 列表形态 | 直接返回数组，`createdAt` 升序，不分页 | 单任务评论量天然有界；分页会让评论区丢上下文，而任务列表是跨任务、天然无界，两者不该套同一形状 |
| 存在性判定 | `TasksService` 新增 public `assertTaskAlive`，`CommentsModule` 导入 `TasksModule` 调用 | `TASK_ALIVE_FILTER` 的注释明确要求「任务算不算存在」只有一份定义；抽常量只统一字面量，不统一 404 语义 |
| 评论视图 | `id / taskId / authorId / content / createdAt / updatedAt / author{id,username}` | 与任务视图一致：裸 id + 嵌套摘要对象；不透软删时间和用户邮箱 |
| 内容长度 | `@MinLength(1) @MaxLength(2000)`，不 trim | 评论是短消息，5000 是照任务 description 抄的；不设上限会让 `@Text` 变无界输入 |
| 路由形态 | 集合走嵌套 `/tasks/:taskId/comments`，单条走扁平 `/comments/:commentId` | 评论从属于任务，创建时 taskId 在路径里、不能伪造；单条操作不需要再带 taskId |
| 已软删评论 | 列表不可见，单条操作 404，不留墓碑 | 与任务软删语义一致；前端本轮不做，没有展示墓碑的需求 |
| 已完成任务评论 | 允许 | 评论是讨论记录，任务完成不代表不能再补充说明 |
| 作者软删 | `author.username` 不过滤 `deletedAt` | 与任务详情的 assignee / createdBy 口径一致 |
| 纯判定函数 | 抽 `src/comments/comment-permissions.ts` 并配单元测试 | 项目约定「权限这类纯逻辑优先补 `*.spec.ts`」；也让机械门禁的单元测试步骤有东西可跑 |
| 返回状态码 | POST 201，其余 200 | 沿用 Nest 默认与任务接口一致 |

## 已知取舍

- **纯空白评论可以通过**：DTO 不 trim，`'   '` 满足 `MinLength(1)`。这是为了与现有 `CreateTaskDto` 的 title 行为保持一致；如果以后要拦，统一在 DTO 层加 `@Transform(trim)` 并同时改任务 DTO，而不是只给评论打补丁。
- **存在性检查与写入之间存在极小 TOCTOU 窗口**：`assertTaskAlive` 通过后任务才被软删，本条评论仍会写入。与任务写路径同级别、单请求内、需要并发软删，本轮不处理；彻底闭合要把 create 放进同一条带 `TASK_ALIVE_FILTER` 的写操作用例（Prisma 需要 interactive transaction）。
- **列表无上限**：单任务评论如果涨到几千条，响应会很大。接受现状，出现真实需要时再加游标分页；不要提前加 `page/pageSize` 造成两个评论接口形状。
- **没有评论通知**：评论后不会通知任务负责人。通知属于独立基础设施，不在本轮。
- **单元测试只覆盖纯判定函数**：404 / 403 的分支顺序、数据库过滤仍由 e2e 覆盖，不为了单测把 Prisma 查询 mock 一遍。

## 预计改动

| 文件 | New / Edit | 说明 |
| --- | --- | --- |
| `src/comments/comments.module.ts` | New | 注册两个 controller + `CommentsService`；imports `PrismaModule` / `TasksModule` / `TeamsModule` |
| `src/comments/comments.controller.ts` | New | `TaskCommentsController`（`tasks/:taskId/comments`）+ `CommentsController`（`comments`） |
| `src/comments/comments.service.ts` | New | 列表 / 创建 / 编辑 / 软删，以及评论存在性判定 |
| `src/comments/comment-permissions.ts` | New | `canEditComment` / `canDeleteComment` 两个纯函数 |
| `src/comments/comment-permissions.spec.ts` | New | 纯函数单元测试 |
| `src/comments/dto/create-comment.dto.ts` | New | `content`：`@IsString @MinLength(1) @MaxLength(2000)` |
| `src/comments/dto/update-comment.dto.ts` | New | `content` 必填，规则同上 |
| `src/tasks/tasks.service.ts` | Edit | 新增 public `assertTaskAlive(taskId)`，复用 `TASK_ALIVE_FILTER`；既有方法不动 |
| `src/tasks/tasks.module.ts` | Edit | `exports: [TasksService]` |
| `src/app.module.ts` | Edit | imports 加 `CommentsModule` |
| `test/comments.e2e-spec.ts` | New | 覆盖 AC1–AC21，自建数据在 `afterAll` 硬删清理 |
| `README.md` | Edit | 「当前进度」更新评论接口、「尚未实现」删除评论行 |
| `CLAUDE.md` | Edit | 「已知缺口」删除评论未实现那条 |

## 风险与回滚

- 不改 schema / 迁移，**没有数据迁移风险**；`comments` 表已有数据，新接口上线即会暴露 seed 评论给团队成员 —— 这是预期行为。
- 唯一碰到既有模块的是 `TasksService` 增加 public 方法 + 模块导出：纯新增，不改任何现有方法签名或返回体；若 `TasksModule` 导出引发依赖问题，回滚只需删 `exports` 和 `assertTaskAlive`。
- 整体回滚：移除 `app.module.ts` 的 `CommentsModule` import 并删除 `src/comments/`、`test/comments.e2e-spec.ts` 即可，数据库零残留（软删评论仍留在表里但不被任何接口读到）。
- e2e 会往库里写一次性团队 / 任务 / 评论，`afterAll` 按 id 硬删；若清理逻辑写漏，重复运行 AC24 会红，能第一时间发现。
