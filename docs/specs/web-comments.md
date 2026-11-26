# 前端评论功能

> 由 `/spec` 生成。实现前把这份文档写完，验收时逐条勾这里。

## 背景

后端评论模块（`GET/POST /api/tasks/:taskId/comments`、`PATCH/DELETE /api/comments/:commentId`）已经上线，但前端没有任何入口：任务详情页只能看任务本身，用户无法在界面上读 / 写评论。`web/src/features/comments/` 不存在，`TaskDetailPage` 也没有评论区。本轮把这条链路接到任务详情页，让「人 → 团队 → 任务 → 评论」在界面上完整闭环。

## 目标

在任务详情页底部新增通栏评论区：加载并展示该任务的评论，支持发表、行内编辑自己的评论、二次确认后软删；所有请求走 `apiFetch`，权限最终由后端判定；不改后端、schema、路由或依赖。

## 不在范围内

明确排除，本轮不做。出现了就是越界改动：

- 后端任何改动（`src/`、`prisma/`），包括新增「评论数」字段或分页参数
- 评论分页 / 搜索 / 排序切换（后端接口就是一次返回全量、`createdAt` 升序）
- 楼中楼 / 回复 / @提及 / 通知 / 富文本 / 附件 / 表情
- 评论的乐观更新、本地草稿持久化、离线重试
- 为判断团队角色额外请求 `GET /api/teams/:teamId`；删除权限交给后端 403
- 在任务列表页展示评论数或最新评论
- 新增前端测试框架或依赖（`web/` 目前没有 vitest / testing-library，本轮不引入）
- 评论时间相对化（「3 分钟前」）或「已编辑」标记
- 深色模式适配（项目目前只有浅色主题）

## 交互与布局契约

### 位置

任务详情页的「描述 / 任务信息」两栏网格下方，新增一块**通栏** `panel`：

```
[返回任务列表]
[标题 + 操作]
[描述 + 进度] | [任务信息]
[评论区（通栏）]
```

- 评论区只在任务加载成功后渲染；任务 404 / 加载失败时整页走既有错误态，不渲染评论区。
- 评论区自身的加载失败只影响评论区（`ErrorNote` + 「重试」），不能把整页打成错误态。

### 列表

- 标题「评论」+ 数量（例如 `评论 · 3`）。
- 顺序直接使用后端返回顺序（`createdAt` 升序，同毫秒按 id）；前端不重排。
- 每条显示：`InitialsDot`（`author.username`）、`author.username`、`formatDate(createdAt)`、正文。
- 正文 `whitespace-pre-wrap break-words`，保留换行且长串不撑破布局。
- 空列表：「还没有评论，来说两句吧。」（不渲染空 `<ul>`）。
- 初次加载用 `LoadingState label="正在读取评论…"`；后续增删改后的重新拉取**不清空已有列表**。

### 发表

- 输入框在列表末尾，`textarea` 3 行，占位「写下你的评论…」，`maxLength=2000`。
- 右下角显示 `当前长度/2000`，随输入实时更新。
- `trim()` 后为空或正在提交时，「发表评论」按钮禁用；提交中按钮显示「发布中…」。
- `Ctrl+Enter` / `Cmd+Enter` 触发提交；按钮点击等价。
- 成功后：清空输入框、重新拉取列表、`toast('评论已发布', 'success')`。
- 失败后：保留输入内容，在输入框下方用 `ErrorNote` 展示后端 message（如 `任务不存在`）。
- 输入框内容原样提交（不 trim）；只把 trim 结果用于禁用判断。

### 编辑

- 「编辑」图标按钮**只在自己的评论上渲染**（`comment.authorId === useAuth().user?.id`）。
- 点击后该条正文切换为 `textarea`（同样 `maxLength=2000`、`n/2000`），带「保存」「取消」。
- `Ctrl+Enter` / `Cmd+Enter` 同保存；保存中按钮显示「保存中…」并禁用。
- 保存成功：退出编辑态、重新拉取列表、`toast('评论已更新', 'success')`。
- 取消：丢弃草稿、恢复原文，不发请求。
- 失败：保留编辑态与草稿，在编辑器内用 `ErrorNote` 展示后端 message。
- 多条评论可同时处于编辑态（每条各自维护草稿，互不影响）。

### 删除

- 「删除」图标按钮**在所有评论上渲染**，不预判角色。
- 点击弹出现有 `ConfirmDialog`：标题「删除这条评论？」，描述「删除后评论将从列表中消失，且暂不支持恢复。」，确认按钮「确认删除」。
- 成功：重新拉取列表、`toast('评论已删除', 'info')`。
- 失败（非作者 `MEMBER` 会收到 403 `无权删除该评论`）：关闭确认框，`toast(后端 message, 'error')`，评论保留。

