# 团队成员管理（后端）

> 由 `/spec` 生成。实现前把这份文档写完，验收时逐条勾这里。

## 背景

`team_members` 目前只有 `joinedAt`，没有离开标记；`src/teams/` 只有列表 / 详情 / 创建，没有邀请、改角色、移除 / 退出。按 README 已知问题 #5：实现成员管理前必须先给 `team_members` 补 `leftAt`，否则「移除 / 退出」只能硬删行，团队历史直接丢失，之后补审计也补不回来。

本轮只做后端，前端团队页与成员管理 UI 不在范围内。

## 目标

团队 `OWNER` / `ADMIN` 能按邮箱邀请已注册用户，`OWNER` 能改成员角色，按权限矩阵移除成员；任何成员能退出自己。离开用 `leftAt` 记录而不是删行，离开后立刻失去该团队的全部读写权限；同一人重新加入会新开一段成员记录，旧记录保留。

## 不在范围内

明确排除，本轮不做。出现了就是越界改动：

- 前端任何改动（`web/` 应保持零 diff）
- `team_invitations` 表、邀请 token、邮件通知、接受 / 拒绝流程
- 团队改名 / 解散（`PATCH` / `DELETE /api/teams/:teamId`）
- 历史成员列表 / 成员审计日志接口（`leftAt` 只落库，不通过 API 暴露）
- 离开时改派任务（Q5 已定：不动任务）
- 单一 OWNER 的「转让」语义（Q4 已定：允许多个 OWNER）
- 成员分页、成员搜索、全局用户搜索接口
- 用户注销、改密、头像等用户模块变更

## 数据模型与迁移

`prisma/schema.prisma` 的 `TeamMember` 改为：

```prisma
model TeamMember {
  id       String    @id @default(uuid()) @db.Uuid
  teamId   String    @map("team_id") @db.Uuid
  userId   String    @map("user_id") @db.Uuid
  role     TeamRole  @default(MEMBER)
  joinedAt DateTime  @default(now()) @map("joined_at") @db.Timestamptz(3)
  // null = 仍在团队中；有值 = 该时刻离开。不是软删：这行仍然有效，是历史记录
  leftAt   DateTime? @map("left_at") @db.Timestamptz(3)

  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, leftAt])
  @@map("team_members")
}
```

**不能**把 `@@id([teamId, userId])` 或 `@@unique([teamId, userId])` 写回 schema —— 那样「退出后重新加入」会撞唯一约束，历史行也存不下。同一时刻只能有一条活跃关系由迁移里的**部分唯一索引**保证：

```sql
CREATE UNIQUE INDEX "team_members_active_key"
  ON "team_members" ("team_id", "user_id")
  WHERE "left_at" IS NULL;
```

迁移用 `npx prisma migrate dev --create-only --name add_team_member_leave` 生成后手改。`id` 是 Prisma 客户端生成的 UUID（库层没有默认值），既有行必须回填：

```sql
ALTER TABLE "team_members" ADD COLUMN "id" UUID;
UPDATE "team_members" SET "id" = gen_random_uuid();
ALTER TABLE "team_members" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "team_members" DROP CONSTRAINT "team_members_pkey";
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");
ALTER TABLE "team_members" ADD COLUMN "left_at" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX "team_members_active_key"
  ON "team_members" ("team_id", "user_id")
  WHERE "left_at" IS NULL;
```

（`gen_random_uuid()` 是 PG13+ 内置函数，本项目 PG17 可用。`[userId, leftAt]` 普通索引交给 `migrate dev` 生成。）

## API 契约

所有接口都在全局 `/api` 下、都需要登录；`:teamId` / `:userId` 都走 `ParseUUIDPipe`（非法 UUID → 400）。成员对象（下称「成员视图」）固定五行：

```json
{ "userId": "...", "username": "...", "avatarUrl": null, "role": "MEMBER", "joinedAt": "..." }
```

三个接口的**判断顺序固定**，AC 按这个顺序断言：

