# 修复 schema 层的设计问题（软删 × 唯一约束 / priority CHECK / 评论作者级联）

> 由 `/spec` 生成。实现前把这份文档写完，验收时逐条勾这里。

## 背景

`README.md`「本项目现有设计的已知问题」里列了 5 条，其中 3 条是库层能修的真问题：

1. **软删 × 唯一约束冲突**：`User.email` / `User.username` 是 `@unique`，但 `User` 有 `deletedAt`。用户被软删后邮箱仍占着唯一约束，新人用同一邮箱注册会撞 `ConflictException`，而 `findByEmail` 又过滤了 `deletedAt: null`，排查时看不到任何一行——「库里没有这个人，但系统说已经存在」。
2. **`Task.priority` 没有取值约束**：`SmallInt DEFAULT 2` 裸露在库层，任何绕过 API 的写法（Studio / psql / 脚本）都能写进 99。
3. **`Comment.author` 用 `onDelete: Cascade`**：删用户会连带删掉他所有的评论，评论是团队历史资产，不该跟着用户一起消失。

另外两条（`Task.assigneeId` 复合外键、`team_members` 缺 `leftAt`）本轮**不修**，只把「为什么不修、什么条件下才修」写清。

## 目标

库里做得到的事交给库：邮箱/用户名唯一性只对未软删的行生效，`tasks.priority` 的取值域由 `CHECK` 兜底，评论不会因删用户而消失；API 行为与入参契约保持不变（`priority` 仍是 0–3）。

## 不在范围内

明确排除，本轮不做。出现了就是越界改动：

- `Task.assigneeId` 的复合外键（`FOREIGN KEY (team_id, assignee_id) REFERENCES team_members (team_id, user_id)`）
- `team_members` 加 `leftAt` / `deletedAt`，以及任何成员管理接口
- 新增任何接口（含「软删自己」的 `DELETE /api/users/me`）
- 评论模块的功能实现（`src/comments/` 仍然是空目录，本轮只改 schema 里的 relation 属性）
- `priority` 取值域从 0–3 改成 1–4（DTO、seed、前端都不动）
- 前端任何改动（`web/`）
- 把 DB 层 `CHECK` 违规映射成 4xx（见「已知取舍」）

## 验收标准

### 迁移与库层结构

- [x] AC1：`prisma/migrations/` 下新增一个 `*_fix_schema_integrity` 迁移目录，其 `migration.sql` 同时包含四件事：`DROP INDEX "users_email_key"` / `DROP INDEX "users_username_key"`、两条带 `WHERE deleted_at IS NULL` 的 `CREATE UNIQUE INDEX`、`ALTER TABLE "tasks" ADD CONSTRAINT "tasks_priority_range" CHECK (...)`、`comments.author_id` 外键重建为 `ON DELETE RESTRICT`。
- [x] AC2：`docker compose exec -T postgres psql -U team_task -d team_task -c "SELECT indexname FROM pg_indexes WHERE tablename='users' ORDER BY 1"` 输出含 `users_email_active_key`、`users_username_active_key`，且**不含** `users_email_key`、`users_username_key`。
- [x] AC3：`... -c "SELECT indexdef FROM pg_indexes WHERE tablename='users' AND indexname LIKE 'users_%_active_key'"` 两行都含 `WHERE (deleted_at IS NULL)`。
- [x] AC4：`... -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='tasks'::regclass AND conname='tasks_priority_range'"` 输出等价于 `CHECK (((priority >= 0) AND (priority <= 3)))`。
- [x] AC5：`... -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='comments'::regclass AND conname LIKE '%author_id%'"` 输出含 `ON DELETE RESTRICT`、**不含** `ON DELETE CASCADE`。
- [x] AC6：迁移应用后再跑一次 `npx prisma migrate dev`，输出 `Already in sync`（不生成新迁移、不提示 reset），且 `git status` 里没有新出现的迁移目录——证明手写 SQL 没被判为漂移。
- [x] AC7：`prisma/schema.prisma` 里 `User.email` / `User.username` 不再带 `@unique`；`Comment.author` 的 relation 为 `onDelete: Restrict`；`@@map` / `@db.VarChar` 等其它属性未变。
- [x] AC8：`npx prisma generate && npx tsc -p tsconfig.build.json --noEmit` 通过——去掉 `@unique` 会改变生成的 `UserWhereUniqueInput`，需证明现有代码（全部是 `findFirst`）不受影响。