### 视觉与可访问性

- 复用现有 token / class：`panel`、`btn`、`btn-primary`、`btn-ghost`、`btn-icon`、`field-textarea`、`caption`、`text-softink`。
- 图标按钮必须有 `title` 与 `aria-label`（「编辑评论」「删除评论」）。
- 不使用新的颜色 / 字体 / 第三方依赖。

## 验收标准

### 机器可验

- [ ] AC1：`npm run build:web` 退出 0（`tsc --noEmit` + `vite build`）。
- [ ] AC2：`npx prettier --check "web/src/features/comments/**/*.{ts,tsx}" "web/src/features/tasks/pages/TaskDetailPage.tsx" "web/src/shared/ui/StateNotes.tsx"` 退出 0（只检查本轮改动的文件；全量 `web/src` 里有改动前就未格式化的文件，见「已知取舍」）。
- [ ] AC3：`rg -n "tasks/\\$\\{taskId\\}/comments|comments/\\$\\{commentId\\}" web/src/features/comments` 能命中 list / create / update / delete 四条路径，且 `apiFetch` 调用不带 `/api` 前缀（前缀由 `http.ts` 统一加）。
- [ ] AC4：`rg -n "localStorage" web/src/features/comments` 无输出（token 只能经 `apiFetch` / `tokenStorage`）。
- [ ] AC5：`rg -n "deletedAt|passwordHash|email" web/src/features/comments` 无输出（评论类型只包含后端 7 键）。
- [ ] AC6：`git diff -- web/package.json web/package-lock.json` 为空（不新增依赖）。
- [ ] AC7：`git status --short` 中不存在 `src/`、`prisma/`、`test/` 的改动。
- [ ] AC8：`web/src/features/comments/types.ts` 的 `Comment` 接口字段为 `id / taskId / authorId / content / createdAt / updatedAt / author{id,username}`，与后端 `COMMENT_SELECT` 一致（代码审查：字段集合精确一致）。
- [ ] AC9：`TaskDetailPage.tsx` 在任务成功分支、两栏网格之后渲染 `<CommentSection taskId={task.id} />`；任务错误分支不渲染（代码审查）。
- [ ] AC10：`npm run lint` 退出 0（确认后端既有检查未被波及）。

### 人工判定

- [ ] AC11：评论区位于两栏网格下方且通栏，宽度与上方内容一致；1280px 与 375px 宽度下无横向滚动。
- [ ] AC12：初次进入任务详情，评论区先显示「正在读取评论…」，随后按旧→新顺序显示 seed 评论；标题数量与列表条数一致。
- [ ] AC13：前端展示与后端返回一致：作者头像 / 用户名 / 时间 / 正文正确，长文本保留换行且不撑破卡片。
- [ ] AC14：空任务显示「还没有评论，来说两句吧。」，不出现空列表边框。
- [ ] AC15：输入内容后字数从 `0/2000` 实时变化；纯空格内容时「发表评论」禁用；输入 2000 字后无法继续输入。
- [ ] AC16：点击「发表评论」或在输入框按 `Ctrl/Cmd+Enter` 均能成功发布；成功后输入框清空、列表末尾出现新评论、出现「评论已发布」toast。
- [ ] AC17：只在 `alice` 自己的评论上看到「编辑」；行内编辑保存后正文更新、出现「评论已更新」toast；「取消」不改变原文。
- [ ] AC18：编辑时清空内容，「保存」禁用；保存失败时停留在编辑态并展示后端中文错误。
- [ ] AC19：所有评论都有「删除」；点击弹确认框；作者删除自己的评论成功并出现「评论已删除」toast。
- [ ] AC20：用 `carol`（MEMBER）点击 `bob` 的评论「删除」→ 确认后提示 `无权删除该评论`，评论仍在；用 `alice`（OWNER）执行同一操作 → 删除成功。
- [ ] AC21：评论区加载失败时只在该区域内显示错误与「重试」，任务主体仍可读；点击「重试」能恢复。
- [ ] AC22：任务本身 404 / 加载失败时，页面只显示任务错误态，不出现评论区的加载骨架或空态。
- [ ] AC23：发布 / 编辑 / 删除过程中没有整页刷新、没有控制台报错；按钮在请求期间禁用防重复提交。
- [ ] AC24：所有用户可见错误均为后端返回的中文 message（或本地中文兜底），不出现英文 class-validator 文案。

