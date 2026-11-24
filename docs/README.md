# 总览

## 项目目的

`team-task` 是一个团队协作任务管理系统，用来把「人 → 团队 → 任务 → 评论」这条主线完整走通：用户可以归属不同的团队，每个团队下有各自的任务，可以在任务下评论讨论。

它同时是一个全栈练手项目：除了业务本身，更看重「一个能长期维护的项目该长什么样」——统一的 `/api` 前缀、默认拒绝的全局守卫、DTO 入参校验、Prisma 显式 `select`、refresh token 轮换、软删除过滤、迁移 + seed 的可复现流程，以及 spec / verify 的开发工作流（见文末「工作流」）。

业务上的几条规则：

- 用户与团队是多对多，`team_members` 关联实体上还带角色：`OWNER` / `ADMIN` / `MEMBER`。创建团队的人自动成为该团队 `OWNER`。
- 任务属于某个团队，只有团队成员能看到、能操作。改/删的权限按角色分：`OWNER` / `ADMIN` 可动团队内任意任务，`MEMBER` 只能动自己创建的或分配给自己的任务。
- 任务有状态（`TODO` / `IN_PROGRESS` / `DONE`）、优先级、负责人、预估工时、截止时间。
- 删除一律是软删除（`deletedAt`），所有查询都带 `deletedAt: null` 过滤。

## 技术栈

**后端**（根目录，NestJS API，端口 `3001`）

| 分类 | 选型 |
| --- | --- |
| 框架 | NestJS 12（`@nestjs/platform-express`）+ TypeScript，ESM（`"type": "module"`、`module: nodenext`） |
| 数据库 | PostgreSQL 17（`compose.yml` 拉 `postgres:17-alpine`） |
| ORM | Prisma 7 + driver adapter `@prisma/adapter-pg`，client 生成到 `src/generated/prisma/` |
| 认证 | `@nestjs/jwt` + `bcryptjs`，自建全局 `JwtAuthGuard`（默认拒绝，放行用 `@Public()`） |
| 校验 | class-validator / class-transformer，全局 `ValidationPipe`（`transform` + `whitelist` + `forbidNonWhitelisted`） |
| 配置 | `@nestjs/config` + 启动期环境变量校验（`src/config/env.validation.ts`） |
| 测试 | Vitest 4 + supertest（`*.spec.ts` / `test/*.e2e-spec.ts`） |

**前端**（`web/`，npm workspace，dev 端口 `5173`）

| 分类 | 选型 |
| --- | --- |
| 框架 | React 19 + Vite 8，TypeScript |
| 路由 | react-router-dom 7 |
| 请求 | 自封装 `shared/api/http.ts`（自动带 Bearer、401 单飞刷新并重试、失败抛 `ApiError`） |
| 开发联调 | Vite proxy `/api` → `http://localhost:3001`，后端不开 CORS |

**工具链**

| 分类 | 选型 |
| --- | --- |
| Lint / 格式化 | oxlint + prettier（`src/`、`test/`；`web/` 需手动跑 prettier） |
| 开发启动 | `concurrently` 同时起 API + web（`npm run dev`） |
| 容器 | Docker Compose（只跑 Postgres，数据卷 `pgdata`，带 healthcheck） |

## 设计表

用户表 / 团队表 / 团队成员表 / 任务表 / 评论表——为什么拆 `team_members`、字段怎么定、现有设计还有哪些坑，见下方「表设计与建模规范」。

## 当前进度

已实现：

- 认证：`POST /api/auth/register|login|refresh|logout`；access token 只在内存，refresh token 只存 SHA-256 哈希并轮换，旧令牌复用会撤销该用户全部活跃令牌。
- 用户：`GET /api/users/me`。
- 团队：`GET /api/teams`（我参与的）、`GET /api/teams/:teamId`（含成员）、`POST /api/teams`（建团队 + 建者成为 `OWNER`，同一事务）。
- 任务：`GET /api/tasks`（分页 + 状态 / 负责人筛选）、`POST /api/tasks`、`PATCH /api/tasks/:taskId`、`DELETE /api/tasks/:taskId`（软删除），全部带团队权限校验。
- 数据：Postgres + Prisma 迁移 + seed（alice / bob / carol，密码 `Password123!`）。
- 前端：`/login`、`/register`、`/tasks` 三个页面。