### 库层行为（绕开 API，直接用 `PrismaService` 写库）

- [x] AC9：存在两行 `deleted_at IS NULL` 的 users 拥有同一 email 时，第二次 `user.create` 抛 `P2002`（部分唯一索引生效）。
- [x] AC10：把某用户 `deletedAt` 置为当前时间后，用同一 email 创建新用户（`deletedAt: null`）→ 成功。
- [x] AC11：两行都软删的用户可以同 email、同 username 共存（连续建 A、软删 A、建 B、软删 B，再建 C 同 email/username）→ 三次创建全部成功。
- [x] AC12：`task.create({ ..., priority: 99 })` 抛错（`P2010`/raw query failed，错误信息含 `tasks_priority_range`）；`priority: 0` 与 `priority: 3` 各创建成功。
- [x] AC13：对一条有评论的用户执行 `user.delete({ where: { id } })` → 抛外键约束错误，随后该评论仍能被查到。

### API 行为

- [x] AC14：软删某用户后，`POST /api/auth/register` 用**同一个 email + 同一个 username + 新密码** → **201**，响应 `id` 与旧用户 id 不同，且响应体不含 `passwordHash`。
- [x] AC15：同 email 的**活跃**用户存在时注册 → 409，message 为 `该邮箱已被注册`。
- [x] AC16：活跃用户占用的 username → 409，message 为 `该用户名已被占用`。
- [x] AC17：AC14 之后，用新密码登录新账号 → 200；用旧密码登录软删账号的 email → 401。
- [x] AC18：`POST /api/tasks` 传 `priority: -1` / `4` / `1.5` → 400（DTO 的 `@Min(0) @Max(3)` 仍生效，请求没有打到库层）。
- [x] AC19：`POST /api/tasks` 不传 `priority` → 201 且 `priority === 2`。
- [x] AC20：`GATE_ALWAYS=1 bash .claude/hooks/gate.sh < /dev/null` 退出 0（lint + src 类型 + 测试类型 + 单元测试 + e2e）。

### 人工判定

- [ ] AC21：所有新增/改动的用户可见错误信息是中文，可直接呈现（不出现 `PrismaClientKnownRequestError`、`tasks_priority_range` 之类的库内文案）。
- [ ] AC22：`git diff` 里没有「不在范围内」一节列出的东西——特别是 `src/comments/` 仍为空目录、`web/` 零改动、没有新增接口路由。
- [ ] AC23：`README.md` 的「本项目现有设计的已知问题」：问题 1–3 标为已修并写清修法（部分唯一索引 + CHECK + RESTRICT 各自一句话）；`priority` 的描述从「1~4」改成「0~3」；问题 4、5 补上「本轮不修的理由 + 将来什么条件下才修」。
- [ ] AC24：`CLAUDE.md`「已知缺口」里两条过时项已清理或改写（`test/app.e2e-spec.ts` 的 `Hello World!` 断言已不存在；`users` 唯一约束与软删冲突已修），**且「没有单元测试」这条仍然成立的事实必须保留**（`src/**/*.spec.ts` 仍为 0 个文件，`gate.sh` 的单元测试步骤永远跳过），并新增一条提醒：**邮箱/用户名唯一性只存在于迁移 SQL 里，schema 不再声明 `@unique`，不要手滑加回去**。
- [ ] AC25：`src/user/user.service.ts` 里那条「注意这里不过滤 deletedAt：唯一索引包含已软删的行」的注释已改成与新语义一致的说明，代码与注释不再互相矛盾。

