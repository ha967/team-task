# 前端任务 CRUD

> 由 `/spec` 生成。实现前把这份文档写完，验收时逐条勾这里。
> 本轮属「中」档：单 feature 的新功能，但牵出 `web/src/features/teams/` 与路由改动。

## 背景

后端任务接口三周前就齐了（列表 / 详情 / 创建 / 更新 / 软删），但前端只有 `/tasks` 一个只读列表页：`web/src/features/tasks/api.ts` 里只有 `list()`，页面上没有任何入口能建、改、删任务，`GET /api/tasks/:taskId` 也没有消费者。后端的写入能力目前只能靠 `.http` 文件或 curl 触发。

## 目标

打开 `/tasks` 就能完成任务的整套 CRUD：列表 → 点进详情 → 编辑 / 删除，以及新建；表单里的「所属团队」「负责人」下拉来自后端真实数据，权限判断一律由后端返回的中文 message 呈现给用户。

## 不在范围内

明确排除，本轮不做：

- 任务列表的筛选 UI（`status` / `assigneeId`）与分页控件 —— 后端已支持，但本轮界面只用默认分页
- 团队相关页面（团队列表 / 详情 / 创建 / 成员管理）
- 评论（后端还没有 comments 接口）
- 前端预判权限、按 role 隐藏按钮
- 给 `web` 引入测试框架（vitest / @testing-library）或把 `web` 纳入 `npm run lint` 与 `.claude/hooks/gate.sh`
- 后端任何改动（`src/`、`prisma/` 一律不动）
- 新依赖（`web/package.json` 不改）
- 「回收站 / 撤销删除」：后端没有恢复接口，删除是单向软删

## 验收标准

### 机器可验

- [ ] AC1：`npm run build:web` 通过（含 `tsc --noEmit` + `vite build`），无类型错误
- [ ] AC2：`npx prettier --check "web/src/**/*.{ts,tsx,css}"` 通过
- [ ] AC3：`git diff --stat -- web/package.json package.json` 输出为空（没有新增依赖）
- [ ] AC4：`git status --short` 里 `src/`、`prisma/`、`test/` 均无改动
- [ ] AC5：`web/src/app/App.tsx` 里四条任务路由 `/tasks`、`/tasks/new`、`/tasks/:taskId`、`/tasks/:taskId/edit` 全部挂在 `<ProtectedRoute />` 之下，且 `/tasks/new` 声明在 `/tasks/:taskId` 之前
- [ ] AC6：新增文件恰好是这些：`web/src/features/teams/{types.ts,api.ts,useTeamMembers.ts}`、`web/src/features/tasks/{constants.ts,components/TaskForm.tsx,pages/TaskCreatePage.tsx,pages/TaskDetailPage.tsx,pages/TaskEditPage.tsx}`
- [ ] AC7：`grep -rn ": any\|<any>" web/src` 无输出
- [ ] AC8：`grep -rn "localStorage" web/src` 只出现在 `features/auth/token-storage.ts`
- [ ] AC9：`grep -rn "fetch(" web/src` 只出现在 `shared/api/http.ts`（其余请求都走 `apiFetch`）
- [ ] AC10：`grep -rn "role === 'OWNER'\|role === 'ADMIN'" web/src` 无输出（前端不抄权限规则）
- [ ] AC11：`GATE_ALWAYS=1 bash .claude/hooks/gate.sh < /dev/null` 仍退出 0（本轮不碰 `src`/`test`，验证没有被牵连）

### 人工判定

手工点验（`npm run dev` 起前后端，用 `alice@example.com / Password123!` 登录）。逐条勾：