尚未实现（改动时留意）：

- 评论：只有 schema + seed 数据，`src/comments/` 还是空目录，没有 controller / service。
- 团队成员管理（邀请、改角色、移除）没有接口；团队目前只有列表 / 详情 / 创建。
- 前端没有团队相关页面，评论自然也没有。
- schema 层还剩两条故意不修的问题（`tasks.assignee_id` 复合外键、`team_members` 缺 `leftAt`），详见「表设计与建模规范 → 本项目现有设计的已知问题」。

## 文档导航

| 章节 | 内容 |
| --- | --- |
| 数据库 / Prisma | Prisma 是什么、schema 三段结构、模型与关系写法、迁移与 generate 流程、seed、Prisma Studio |
| 表设计与建模规范 | 多对多与关联实体的设计、表设计标准、本项目已知问题 |
| NestJs | 控制器 / 提供者 / 模块 / 中间件 / 守卫 / 管道 / 拦截器 / 过滤器 |
| 工作流 | 新增变更与变更兜底（自动门禁 / 手动 `/verify`） |

# 数据库

使用Postgresql,通过docker拉取镜像

```bash
// 初始化prisma
npx prisma init --datasource-provider postgresql
```

## Prisma

Prisma 的语法（Prisma Schema Language，简称 PSL）是一种专门用来描述数据库结构和关系的“声明式语言”。不需要写 SQL 建表语句，只需要在 schema.prisma 文件里“描述”你的数据长什么样，Prisma 会自动帮你生成迁移文件、建表，并提供一个类型安全的客户端供代码调用。

一个标准的 schema.prisma 主要包含三个部分：（在根目录下的prisma/schema.prisma）

1. datasource：告诉 Prisma 要连哪个数据库（PostgreSQL、MySQL、SQLite 等），以及连接地址（通常放在 .env 里用 env("DATABASE_URL") 引用，避免泄露密码）。

2. generator：告诉 Prisma 要生成什么客户端代码（通常就是 prisma-client-js 或新版的 prisma-client）。

3. 数据模型（model）：用来定义具体的表（模型）、字段和表之间的关系。

### 数据模型

1. model 定义一张表
   一个 model 块对应数据库里的一张表（MongoDB 里是集合）。比如 model User { ... } 就代表一张用户表。

2. 字段与标量类型
   模型内部的每一行就是一个字段。你需要指定字段名和类型。常用的标量类型有：

String：文本

Int / BigInt：整数

Boolean：布尔值

DateTime：时间戳

Float / Decimal：小数

3. 关键属性（@ 和 @@）
   属性用来修饰字段或模型的行为

@id：标记主键。通常配合 @default(autoincrement()) 让数据库自动生成 ID。

@unique：唯一约束，比如邮箱不能重复。

@default：默认值，如 @default(now()) 表示创建时自动填入当前时间。

@updatedAt：它会让 Prisma 在数据更新时自动修改这个时间字段。

@map / @@map： 用来做映射。比如你代码里叫 avatarUrl（驼峰），但数据库列名想用 avatar_url（下划线），就用 @map("avatar_url")。@@map("users") 则是把 User 模型映射到数据库的 users 表。

4. 关系（@relation）
   这是连接两张表的关键，以 Task 和 User 为例：
   // 在 Task 模型里
   createdById String // 1. 先定义这个“外键”字段
   createdBy User @relation(fields: [createdById], references: [id])
   fields: [createdById]：指定当前模型（Task）里哪个字段是外键。references: [id]：指定对方模型（User）的哪个字段被引用。

编写完成prisma/schema.prisma后，通过npx prisma migrate dev --name <动词_描述>（初始是init）生成迁移sql，初始需要手动执行一次npx prisma generate（它做的事是代码生成：把 prisma/schema.prisma 里的模型编译成 TypeScript 客户端，输出到配置的 src/generated/prisma/：，）

后续流程为：
改 schema.prisma
↓
npx prisma migrate dev --name <动词_描述> (--name <动词_描述>类似git 的commit message)
↓ 自动：生成 SQL → 执行
读一眼生成的 migration.sql
↓
重新执行npx prisma generate