1. 团队存在且未软删 → 否则 404 `团队不存在`
2. 调用者是**活跃**成员（`leftAt IS NULL`）→ 否则 403 `你不是该团队成员`
3. 角色 / 目标成员判定 → 见各接口
4. 最后一个 `OWNER` 判定 → 409

### `POST /api/teams/:teamId/members` — 邀请

Body 只有 `email`：`@Transform` 先 trim + 小写，再 `@IsEmail()` + `@MaxLength(255)`。角色固定为 `MEMBER`，body 里带 `role` 会因 `forbidNonWhitelisted` 直接 400。

- 成功 **201**，返回成员视图
- 调用者非 `OWNER` / `ADMIN` → **403** `无权邀请成员`
- 邮箱查不到活跃用户（含用户已软删）→ **404** `用户不存在`
- 该用户已是活跃成员 → **409** `该用户已是团队成员`
- 该用户曾退出 → **201**，新建一行；旧行 `leftAt` 保留，新行 `leftAt = NULL`、`joinedAt` 为新时间
- 并发重复邀请由部分唯一索引兜底：捕获 `P2002` 映射为同样的 409

### `PATCH /api/teams/:teamId/members/:userId` — 改角色

Body 只有 `role`：`@IsEnum(TeamRole)`，允许 `OWNER` / `ADMIN` / `MEMBER`。允许多个 `OWNER`，因此可以提升成员为 `OWNER`。

- 成功 **200**，返回成员视图；`role` 与当前相同也算成功（幂等）
- 调用者不是 `OWNER` → **403** `无权修改成员角色`（`ADMIN` 也不能改角色）
- 目标不是活跃成员（随机 id / 已离开）→ **404** `成员不存在`
- 目标是团队最后一个活跃 `OWNER`，且新角色不是 `OWNER` → **409** `不能降级团队最后一个 OWNER`

### `DELETE /api/teams/:teamId/members/:userId` — 移除 / 退出

`userId` 等于调用者即「退出自己」；否则是「移除他人」。同一个端点，不另开 `/leave`。

- 成功 **200**，返回 `{ "userId": "...", "left": true }`
- 调用者是 `MEMBER` 且目标不是自己 → **403** `无权移除该成员`
- 调用者是 `ADMIN` 且目标角色不是 `MEMBER` → **403** `无权移除该成员`
- 目标是团队最后一个活跃 `OWNER` → **409** `不能移除团队最后一个 OWNER`（实际只可能发生在最后 OWNER 退自己时）
- 目标不是活跃成员 → **404** `成员不存在`（对同一人第二次 DELETE 即此结果）
- 成功时只写 `leftAt = now()`，**不删行**；`tasks.assigneeId` 不动

### 既有接口的调整

- `GET /api/teams`：`members.some` 与取角色的 `members.where` 都加 `leftAt: null`，退出者的团队从列表消失。
- `GET /api/teams/:teamId`：`members.where` 加 `leftAt: null`；成员视图字段不变，**不返回** `leftAt`。
- `TeamAccessService.assertTeamMember`：改成 `findFirst({ where: { teamId, userId, leftAt: null } })`（`teamId_userId` 唯一输入已不存在）。这是任务 / 评论 / 团队接口共用的唯一权限入口，漏改等于退出者仍有权限。

## 权限矩阵

| 操作 | OWNER | ADMIN | MEMBER | 非成员 |
| --- | --- | --- | --- | --- |
| 邀请（只能加为 MEMBER） | ✅ | ✅ | ❌ | ❌ |
| 改角色（OWNER / ADMIN / MEMBER） | ✅ | ❌ | ❌ | ❌ |
| 移除 MEMBER | ✅ | ✅ | ❌ | ❌ |
| 移除 ADMIN | ✅ | ❌ | ❌ | ❌ |
| 移除 OWNER（非最后一个） | ✅ | ❌ | ❌ | ❌ |
| 退出自己（非最后一个 OWNER） | ✅ | ✅ | ✅ | — |

任何 `PATCH` / `DELETE` 执行完，团队活跃 `OWNER` 数必须 ≥ 1。

## 验收标准

### 机器可验