- [ ] AC12：`/tasks` 列表每条标题可点，进入 `/tasks/:id` 详情；详情显示团队名、创建人、负责人、状态、优先级、预计工时、截止 / 完成 / 创建 / 更新时间
- [ ] AC13：列表页右上角「新建任务」→ 表单；alice 在 seed 里只属于 1 个团队（Frontend Platform，OWNER），进页面即被自动选中，「负责人」下拉列出该团队 3 名成员（alice / bob / carol）
- [ ] AC14：新建：标题留空点保存 → 浏览器原生必填拦截，不发请求；填标题 + 选团队 + 选负责人 + 设优先级 → 保存 → 跳到新任务详情，内容与刚才填的一致
- [ ] AC15：编辑：改标题 / 状态为「进行中」→ 保存 → 回详情看到新值；把状态改成「已完成」，详情的「完成时间」从 `—` 变成具体时间
- [ ] AC16：编辑：清空负责人（选「未指派」）保存 → 详情里负责人显示「未指派」
- [ ] AC17：删除：详情页点「删除」→ 出现确认框（文案含「暂不支持恢复」）→ 取消则什么都不发生；确认后回到 `/tasks` 且该任务不在列表里
- [ ] AC18：用一个非创建者、非负责人的 MEMBER 账号（seed 的 carol 对 `设计任务看板 UI` 即属此类）打开该任务详情 → 能正常看到详情，点「编辑」保存 → 页面上出现后端返回的中文提示「无权修改该任务」，而不是白屏或英文错误
- [ ] AC19：访问 `/tasks/00000000-0000-4000-8000-000000000000`（不存在的 UUID）→ 页面显示「任务不存在」，不崩
- [ ] AC20：未登录直接访问 `/tasks/new` → 被重定向到 `/login`；登录后 `/tasks/new` 能正常打开
- [ ] AC21：错误信息均为中文、可直接呈现给用户（无 `ApiError`、`PrismaClientKnownRequestError` 之类的原文）
- [ ] AC22：视觉上表单与详情页与现有登录页风格一致（复用 `.card` / `.field` / `.badge-*`，没有引入新的设计体系）
- [ ] AC23（反向回归，验收后补）：**纯空格标题**点保存 → 页面出现中文「标题不能为空」，且不发请求（`Network` 里没有 `POST /api/tasks`）。不能用「留空」验，浏览器原生 `required` 会先拦住
- [ ] AC24（反向回归，验收后补）：用 **bob**（同时属 Frontend Platform 与 Mobile App）走 `/tasks/new`：选 Frontend Platform → 负责人选 carol → **改选 Mobile App** → 负责人下拉自动回到「未指派」，保存成功、新任务负责人为空。用 alice（只 1 个团队）走这条路径踩不到问题

## 已定的决策

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 建 / 改 / 详情的落点 | 路由化：`/tasks/new`、`/tasks/:taskId`、`/tasks/:taskId/edit`，新建与编辑共用一个 `TaskForm` | 后端详情接口终于有消费者；可深链接便于手工验收；共用表单比分列 / 弹窗更省代码，也不用自己写焦点管理 |
| 团队 / 成员数据来源 | 新建 `web/src/features/teams/{types.ts,api.ts,useTeamMembers.ts}` | 符合「按 feature 切分」的约定；任务表单需要「我的团队」与「团队成员」两个后端接口，塞进 tasks 会让 feature 边界失真 |
| 筛选 / 分页 UI | 本轮不做 | 一次 diff 覆盖 CRUD + 筛选 + 分页会让验收失焦，且要处理「筛选 + 分页 + 空态」的组合 |
| 权限按钮 | 不做前端预判，照常显示，失败展示后端 message | 前端抄一份权限规则必然与 `tasks.service.ts` 分叉，正是「权限判定只放 service」要避免的 |
| 前端测试 | 只靠 `npm run build:web` + 手工点验清单 | 引 vitest + jsdom + testing-library 再加进门禁是独立一轮的工作量 |
| 删除交互 | 详情页删除 + `window.confirm` 二次确认，**不提供回收站** | 后端是单向软删、没有恢复接口；给用户「能撤销」的错觉比不给更糟 |
| 更新请求带不带 `teamId` | 不带 | 后端对「移动到其他团队」直接 403，前端不必提供这条路 |
| 可清空字段的语义 | 表单空值发 `null`（清除），不发 `undefined`（不改） | 后端 DTO 的 `@IsOptional()` 会跳过 `null`，service 直接透给 Prisma，两种语义在后端已区分好 |
| 状态标签 / 优先级文案 | 收敛到 `features/tasks/constants.ts` | 原先 `TasksPage` 里内联的 `STATUS_LABELS` 现在被列表、详情、表单三处用到，不抽会立刻分叉 |
| 新建后的默认团队 | 只有 1 个团队时自动选中，多个时留空强制用户选 | 默认落到「第一个」团队会让人在错误的团队里建任务，且删不掉（团队没有删除接口） |

## 已知取舍