### seed

npx prisma db seed # 手动造数据（幂等，随时可跑）
npx prisma migrate reset # 清库 → 重放所有迁移 → 自动跑 seed（开发专用）
npx prisma studio # 浏览器里查看/编辑数据（详见下一节）

### Prisma Studio（图形化查看数据库）

不想装客户端又想看表里有什么的时候，用 Prisma 自带的网页版数据浏览器。

```bash
npx prisma studio                      # 默认 http://localhost:5555
npx prisma studio --port 5555          # 指定端口（5555 被占用时）
npx prisma studio --browser firefox    # 指定浏览器打开
```

前提：Postgres 容器已起（`docker compose up -d`），且 `.env` 里的 `DATABASE_URL` 能连上。

几个要点：

- Studio 用的是根目录 `prisma7.config.ts` 里的连接配置（注意文件名是 `prisma7.config.ts`，不是 `prisma.config.ts`），所以一般不用额外传参；要临时连别的库才用 `--url "<连接串>"`。
- 左侧列表按 `prisma/schema.prisma` 里的 model 来：User / Team / TeamMember / Task / Comment / RefreshToken，对应数据库里的 snake_case 表。
- 点进某张表可以过滤、排序、直接改单元格、新增行、删除行，改动**立即写库**，没有事务也没有撤销，调试期用来核对数据最方便。
- 它只能按模型看行，写不了 SQL、做不了多表 join；真要写 SQL 就用 `psql`、`pg_dump` 或者桌面客户端（DBeaver / pgAdmin），连 `localhost:5432` 即可。
- 别随手改 `passwordHash`：bcrypt 哈希改坏了对应账号就登不上。seed 出来的账号密码是 `Password123!`，真弄坏了跑一次 `npx prisma db seed` 恢复。
- 软删除字段 `deletedAt` 在 Studio 里不会自动过滤，看到的可能是全量数据，别以为查询漏了 `deletedAt: null`。
- 直接改库不会走业务逻辑（refresh token 轮换、软删除等都在 service 里），所以只用来查看 / 造临时测试数据。

## 表设计与建模规范

### 为什么要有 team_members 表：多对多与关联实体

先看关系的基数：一个 User 可以加入多个 Team，一个 Team 包含多个 User，**两边都是“多”，所以概念模型上是 M:N**。

关系型数据库没有“多值字段”（不像 Mongo 可以在文档里塞一个 `members: []` 数组），M:N 在物理上**必须**落成一张中间表，`team_members` 就是那张表。

但这张表比“纯连接表”多了一层东西，两者要分清楚：

|                  | 纯连接表（junction table） | 关联实体（association entity，本项目的情况） |
| ---------------- | -------------------------- | -------------------------------------------- |
| 列               | 只有两个外键               | 外键 + `role`、`joinedAt` 等业务列           |
| 语义             | “A 和 B 有关系”            | “这次加入本身是一件有属性的事实”             |
| 能否被别的表引用 | 一般不能                   | 能（前提是有自己的主键）                     |

因为带了 `role`（OWNER / ADMIN / MEMBER）和 `joinedAt`，这条关系就**升级成了实体**——“某人以某角色在某天加入某团队”，这个事实有属性、有生命周期，所以值得一张正式的表。

如果只是“谁在哪个团队”的纯关系、不带任何属性，用 Prisma 的**隐式多对多**就够了，Prisma 会自己建一张只有两列的 `_TeamToUser` 表：

```prisma
// 隐式 m-n：别这么写，因为我们要存 role
model User { teams  Team[] }
model Team { members User[] }
```

一旦需要角色、邀请时间、邀请人、是否已退出等字段，就必须**显式建表**（Prisma 文档里叫 explicit many-to-many relationship）。

这张表的三行关键声明

```prisma
model TeamMember {
  teamId String   @map("team_id") @db.Uuid
  userId String   @map("user_id") @db.Uuid
  role   TeamRole @default(MEMBER)
  joinedAt DateTime @default(now()) @map("joined_at") @db.Timestamptz(3)

  @@id([teamId, userId])   // 复合主键
  @@index([userId])        // 反向查询的索引
  @@map("team_members")    // 表名映射
}
```