## 已定的决策

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 修复范围 | 只做问题 1–3；4 / 5 只写文档 | 成本差一个量级；#5 没有调用方，#4 的复合外键 Prisma 表达不了、随时可能被 `migrate dev` 冲掉 |
| 唯一性实现 | 部分唯一索引 `WHERE deleted_at IS NULL`，从 schema 去掉 `@unique` | 库层规则交给库；现有查询本来就是 `findFirst({ where: { email, deletedAt: null } })`，正好命中该索引 |
| 去掉 `@unique` 的代价 | 接受 schema 不再声明唯一性 | 已确认全仓库 `user` 只用 `findFirst`，没有 `findUnique` 依赖，去掉不影响代码 |
| `priority` 取值域 | 0–3（DTO 不动，只加库层 CHECK + 修文档） | 不动已发布的入参契约；文档里的「1~4」是错的，改文档 |
| `Comment.author` | `onDelete: Restrict` | 项目整体走软删，硬删用户本就不该发生；与 `teams.created_by` / `tasks.created_by` 的 `Restrict` 一致 |
| 软删后重新注册的语义 | 新建一行（新 id），旧行保留 | 这才是部分唯一索引的本来语义，审计清楚；「复活旧行」会让旧 id 名下的团队/任务历史突然接上一个新人 |
| 迁移粒度 | 一条 `fix_schema_integrity`，三处 schema 改动同轮上线、一起回滚 | 三者都是同一轮的库层修正，拆三条只增加回滚时的依赖关系 |
| 迁移写法 | `npx prisma migrate dev --name fix_schema_integrity --create-only` 生成后手写 SQL，再 `migrate dev` 应用 | Prisma schema DSL 表达不了部分索引和 CHECK，只能用 SQL 兜底 |
| 注册预查 | `create()` 里的两次查重加 `deletedAt: null` | 与新语义对齐；保留预查只为给出字段级中文提示，并发仍由索引兜底 |
| CHECK 违规的响应 | 不映射 400 | DTO 的 `@Min(0) @Max(3)` 已挡住 API 路径，库层只是兜底；e2e 直接断言 Prisma 抛错即可 |
| e2e 数据策略 | 新建一次性用户，不动 alice/bob/carol；`afterAll` 按 email 前缀硬删 | 软删种子用户会污染后续用例，恢复只能靠重跑 seed |
| 测试落点 | 新增 `test/schema-integrity.e2e-spec.ts` | 与 tasks / teams 的 e2e 平行，不混进已有用例文件 |

## 已知取舍

验收时不要把这些当成 bug：

- **`CREATE UNIQUE INDEX` 不会因历史数据失败，但回滚会。** 迁移方向安全（此刻全量唯一索引还在，库内不可能有重复 email）；反过来想把全量索引加回去时，如果软删期间已经产生了同 email 的多行，`CREATE UNIQUE INDEX` 会失败——回滚前得先手工清理重复行。
- **schema.prisma 不再是唯一性的真相。** 以后任何人给 `User.email` 补回 `@unique`，都会在下一次 `migrate dev` 里重建全量唯一索引，把本轮的修复悄悄冲掉。只能靠文档提醒 + AC6 那种「再跑一次仍 in sync」的检查。
- **部分唯一索引对「不加 `deletedAt` 过滤的查询」没有帮助。** 目前所有查询都带过滤，将来若有人写 `findFirst({ where: { email } })` 就会退化成全表扫描（不是错，只是慢）。
- **同一个邮箱在库里可能有 N 行（1 行活跃 + 若干已软删）。** 任何「按 email 找用户」的代码都必须带 `deletedAt: null`，否则 `findFirst` 可能返回历史行。
- **`Restrict` 之后硬删用户会直接失败。** 这是本轮的意图（强制走软删），但如果将来真要硬删（如 GDPR 删除），需要连带处理评论，届时再评估 `SetNull` + `authorId` 可空。
- **库层 `CHECK` 违规会在 Prisma 层抛 `P2010` 而不是可读的业务异常。** 这是兜底约束的正常代价，API 路径撞不到。
- **e2e 直连开发库 `team_task`。** 用例漏清理会留下 `schema-check-*@example.com` 之类的测试用户；恢复方式是 `npx prisma db seed` + 手删这些行。

## 预计改动

| 文件 | New / Edit | 说明 |
| --- | --- | --- |
| `prisma/schema.prisma` | Edit | `User.email` / `User.username` 去掉 `@unique`；`Comment.author` 改 `onDelete: Restrict` |
| `prisma/migrations/<ts>_fix_schema_integrity/migration.sql` | New | 手写：drop 两个旧唯一索引、建两个部分唯一索引、加 `tasks_priority_range` CHECK、重建 `comments.author_id` 外键为 `RESTRICT` |
| `src/user/user.service.ts` | Edit | 两处查重加 `deletedAt: null`；改写第 87 行那条已反向的注释；确认 `extractUniqueTargets` 对新索引名（含 `email` / `username`）仍能识别字段 |
| `test/schema-integrity.e2e-spec.ts` | New | AC9–AC19，用 `createTestApp` + `PrismaService`，用例自建自清 |
| `test/teams.e2e-spec.ts` | Edit | 实现时才发现：里面两处 `user.findUnique({ where: { email } })` 在去掉 `@unique` 后无法通过类型检查（AC8），改成 `findFirst({ where: { email, deletedAt: null } })`；断言不变 |
| `README.md` | Edit | 「本项目现有设计的已知问题」：1–3 标已修，`priority` 改 0~3，4/5 补「不修的理由」 |
| `CLAUDE.md` | Edit | 清理「已知缺口」里的两条过时项，新增「唯一性只在迁移里」的提醒 |
| `src/generated/prisma/` | 重新生成 | `npx prisma generate` 的产物，已 gitignore，不纳入 diff |