e2e 用 seed 的三角色账号登录（alice / bob / carol，密码 `Password123!`），但**必须自建团队**并写入 alice=OWNER、bob=ADMIN、carol=MEMBER，`afterAll` 删团队（`team_members` Cascade）与自建用户；不要改 seed 的 Frontend Platform / Mobile App 成员关系，否则重复跑会互相污染。

**鉴权**

- [ ] AC1：未登录调用 `POST /api/teams/:id/members`、`PATCH /api/teams/:id/members/:userId`、`DELETE /api/teams/:id/members/:userId` → 均 **401**

**邀请**

- [ ] AC2：`OWNER` 邀请一个活跃的非成员用户 → **201**；响应体键集合恰为 `userId` / `username` / `avatarUrl` / `role` / `joinedAt`，`role === 'MEMBER'`
- [ ] AC3：AC2 之后，库里存在 `(teamId, userId)` 且 `leftAt IS NULL`；`GET /api/teams/:teamId` 的 `members` 含该 `userId`
- [ ] AC4：`ADMIN` 邀请 → **201**，`role === 'MEMBER'`
- [ ] AC5：`MEMBER` 邀请 → **403**，message `无权邀请成员`
- [ ] AC6：非成员邀请（alice 对 Mobile App）→ **403**，message `你不是该团队成员`
- [ ] AC7：邮箱不存在 → **404**，message `用户不存在`
- [ ] AC8：已是活跃成员 → **409**，message `该用户已是团队成员`
- [ ] AC9：用 `'  Bob@Example.COM  '` 邀请已是成员的 bob → **409**（证明 trim + 小写都生效）
- [ ] AC10：已软删用户的邮箱 → **404** `用户不存在`
- [ ] AC11：缺 `email` / 非邮箱串 / 带 `role` 字段 → **400**；非 UUID `teamId` → **400**
- [ ] AC12：不存在的团队 → **404** `团队不存在`；`deletedAt` 非空的团队 → **404**
- [ ] AC13：成员退出后再次邀请 → **201**；库里该 `(teamId, userId)` 有两行，旧行 `leftAt` 非空，新行 `leftAt` 为空且 `joinedAt` 更晚
- [ ] AC14（DB 约束，放 `test/schema-integrity.e2e-spec.ts`）：对同一 `(team_id, user_id)` 直接插第二条 `left_at IS NULL` 的行 → 抛 `P2002`（部分唯一索引生效）

**改角色**

- [ ] AC15：`OWNER` 把 `MEMBER` 改成 `ADMIN` → **200**，`role === 'ADMIN'`；库里同步
- [ ] AC16：`OWNER` 把成员提升为 `OWNER` → **200**；活跃 `OWNER` 计数变为 2
- [ ] AC17：`ADMIN` 改任何人的角色 → **403** `无权修改成员角色`
- [ ] AC18：`MEMBER` 改角色 → **403**
- [ ] AC19：团队只剩一个 `OWNER` 时，该 `OWNER` 把自己改成 `ADMIN` → **409** `不能降级团队最后一个 OWNER`；库里 role 仍是 `OWNER`
- [ ] AC20：目标不是活跃成员（随机 UUID 或已离开的人）→ **404** `成员不存在`
- [ ] AC21：`role` 非法值 / 带未声明字段 / 非 UUID `userId` → **400**
- [ ] AC22：`role` 与当前相同 → **200**（幂等）
- [ ] AC23：非成员 `PATCH` → **403** `你不是该团队成员`

**移除 / 退出**