- `@@id([teamId, userId])` 同时干了三件事：标识一行、给 `team_id` 建索引（复合主键的最左前缀）、**用约束保证“同一人不能重复加入同一团队”**。用数据库约束表达业务规则，比在代码里 `if (exists) throw` 可靠得多——并发下也不会漏。
- `@@index([userId])`：主键索引的顺序是 `(team_id, user_id)`，能高效回答“这个团队有哪些人”，但回答不了“我加入了哪些团队”（最左前缀用不上）。所以要在 `user_id` 上补一个索引。**Postgres 不会自动给外键列建索引**，这是最容易漏的一步。
- `onDelete: Cascade`：删团队 → 成员关系一起消失（合理）；删用户 → 成员关系一起消失（也合理）。注意 `Task.createdBy` 用的是 `Restrict`，这是有意的区分：**业务数据（任务）不能因为删人就消失，关系数据（成员关系）可以**。

主键选型上，这里用复合主键而不是再加一个 `id uuid` 是对的——成员关系天然由 `(团队, 用户)` 唯一确定，加代理键只会多一列冗余索引。只有当 `team_members` 需要被别的表引用（比如“邀请记录指向某条成员关系”），或者 API 想用 `PATCH /team-members/:id` 时，才升级成带 `id` 的实体。

### 表设计“标准”

**理论**

- **范式**：1NF 字段原子（不塞 JSON 数组、不用逗号分隔串）→ 2NF 非主属性完全依赖整个主键（`role` 依赖 `(teamId, userId)` 整体而非只依赖 `teamId`，所以这张表符合）→ 3NF 消除传递依赖（`tasks` 里不该存 `team_name`，只存 `team_id`）。实务目标是 3NF，然后**为了读性能有理由地反范式**（报表表、冗余计数列）。
- **完整性**：外键必须显式声明；`NOT NULL` 尽量加；唯一性用 `UNIQUE` 而不是只靠代码；取值范围用 `CHECK` 或 enum。
- SQL 标准（ISO/IEC 9075）只规定语言语法，不规定你怎么建模。

**工程惯例（各家规范大同小异）**，对照本项目的现状：

| 维度 | 通行做法                                                                                        | 本项目现状                                                    |
| ---- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 命名 | 表名复数 snake_case、列 snake_case、外键 `<单数>_id`、时间戳 `created_at/updated_at/deleted_at` | ✅ 由 `@map` / `@@map` 兜住                                   |
| 主键 | 自增 bigint 或 uuid；折中用 UUIDv7 / ULID（有时间序，避免随机插入造成 B-tree 页分裂）           | ✅ uuid v4，安全但插入随机；量大再考虑 v7                     |
| 时间 | 一律 `timestamptz`、存 UTC                                                                      | ✅ `@db.Timestamptz(3)`                                       |
| 金额 | `numeric`，不用 `float`                                                                         | —（暂无金额字段）                                             |
| 删除 | 软删 `deleted_at`，查询恒带 `IS NULL`                                                           | ✅ 但与唯一约束有冲突，见下                                   |
| 索引 | 按真实查询的 `WHERE / JOIN / ORDER BY` 建，复合索引守最左前缀，外键列补索引                     | ✅ `[teamId, status, createdAt]`、`[userId]` 等都是照查询建的 |
| 迁移 | 只做加法：先加可空列 → 回填 → 再收紧；变更走 migration 文件，不手改库                           | ✅ 走 `prisma migrate`                                        |
| 安全 | 密码 / 令牌只存哈希，敏感字段加密，最小权限账号                                                 | ✅ `password_hash`、`token_hash`                              |

可参考的材料：PostgreSQL wiki 的 _Don't Do This_、各社区手册里的数据库章节（如阿里《Java 开发手册》，规则通用）、以及各种 ORM 的默认约定（本质是别人替你总结好的规范）。

**加表时的自查清单**，每次过一遍：