- **没有前端权限预判**：MEMBER 能看到并点击别人任务的「编辑」，提交后才被 403 拦下。接受这个代价换「权限规则只有一份实现」（AC10 用 grep 钉住）。
- **列表不刷新机制**：详情页删除 / 编辑后回列表依赖组件重新挂载时重新 `list()`，没有做全局缓存或乐观更新。数据量小时够用。
- **负责人下拉在成员加载完成前只有「未指派」**：编辑一个已有负责人的任务时，下拉会先空一瞬再回填。没有加骨架或 loading 文案。
- **`useTeamMembers` 每次进表单都会请求一次 `GET /teams/:id`**：没有缓存。团队详情本来也会返回成员，重复请求可接受。
- **前端仍然零测试**：`web/` 不进 `npm run lint`、也没有 `test` 脚本，回归全靠 `tsc` + 手工点验。这是本轮明确接受的缺口，不是遗漏。
- **删除不可恢复**：见「已定的决策」最后两行，验收时不要当成 bug。
- **列表的「创建于」改为带时分秒**：从 `toLocaleDateString()` 换成统一的 `formatDate()`（`toLocaleString('zh-CN')`），是有意的口径统一，不是回归。
- **负责人是已软删用户时，编辑页下拉里没有这个人**：成员列表过滤了 `user.deletedAt: null`（`teams.service.ts`），而任务详情不过滤 `assignee` —— 下拉渲染成空白，但 `assigneeId` 仍是旧值，保存其他字段会静默保留原负责人。当前没有用户注销接口、seed 也不产生这种数据，**本轮不处理**，已记进 `README.md` 的已知缺口。

## 预计改动

| 文件 | New / Edit | 说明 |
| --- | --- | --- |
| `web/src/features/teams/types.ts` | New | `Team` / `TeamMember` / `TeamDetail` / `TeamListResponse` |
| `web/src/features/teams/api.ts` | New | `teamsApi.list()` / `detail(teamId)` |
| `web/src/features/teams/useTeamMembers.ts` | New | 按 `teamId` 拉成员，带 `cancelled` 标记防串台 |
| `web/src/features/tasks/types.ts` | Edit | 抽出 `TaskUserRef`；新增 `TaskDetail`、`CreateTaskPayload`、`UpdateTaskPayload` |
| `web/src/features/tasks/api.ts` | Edit | 新增 `detail` / `create` / `update` / `remove` |
| `web/src/features/tasks/constants.ts` | New | 状态 / 优先级文案与选项、`formatDate`、`toDateTimeLocal` |
| `web/src/features/tasks/components/TaskForm.tsx` | New | 新建与编辑共用表单，负责规范化并回调 payload |
| `web/src/features/tasks/pages/TaskCreatePage.tsx` | New | 拉团队列表 → 表单 → `POST` → 跳详情 |
| `web/src/features/tasks/pages/TaskDetailPage.tsx` | New | `GET /tasks/:id` + 编辑入口 + 删除（confirm） |
| `web/src/features/tasks/pages/TaskEditPage.tsx` | New | 拉详情预填 → `PATCH` → 回详情 |
| `web/src/features/tasks/pages/TasksPage.tsx` | Edit | 标题链到详情、新建入口、优先级 / 截止时间展示，创建时间统一为 `formatDate()`（带时分） |
| `web/src/app/App.tsx` | Edit | 三条新路由（挂在 `ProtectedRoute` 下） |
| `web/src/app/global.css` | Edit | `select` / `textarea` 样式、`.field-row`、`.actions`、`.button`、`.danger`、`.detail-grid`、`.task-description` |
| `README.md` | Edit | 「当前进度」前端一行更新为六条路由；已知缺口补「负责人软删」一条 |

## 风险与回滚

- **最坏情况**：`web/src/features/tasks/types.ts` 里 `Task` 的形状改了（`assignee` 改用 `TaskUserRef`），若与后端不一致会让整个列表页拿不到数据。AC1（`tsc`）+ 手工点验 AC12 同时通过即可排除。
- **路由**：`/tasks/new` 与 `/tasks/:taskId` 不会互相抢 —— react-router 按「静态段优先」打分匹配，声明顺序不是匹配的前提（把静态段写在前面只是为了读起来顺）。AC13 / AC20 手工覆盖这两条路径。
- **无数据风险**：纯前端改动，不动数据库、迁移、后端接口；回滚方式是把 `web/src/` 恢复到上一 commit，`src/`、`prisma/` 完全没碰。
- **门禁盲区**：`web/` 不在 `.claude/hooks/gate.sh` 里，所以门禁绿不代表前端没坏 —— 本轮必须结合 `npm run build:web` 与 AC12–AC24 的人工点验。