- [ ] AC24：`OWNER` 移除 `MEMBER` → **200**，响应 `{ userId, left: true }`；库里行**仍存在**且 `leftAt` 非空；团队详情的 `members` 不再含该人；该人的 `GET /api/teams` 不含此团队、`GET /api/teams/:id` → **403**
- [ ] AC25：`ADMIN` 移除 `MEMBER` → **200**
- [ ] AC26：`ADMIN` 移除 `OWNER` → **403** `无权移除该成员`
- [ ] AC27：`ADMIN` 移除另一个 `ADMIN` → **403**（先用 `OWNER` 把一名 `MEMBER` 提为 `ADMIN` 构造）
- [ ] AC28：`MEMBER` 移除他人 → **403**
- [ ] AC29：`MEMBER` 退出自己 → **200**；随后 `GET /api/teams/:id` → **403**
- [ ] AC30：唯一 `OWNER` 退出自己 → **409** `不能移除团队最后一个 OWNER`
- [ ] AC31：两个 `OWNER` 时，其中一个退出自己 → **200**；剩余活跃 `OWNER` 计数为 1
- [ ] AC32：对同一个人第二次 `DELETE` → **404** `成员不存在`
- [ ] AC33：非成员 `DELETE`（他人或自己）→ **403** `你不是该团队成员`
- [ ] AC34：软删团队上执行任一成员操作 → **404** `团队不存在`
- [ ] AC35：离开者在原团队的任务 / 评论链路全部拒绝：`GET /api/tasks` 不含该团队任务；`GET /api/tasks/:taskId/comments` → **403**；向该团队 `POST /api/tasks` → **403**
- [ ] AC36：`GET /api/teams/:teamId` 的 `members` 仍按 `joinedAt` 升序，每项仍是 5 个键，且**不含** `leftAt`

**回归 / 数据**

- [ ] AC37：`test/teams.e2e-spec.ts`、`test/tasks.e2e-spec.ts`、`test/comments.e2e-spec.ts`、`test/schema-integrity.e2e-spec.ts` 全部通过（teams 里原有的 `findUnique({ teamId_userId })` 必须改成按 `teamId` + `userId` + `leftAt: null` 查）
- [ ] AC38：迁移跑完后，所有既有 `team_members` 行 `id IS NOT NULL` 且 `left_at IS NULL`
- [ ] AC39：`grep -rn "teamId_userId" src test prisma` 无结果（注释里说明旧写法除外）
- [ ] AC40：`GATE_ALWAYS=1 bash .claude/hooks/gate.sh < /dev/null` 退出 0（lint + src 类型 + 测试类型 + 单测 + e2e）

### 人工判定

- [ ] AC41：所有错误 message 是中文、可直接呈现给用户（不是 Prisma 原始错误）
- [ ] AC42：`git diff --stat` 与「预计改动」一致，`web/` 零改动，没有「不在范围内」的东西
- [ ] AC43：角色 / 最后 OWNER 判定只有一份实现（`team-member-permissions.ts`）；controller 与 service 里没有复制 if 链
- [ ] AC44：`schema.prisma` 的 `TeamMember` 没有 `@@unique([teamId, userId])` / `@@id`，并有注释说明「活跃唯一由迁移里的部分唯一索引保证」
- [ ] AC45：`README.md`「当前进度」「尚未实现」、`CLAUDE.md`「已知缺口」与「数据库」小节同步：成员管理移入已实现，`leftAt` 不再列为缺口

## 已定的决策

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| `leftAt` 建模（Q1） | 代理主键 `id` + `leftAt` + 部分唯一索引 `(team_id, user_id) WHERE left_at IS NULL` | 真正保留多段历史；与 `users_*_active_key` 同一套路 |
| 邀请语义（Q2） | 按邮箱把已注册且未软删的用户直接加为成员；无邀请表 / 邮件 / 接受流程 | 当前没有通知基础设施；查无此人 404，已是成员 409 |
| 邀请入队角色 | 只能是 `MEMBER`，body 不带 `role` | 防止 `ADMIN` 邀请时直接造出另一个 `ADMIN`，绕过 Q3 的角色权限 |
| 权限矩阵（Q3） | `OWNER` 全权；`ADMIN` 只邀请 `MEMBER`、只移除 `MEMBER`；改角色仅 `OWNER`；`MEMBER` 只能退出自己 | 保留 ADMIN 日常加人 / 踢人，又不允许同僚互相提权或互踢 |
| OWNER 数量（Q4） | 允许多个 `OWNER`；活跃 `OWNER` 数不得为 0 | 与现有 enum 兼容，不需要事务内转让；`last-owner` 只需一条计数 |
| 离开后的任务（Q5） | 不动 `tasks.assigneeId` | 离开动作不静默改业务数据；已完成任务的历史归属也不丢 |
| `DELETE` 语义 | 同端点，`:userId` 等于自己即退出；返回 `{ userId, left: true }` | 少一个 `/leave` 端点；`left` 比 `deleted` 更准确（行没删） |
| 最后一个 OWNER 冲突 | `PATCH` / `DELETE` 返回 **409**，不是 403 | 是业务状态冲突，不是「你没权限」 |
| 权限判定实现 | 新增纯函数 `team-member-permissions.ts` + `*.spec.ts`，service 只负责查数据与映射异常 | 与 `comment-permissions.ts` 的先例一致，矩阵可以脱离数据库单测 |
| 邮箱归一化 | DTO 里 `@Transform` trim + 小写，查询复用 `UserService.findByEmail` | 唯一索引大小写敏感，写入方必须归一化；别再写第二份 normalize |
| 团队存在性 | 每个成员操作先 `TeamAccessService.assertTeamExists` | 软删团队统一 404，与详情接口一致 |