1. 这张表一行代表什么？一句话说得清吗？（说不清通常意味着混了两个概念）
2. 哪些列必须非空？哪些组合必须唯一？这些约束写进 schema 了吗？
3. 每个外键的删除语义是什么：Cascade / Restrict / SetNull，是**有意选的**还是默认的？
4. 主要查询是什么？对应索引建了吗？有没有索引被别的复合索引的最左前缀完全覆盖（冗余）？
5. 时间列是否 UTC + `timestamptz`？`updated_at` 由谁写入？
6. 软删的表：`UNIQUE` 和软删冲突了吗？查询是否都带了 `deleted_at IS NULL`？
7. 有没有可由其他列推导出的冗余列？有就写下理由。

### 本项目现有设计的已知问题

对着上面的清单体检 `prisma/schema.prisma`，有五处值得处理。**1–3 已修**（迁移 `20261124070014_fix_schema_integrity`，spec 见 `docs/specs/schema-integrity-fixes.md`），4–5 明确本轮不修，理由写在各条里。

**1. 软删与唯一约束冲突（已修）**

原来 `User.username` / `User.email` 是 `@unique`，但 `User` 有 `deletedAt` 软删。用户被软删后，邮箱和用户名**仍然占着唯一约束**：新人用同一邮箱注册会撞 `ConflictException`，而按 `deletedAt: null` 查又查不到那行，排查时非常费解。

修法：改用 Postgres 的**部分唯一索引**（只对未删除的行生效），并把 `@unique` 从 schema 里去掉：

```sql
CREATE UNIQUE INDEX users_email_active_key ON users (email) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX users_username_active_key ON users (username) WHERE deleted_at IS NULL;
```

Prisma schema DSL 表达不了带 `WHERE` 的索引，所以写在迁移 SQL 里（`--create-only` 生成后手写，再 `migrate dev` 应用）。这是“标准知道在哪，ORM 表达不了就用 SQL 兜底”的典型情况。

连带的约定，改动时别踩：

- **`schema.prisma` 不再是唯一性的真相。** 谁把 `@unique` 加回去，下一次 `migrate dev` 就会重建全量唯一索引，把这条 bug 带回来。
- 查询用户只能用 `findFirst({ where: { email, deletedAt: null } })`；按 email 调 `findUnique` 现在连类型都过不了，而且不带 `deletedAt` 过滤可能查到历史行。
- 同一个邮箱在库里可能有 N 行（1 行活跃 + 若干已软删），审计上是好事，但任何“按邮箱找人”的代码都必须带过滤。

**2. `Task.priority` 没有取值范围约束（已修）**

取值域是 **0–3**（0 最低 / 3 最高），默认 2；应用层由 `CreateTaskDto` 的 `@Min(0) @Max(3)` 挡。库层原来完全裸奔，任何直接写库的路径（Studio、psql、脚本）都能写进 99。现在补了 CHECK：

```sql
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_range CHECK (priority BETWEEN 0 AND 3);
```

坑提醒：库层违规在 Prisma 里是 `P2010` 之类的原始错误（不是可读的业务异常），这是兜底约束的正常代价——API 路径撞不到它，因为 DTO 先挡住了。

**3. `Comment.author` 用了 `onDelete: Cascade`（已修）**

删用户会把他的评论连带删掉，而评论是团队的历史资产。已改成 `onDelete: Restrict`：硬删用户直接被外键挡住，与 `teams.created_by` / `tasks.created_by` 的处理一致。

没选 `SetNull` + `authorId` 可空的理由：项目整体走软删，硬删用户本就不该发生；把 `authorId` 变成可空会把“作者已注销”的成本摊给以后所有评论查询。真要做 GDPR 式硬删时再重新评估。

**4. `Task.assigneeId` 无法在库层面保证“被指派人属于该团队”（本轮不修）**

现在靠 `src/teams/team-access.service.ts` 的 `TeamAccessService.assertTeamMember` 兜（tasks 与 teams 共用同一份实现）。库层面可以用**复合外键**做到：

```sql
FOREIGN KEY (team_id, assignee_id) REFERENCES team_members (team_id, user_id)
```

不修的理由：`assignee_id` 可空、`team_id` 非空，Prisma 对这种“部分可空”的复合外键支持很差，手写进迁移后每次 `migrate dev` 都可能被冲掉，收益（防住应用层漏校验）小于维护成本。