## 风险与回滚

- **最坏情况：迁移把 `users` 的全量唯一索引拿掉，而部分唯一索引没建成功。** 一条 `migration.sql` 在单个事务里执行，中途失败会整体回滚，不会留下半截状态；但如果手工在 psql 里跑过片段，就先核对 AC2 的两个索引都在。
- **漂移风险（最需要盯）**：手写 SQL 后 `migrate dev` 若报 drift / 提示 reset，**不要接受 reset**，那会清库。先 `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url ...` 看清 Prisma 认为差异在哪，再决定是调整 SQL 还是调整 schema。
- **代码风险极低**：无接口新增、无 DTO 变更、`src/comments/` 零代码，唯一被改的业务代码是 `user.service.ts` 的两处查重条件。
- **测试风险**：新 e2e 会往开发库写用户。清理不干净时用 `npx prisma db seed` + 删除 `schema-check-%@example.com` 的行恢复。
- **前置条件**：需要 `docker compose up -d` 起 Postgres（当前 daemon 未运行），迁移与 e2e 都依赖它。
- **回滚**：
  1. 代码/文档：`git revert <commit>`。
  2. 数据库：新增一条反向迁移（重建全量唯一索引 + 删 CHECK + 恢复 `ON DELETE CASCADE`），**执行前先查重复**：
     `SELECT email, count(*) FROM users GROUP BY email HAVING count(*) > 1;`
     （同理查 `username`），有重复就先决定保留哪一行，否则反向迁移必然失败。

## 验收记录（`/verify`，2026-11-24）

AC1–AC20 已实跑通过，证据如下；AC21–AC25 属人工判定，留给人工勾，未代为勾选。

| AC | 实际输出 / 证据 |
| --- | --- |
| AC2–AC5 | `docker compose exec -T postgres psql -U team_task -d team_task`：`users` 只剩 `users_pkey` + `users_email_active_key` + `users_username_active_key`，后两者 `indexdef` 均为 `... WHERE (deleted_at IS NULL)`；`tasks_priority_range` = `CHECK (((priority >= 0) AND (priority <= 3)))`；`comments_author_id_fkey` = `ON UPDATE CASCADE ON DELETE RESTRICT` |
| AC6 | `npx prisma migrate dev` → `Already in sync, no schema change or pending migration was found.`（另经独立核对：`_prisma_migrations` 四条 checksum 与各自 `migration.sql` 的 sha256 逐条一致，`prisma migrate diff` 输出空迁移） |
| AC8 | `npx tsc -p tsconfig.build.json --noEmit` 通过（一并覆盖 `test/teams.e2e-spec.ts` 的 `findUnique → findFirst` 迁移） |
| AC9–AC19 | `npx vitest run --config ./vitest.config.e2e.ts test/schema-integrity.e2e-spec.ts` → `Test Files 1 passed (1)` / `Tests 11 passed (11)`，用例名以 `AC9…AC13、AC14…AC19` 逐条对应 |
| AC20 | `GATE_ALWAYS=1 bash .claude/hooks/gate.sh < /dev/null` → exit 0 |

审查后追加的修正（不属于 AC，但影响断言稳健性）：

- `src/user/user.service.ts`：`extractUniqueTargets` 改为按索引名精确匹配（`users_email_active_key` / `users_username_active_key`），不再拼 `originalMessage` —— 原实现会把冲突「值」里的 `email` 字样误判成字段冲突。
- `test/schema-integrity.e2e-spec.ts`：AC9 / AC13 的主断言改为错误码 `P2002` / `P2003`，约束名只做宽松匹配，不再依赖 Prisma 对消息的渲染方式。
- `test/schema-integrity.e2e-spec.ts`：直连库造的 task 改用一次性用户当 `createdBy`，不再冒用 alice 的名义。
- `prisma/schema.prisma`：注释补「email 必须由写入方转小写」——部分唯一索引是大小写敏感的，绕过 `normalizeEmail` 的写库路径能造出两行活跃的 `Alice@x.com` / `alice@x.com`。