## 已知取舍

接受以下代价，验收时不要当成 bug：

- **允许多个 `OWNER`，没有「转让」语义。** 提升即新增一个 OWNER，不会自动降级原 OWNER。若以后要单 OWNER，需要另加事务内交换。
- **无法区分「主动退出」和「被管理员移除」。** 只有 `leftAt`，没有 `leftReason` / `removedById`；要审计到这一层得再加列。
- **邀请是直接加人，不是「待接受」的邀请。** 被加的人没有确认机会；也没有邮件 / 站内通知。
- **离开不改任务负责人。** 离开者仍出现在任务的 `assignee` 上，而团队负责人下拉只剩活跃成员 —— 编辑其他字段会静默保留旧负责人。这是 README 已记录的同类问题，本轮扩大了一点适用范围。
- **历史成员不通过 API 暴露。** `leftAt` 非空的行只在库里，`GET /teams/:id` 只返回活跃成员；要做「历史成员」得另开接口。
- **部分唯一索引只存在于迁移 SQL。** `schema.prisma` 表达不了 `WHERE`，谁把 `@@unique` / `@@id` 加回去，下一次 `migrate dev` 就会重建全量唯一索引，把「退出后不能重新加入」的 bug 带回来。
- **`last-owner` 检查是「先 count 再写」。** 两个 OWNER 同时各自降级 / 退出的极端并发下，理论上可能短暂出现 0 个 OWNER；与任务写路径的 TOCTOU 同级别，单请求内、需要两个管理员精确并发，本轮接受。彻底闭合要在事务里加锁 / `Serializable` 并处理重试。
- **离开不撤销已签发的 access token。** 但所有团队相关接口都会实时查活跃成员，所以实际权限立即失效；refresh token 仍可换新 access token，直到用户自己登出。
- **e2e 直连开发库。** 用例必须自建团队 / 用户并清理，漏清理会污染数据；恢复方式是 `npx prisma db seed`。
- **删团队时 `team_members` 的 Cascade 会扫历史行。** 主键换成 `id` 后，带 `team_id` 的索引只剩部分唯一索引（只覆盖 `left_at IS NULL`）；删团队时按 `team_id` 找 `left_at` 非空的历史行不在索引里。当前数据量可忽略，历史行多了再补 `(team_id)` 或 `(team_id, left_at)` 普通索引。

## 预计改动