什么条件下才修：出现“除了 NestJS 还有第二个写库入口”（脚本、后台工具、数据导入），或应用层权限校验已经出过一次线上事故。届时用原生 SQL 兜底，并在迁移里加注释说明它绕过了 Prisma。

**5. `team_members` 没有 `deletedAt` / `leftAt`（本轮不修）**

用户退队或管理员移除成员只能硬删行，团队历史就没了（“这人上个月是不是在这队”答不上来）。

不修的理由：目前**没有任何**退队 / 移除成员的接口，加了 `leftAt` 也没有调用方会写它；而“成员关系是一次性事实”在现阶段够用。

什么条件下才修：一旦实现成员管理接口（邀请 / 移除 / 退出），必须同步加 `leftAt`（保留历史）而不是硬删，否则第一版权限审计表就是残的。


# NestJs

NestJs中模块，控制器，提供者
安全设计：默认关闭永远优于默认放行。

## 控制器

获取请求的相关信息注解
@Request()
@Query()
@Body()
@Params 获取url上参数

@Header 请求头相关信息

```typescript
// 获取GET请求参数
@Get()
findAll(@Request() req) {
    // @Request注解获取到的值通过 req.query.xxx 可以拿到具体的值
}

@Get()
findAll(@Query() query) {
    // @Query 注解获取到的值则直接通过 query.xxx 可以拿到具体的值
}

// 动态参数
@Get(":id")
findOne(@Request() req) {
    // 获取到url上的参数,如 http://aaa/1  通过req.params.xxx获取
    // 同样可以通过@Params(key)的方式来简化
}

// 获取POST请求参数
@Post()
create(@Request() req) {
    // @Request注解获取到的值通过 req.body.xxx 可以拿到具体的值
}

@Post()
create(@Body() body) {
    // @body注解获取到的值通过 body.xxx 可以拿到具体的值
}

@Post()
create(@Body("age") age) {
    // @body(key)注解直接获取到的body中对应的key值
}

```

## 提供者

在一个模块中，提供者是对外提供服务的文件，一般命名为 xxx.service.ts，默认该提供者的作用域只在该模块内

```ts
@Injectable()
export class TasksService {}

// TasksModule中在provider数组中导入声明，即可在该模块下使用
```

如果想要在其他模块也使用，需要在module中export该提供者，然后在具体使用的模块处import [TaskModule]，这样TaskModule的TaskService就可以在这里使用了。

## 模块

@Module注解声明这个类是一个模块，如下:

```ts
@Module({
  imports: [PrismaModule], // 模块：把别的模块的"能力"接入当前模块.imports 数组中只能是模块（被 @Module() 装饰的类，或者它的动态模块对象），不能放 service、controller 或普通类。
  controllers: [TasksController], // 控制器：路由层
  providers: [TasksService], // 提供者：可被注入的类/工厂/值
  exports: [TasksService], // 导出：允许别的模块注入这些 provider
})
```

为什么必须是模块
Nest 启动时不是简单地"扫描所有类"，而是先构建一棵模块图：

AppModule
├─ TasksModule
│ └─ imports: PrismaModule ← 在这里接入
├─ UserModule
└─ PrismaModule
└─ exports: PrismaService
依赖注入的可见性由这张图决定：TasksModule 能注入什么，只取决于它自己声明的 providers，以及它 imports 的模块所 exports 的东西。PrismaService 是在 PrismaModule 里注册的，所以必须通过 imports: [PrismaModule] 把它接进来；直接写 imports: [PrismaService] 会报错，因为 PrismaService 上没有 @Module() 元数据，Nest 不知道该怎么处理它。

几个容易踩的点

1. imports: [PrismaModule] 不等于"能注入 PrismaService"

还要求 PrismaModule 里写了 exports: [PrismaService]。没有 exports 的模块，import 了也拿不到任何东西。

2. 顶部的 ES import 和 @Module 的 imports 是两件事

import { PrismaModule } from './prisma.module.js'; // ① 让 TS 能引用这个类

@Module({
imports: [PrismaModule], // ② 告诉 Nest 建立模块依赖
})
①只是 JavaScript 的模块加载，解决"这个名字从哪来"；②是 Nest 的依赖图，解决"哪些 provider 可见"。