## 已定的决策

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 布局 | 两栏网格下方通栏 | 评论区是纵向长内容，左侧 2/3 栏会被信息卡挤窄 |
| 编辑按钮可见性 | 仅作者本人 | `authorId` 已公开，规则简单稳定，避免展示必然 403 的按钮 |
| 删除按钮可见性 | 所有评论都显示 | 前端拿不到团队角色；项目既有约定是权限不复制到前端，交给后端 403 |
| 编辑交互 | 行内展开 + 保存 / 取消 | 保留原评论上下文，避免弹窗打断阅读 |
| 删除交互 | `ConfirmDialog` 二次确认 | 破坏性操作，与任务删除一致 |
| 数据更新 | 每次成功后重新拉取列表 | 服务端顺序是权威；评论量小，乐观更新不划算 |
| 输入框位置 | 列表末尾 | 阅读顺序自然，新评论紧邻输入框 |
| 快捷键 | `Ctrl/Cmd+Enter` 提交 / 保存 | 评论高频短输入，减少一次点击 |
| 字数 | `maxLength=2000` + 实时计数 | 与后端 `@MaxLength(2000)` 对齐，提前挡住 400 |
| 纯空白 | trim 后为空则禁用提交 | 避免制造无意义评论；后端仍允许，契约不变 |
| 多条编辑 | 每条独立本地状态，可同时展开 | 实现简单，切换时不丢草稿 |
| 时间格式 | 复用 `formatDate`（绝对时间） | 不引入相对时间库，和任务详情一致 |

## 已知取舍

- **普通成员会在他人评论上看到「删除」按钮**：点击后才由后端 403 拦下。这是「前端不预判权限」的代价；要消除它必须额外拉团队角色（成本与一致性风险都更高）。
- **每次增删改都重新拉全量评论**：列表会有一次静默刷新（不清空旧列表），不做乐观更新。
- **纯空白评论前端无法提交**：后端允许（见后端 spec 的已知取舍），但 UI 用 `trim()` 禁用；这是有意的界面约束，不是契约变更。
- **没有「已编辑」标记和相对时间**：`updatedAt` 已返回但本轮不展示；以后要加只需改 `CommentItem`。
- **没有评论分页**：后端一次返回全量，本轮不提前做分页 UI；单任务评论量增长后再一起改后端。
- **没有前端自动化测试**：`web/` 无测试框架，引入 vitest + testing-library 属于新依赖，本轮不做；交互靠 AC11–AC24 人工走查。
- **AC2 只检查本轮改动的文件**：`web/src/shared/layout/Wordmark.tsx` 在本轮之前就未通过 prettier。本轮不顺手格式化无关文件（会让 diff 混入无关改动），因此格式检查限定在 `features/comments/` 与 `TaskDetailPage.tsx`；Wordmark 的格式化留到单独清理。
- **发布后不自动滚动到新评论**：评论区在通栏底部、输入框就在列表末尾，常规长度下新评论已在视口内；不做滚动逻辑。

## 预计改动

| 文件 | New / Edit | 说明 |
| --- | --- | --- |
| `web/src/features/comments/types.ts` | New | `Comment` / `CreateCommentPayload` / `UpdateCommentPayload` |
| `web/src/features/comments/api.ts` | New | `list` / `create` / `update` / `remove`，全部走 `apiFetch` |
| `web/src/features/comments/components/CommentSection.tsx` | New | 加载、空态、错误 + 重试、增删改后的重新拉取、toast |
| `web/src/features/comments/components/CommentComposer.tsx` | New | 发表输入框、字数、禁用、`Ctrl/Cmd+Enter` |
| `web/src/features/comments/components/CommentItem.tsx` | New | 单条展示、行内编辑、删除确认入口 |
| `web/src/features/tasks/pages/TaskDetailPage.tsx` | Edit | 两栏网格后渲染 `<CommentSection taskId={task.id} />` |
| `web/src/shared/ui/StateNotes.tsx` | Edit | `LoadingState` 增加 `bare` 变体，避免嵌在评论区 `panel` 里出现「框中框」 |
| `README.md` | Edit | 「前端」进度补充评论区；「尚未实现」删除「评论自然也没有」 |

## 风险与回滚

- 不改后端 / schema / 依赖，**没有数据与迁移风险**。
- 评论区请求失败被限制在组件内，不影响任务详情主体；唯一需要守住的是不要把评论区放进任务加载的同一个错误分支。
- 整体回滚：删除 `web/src/features/comments/`、移除 `TaskDetailPage.tsx` 中的 `<CommentSection />` 并还原 README 即可，后端与数据库零改动。
- 若 `apiFetch` 的 401 刷新逻辑在评论请求上表现异常，影响面仅限任务详情页；可先把评论区从详情页摘掉回滚。