| 文件 | New / Edit | 说明 |
| --- | --- | --- |
| `prisma/schema.prisma` | Edit | `TeamMember` 加 `id` / `leftAt`，去掉复合主键；索引改 `[userId, leftAt]`；注释说明部分唯一索引在迁移里 |
| `prisma/migrations/<ts>_add_team_member_leave/migration.sql` | New | 手写：回填 `id`、换主键、加 `left_at`、建部分唯一索引 |
| `prisma/seed.ts` | Edit | 4 处 `teamMember.upsert` 改成按固定 `id` upsert（或先查活跃行再 create），保留幂等 |
| `src/teams/dto/invite-team-member.dto.ts` | New | `email`：trim + 小写、`@IsEmail`、`@MaxLength(255)` |
| `src/teams/dto/update-team-member-role.dto.ts` | New | `role`：`@IsEnum(TeamRole)` |
| `src/teams/team-member-permissions.ts` | New | `evaluateInvite` / `evaluateChangeRole` / `evaluateRemoveMember` 纯函数，返回 `ALLOW` / `FORBIDDEN` / `LAST_OWNER` |
| `src/teams/team-member-permissions.spec.ts` | New | 权限矩阵 + last-owner 分支的单测，不连库 |
| `src/teams/team-access.service.ts` | Edit | `assertTeamMember` 改 `findFirst` 并加 `leftAt: null` |
| `src/teams/teams.service.ts` | Edit | 新增 `inviteMember` / `updateMemberRole` / `removeMember`；`getTeams` / `getTeamDetail` 全部加 `leftAt: null`；共用成员视图映射 |
| `src/teams/teams.controller.ts` | Edit | 新增三个路由，`ParseUUIDPipe`，`@CurrentUser('sub')` |
| `src/teams/teams.module.ts` | Edit | `imports` 加 `UserModule`（复用 `UserService.findByEmail`） |
| `test/teams.e2e-spec.ts` | Edit | `teamId_userId` 的 `findUnique` 改为按活跃成员查；其余断言保持 |
| `test/team-members.e2e-spec.ts` | New | AC1–AC13、AC15–AC36，自建团队 / 用户并清理 |
| `test/schema-integrity.e2e-spec.ts` | Edit | 补 AC14 部分唯一索引、AC38 迁移后 `id` / `left_at` 断言 |
| `README.md` | Edit | 「当前进度」移入成员管理；「尚未实现」删除该行；已知问题 #5 标已修 |
| `CLAUDE.md` | Edit | 「已知缺口」更新：`leftAt` 已补、成员管理已实现；补一条「部分唯一索引在迁移里」的提醒 |

## 风险与回滚

- **最大风险是迁移**：`id` 是客户端生成的 UUID，库层没有默认值，`migrate dev` 默认生成的 `ADD COLUMN "id" UUID NOT NULL` 会直接失败。必须 `--create-only` 后按上面的 SQL 先加可空列、`gen_random_uuid()` 回填、再收紧。跑迁移前先 `pg_dump` 或至少确认可以 `npx prisma migrate reset` 重建开发库。
- **主键从 `(team_id, user_id)` 换成 `id`** 会让所有旧写法失效：`src/teams/team-access.service.ts`、`prisma/seed.ts` 的 4 处 upsert、`test/teams.e2e-spec.ts` 的 1 处 `findUnique`。编译期会报错，不会静默；AC39 用 grep 兜一层。
- **权限回归是安全风险**：`leftAt` 过滤漏一处，退出者就还能读 / 写原团队。必须覆盖的查询只有四处：`assertTeamMember`、`getTeams` 的 `members.some` 与取角色、`getTeamDetail` 的 `members.where`。AC24 / AC29 / AC35 专门验证离开后权限立即失效。
- **seed 回归**：seed 若仍按 `teamId_userId` upsert，`npx prisma db seed` 会直接类型报错；seed 里的固定团队成员行要改成固定 `id`。
- **回滚**：代码整体 `git revert` 即可，但迁移是**不可无损回退**的 —— 一旦有 `leftAt` 非空的历史行，就不能直接恢复复合主键。无损方案是前滚修复；若必须回退，先删历史行再换回主键（会丢历史）：

  ```sql
  DELETE FROM "team_members" WHERE "left_at" IS NOT NULL;
  DROP INDEX "team_members_active_key";
  ALTER TABLE "team_members" DROP COLUMN "left_at";
  ALTER TABLE "team_members" DROP CONSTRAINT "team_members_pkey";
  ALTER TABLE "team_members" ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id", "user_id");
  ALTER TABLE "team_members" DROP COLUMN "id";
  ```

- **合并顺序**：先迁移 + `npx prisma generate`，再改代码。忘记 `generate` 时 `TeamMember` 的类型还是旧的，`leftAt` 会报「不存在该属性」，属于启动前的编译期失败，不会静默。