3. 模块可以"转导出"

@Module({
imports: [PrismaModule],
exports: [PrismaModule],
})
export class DatabaseModule {}
这样导入 DatabaseModule 的模块，也能拿到 PrismaModule 导出的 provider。适合做一层封装（比如以后把 Prisma、Redis、队列打包成基础设施模块）。

4. 动态模块也是模块

imports: [
ConfigModule.forRoot({ isGlobal: true }),
JwtModule.register({ secret: process.env.JWT_SECRET }),
]
forRoot() / register() 返回的 DynamicModule 对象本质上仍是模块描述，可以放进 imports。你项目里 src/app.module.ts 的 ObserveModule.forRoot(...) 就是这种。

5. 全局模块

给 PrismaModule 加 @Global() 后，任何模块都不用 import 就能注入 PrismaService。方便，但依赖关系变得不透明；学习阶段建议现在这样显式导入。

6. 循环依赖

两个模块互相 import 时（比如 UserModule 需要 TeamModule，TeamModule 又需要 UserModule），Nest 会报错，需要用 forwardRef(() => Module) 打破循环。更好的做法是先想一想模块划分是否合理——通常循环依赖意味着边界没切好。

一个判断口诀
想"用别人模块里的 service" → imports 那个模块。
想"让别人用我模块里的 service" → exports 那个 service。
自己模块里新建的 service → 放 providers。

## 中间件

中间件函数可以访问请求和响应对象，以及应用程序请求-响应周期中的 next() 中间件函数。 下一个中间件函数通常由名为 next 的变量表示。
中间件函数可以执行以下任务：

- 执行任意代码。
- 修改请求和响应对象。
- 结束请求-响应周期。
- 调用堆栈中的下一个中间件函数。
- 如果当前中间件函数没有结束请求-响应周期，它必须调用 next() 将控制权传递给下一个中间件函数。否则，请求将被挂起。

一个请求进入 NestJS 后，大致流向是：
中间件 → 守卫 → 拦截器（前） → 管道 → 控制器 → 拦截器（后） → 过滤器（仅异常时）
作用：最接近底层 Express 的环节，用于处理原始请求，如日志、CORS、Body 解析等。
环节：请求进入 Nest 后的第一站，在路由匹配和守卫之前执行。它无法方便地使用 Nest 的依赖注入（除非特殊配置）。

### 类中间件

如何创建一个中间件：

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';

// 在函数中或在带有 @Injectable() 装饰器的类中实现自定义 Nest 中间件。该类应该实现 NestMiddleware 接口，而函数没有任何特殊要求
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    console.log(`Request... ${req.method} ${req.originalUrl}`);
    // send和next二选一，res.send可以进行拦击，next的话就继续下一步操作
    res.send('我被拦截了');
    next();
  }
}
```

然后在模块处引入中间件，包含中间件的模块必须实现 NestModule 接口。

```typescript
@Module({
  provider: [UserService],
  controller: [UserController],
})
export class UserModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      // 排除某些路由不应用中间件
      .exclude(
        { path: 'user', method: RequestMethod.GET },
        { path: 'user', method: RequestMethod.POST },
        'user/{*splat}',
      )
      // forRoutes可接收单个字符串、多个字符串、RouteInfo 对象、控制器类甚至多个控制器类。多数情况下只需传入逗号分隔的控制器列表。
      .forRoutes(UserController);
  }
}
```

### 函数中间件

如果中间件（LoggerMiddleware） 类非常简单。它没有成员变量、没有额外方法、也没有依赖项。实际上是直接用一个简单函数来定义它。这种类型的中间件被称为函数式中间件 。让我们将基于类的日志中间件转换为函数式中间件来说明两者的区别：

```ts
import { Request, Response, NextFunction } from 'express';

export function logger(req: Request, res: Response, next: NextFunction) {
  console.log(`Request...`);
  next();
}
```

并在 AppModule 中使用它：

```ts
consumer.apply(logger).forRoutes(CatsController);
```

提示:
当中间件不需要任何依赖项时，请考虑使用更简单的 函数式中间件 替代方案。

### 全局中间件

如果我们需要一次性将中间件绑定到所有已注册的路由，可以使用 INestApplication 实例提供的 use() 方法：

```ts
// main.ts
const app = await NestFactory.create(AppModule);
app.use(logger);
await app.listen(process.env.PORT ?? 3000);
```

注意:在全局中间件中无法访问 DI 容器。使用 app.use() 时，可以改用函数式中间件 。或者，也可以使用类中间件并通过 AppModule（或其他模块）中的 .forRoutes('*') 来消费它

守卫（Guards）：处理认证与授权。比如用 JWT 守卫保护需要登录的路由。

拦截器（Interceptors）：适合做响应格式统一、日志记录等

管道（Pipes）：做数据校验和转换。配合 class-validator 和 DTO（数据传输对象），在请求进入业务逻辑前就拦截掉非法参数。

## 守卫

守卫是一个用 @Injectable() 装饰器注解的类，它实现了 CanActivate 接口。见jwt-auth.guard.ts
作用：授权。判断请求是否允许访问路由（如检查 Token、角色权限），返回 true 放行，false 则抛出 ForbiddenException 拒绝。
环节：在中间件之后、管道之前执行。此时路由已确定，但请求体尚未经过管道验证和转换。
守卫具有单一职责 。它们根据运行时存在的某些条件（如权限、角色、访问控制列表等）来决定是否由路由处理程序处理给定请求。这通常被称为授权 。
授权（及其通常与之协作的认证 ）在传统的 Express 应用中通常由中间件处理。中间件非常适合处理认证，因为像令牌验证和向 request 对象附加属性这类操作与特定路由上下文（及其元数据）没有强关联。

但中间件本质上是"哑"的，它不知道调用 next() 函数后会执行哪个处理程序。而守卫则能访问 ExecutionContext 实例，因此确切知道接下来要执行什么。与异常过滤器、管道和拦截器类似，守卫的设计让你能在请求/响应周期的精确时点介入处理逻辑，并以声明式方式实现。这有助于保持代码的 DRY 原则和声明式风格。

## 管道

作用：数据转换与验证。对控制器方法的参数进行处理，例如用 ValidationPipe 校验 DTO，或将字符串 "123" 转为数字 123。
环节：在守卫之后、控制器方法执行之前运行。它只处理即将传入处理函数的参数。

## 拦截器

作用：包裹处理函数的执行。可以在方法执行前后添加逻辑（如记录耗时、统一响应格式、缓存），并能捕获下游（管道/控制器/服务）抛出的错误。
环节：分两段执行。请求进入时在管道之前（Pre），响应返回时在控制器之后（Post），且后段顺序与进入时相反。

## 过滤器

作用：异常兜底。捕获请求处理过程中未被捕获的异常，并转换为友好的 HTTP 响应格式。
环节：仅在发生异常时触发，且会跳过剩余生命周期直接进入过滤器。它的查找顺序是从路由级到全局级，与其它组件相反。

# 工作流

## 新增变更

新增功能或者修改功能通过/spec command(.claude/commands)来描述改动，大模型会先判断这件事属于哪一档，并会通过不断的追问来完善改动，避免后续多轮修改或返工。

## 变更兜底

### 自动兜底

在每次生成代码后，会自动执行一次门禁脚本。
具体配置在./claude/settings.json中，这里是配置了每次对话结束后都会执行.claude/hooks/gate.sh
逻辑为:
首先会先判断「工作区脏不脏」（改动提交（或 revert）之后，门禁才会恢复「纯对话轮次跳过」）,如果工作区无改动，则直接放行。
如果有改动，且改动包含:

- src/
- test/
- tsconfig.json
- tsconfig.build.json
- tsconfig.test.json
  那么就会执行触发门禁后续逻辑，进行lint测试（tsc），单元测试（e2e）
  如果上述测试通过，门禁放行，失败则回灌给大模型。

### 手动兜底

虽然有门禁帮我验证了lint和单元测试，但是可能还存在一些逻辑漏洞，所以还需要通过/verify command对本次改动进行验证，该命令包含
L0 → gate.sh 再跑一遍（面向验收）
L1 → 派子agent reviewer 看 diff，带 spec 当基准
L2 → 逐条核对 AC 表格
