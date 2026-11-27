# 前端团队模块

> 由 `/spec` 生成。实现前把这份文档写完，验收时逐条勾这里。

## 背景

后端团队模块已经完整：列表 / 详情 / 创建，以及成员管理的邀请、改角色、移除 / 退出。前端 `web/src/features/teams/` 只有给任务表单用的 `api.ts` / `useTeamMembers.ts`，没有团队页面、路由或导航入口；用户只能在新建任务时选择一个已有团队，却无法创建团队或管理成员。

## 目标

登录用户能在 `/teams` 查看自己参与的团队、按名称 / 简介搜索、在 `/teams/new` 创建团队，并在 `/teams/:teamId` 查看团队与成员、按角色邀请成员、改角色、移除成员或退出团队。前端按当前用户角色预判可用操作，后端仍然是最终权威。

## 不在范围内

明确排除，本轮不做。出现了就是越界改动：

- 后端任何改动（接口、DTO、schema、迁移、seed）
- 团队改名 / 解散（后端没有接口）
- 按团队查任务 / 团队任务列表（后端没有该接口）
- 待接受的邀请流程、用户搜索、邮件通知（后端没有）
- 历史成员 / 已离开成员列表（后端只返回活跃成员）
- 成员分页、团队分页控件
- 引入前端测试框架（vitest / testing-library）或任何新依赖
- 任务模块的功能改动（唯一允许的改动：新建任务页改用 `teamsApi.listAll()` 取全量团队，以及该页团队加载错误改用统一的中文错误映射）

## 验收标准

### 机器可验

- [ ] AC1：`npm run build:web` 退出 0（`tsc --noEmit` + `vite build`）
- [ ] AC2：`npx prettier --check` 对 `web/src/features/teams/` 下本轮改动文件、`web/src/app/App.tsx`、`web/src/shared/layout/AdminShell.tsx`、`web/src/shared/layout/Sidebar.tsx`、`web/src/features/tasks/pages/TaskCreatePage.tsx` 退出 0
- [ ] AC3：`grep -n 'path="/teams' web/src/app/App.tsx` 能匹配到 `/teams`、`/teams/new`、`/teams/:teamId` 三条路由
- [ ] AC4：`grep -n "teamsApi.listAll" web/src/features/tasks/pages/TaskCreatePage.tsx` 有结果，且 `web/src/features/teams/api.ts` 里有 `listAll` 定义
- [ ] AC5：`grep -rn ": any" web/src/features/teams/` 无结果
- [ ] AC6：`git diff -- web/package.json web/package-lock.json` 为空（没有新增依赖）

### 人工判定

**导航与标题**

- [ ] AC7：桌面侧栏和 900px 以下的底部导航都出现「团队」入口；在 `/teams`、`/teams/new`、`/teams/:teamId` 上「团队」保持高亮
- [ ] AC8：顶栏标题分别是「团队」「新建团队」「团队详情」；任务相关路由的标题保持原样

**团队列表 `/teams`**

- [ ] AC9：登录后能看到自己参与的团队卡片，每张卡片含团队名、简介（无简介显示占位）、当前用户角色、创建日期
- [ ] AC10：搜索框按团队名或简介做大小写不敏感过滤；无匹配时显示「没有匹配的团队」，而不是空白页
- [ ] AC11：没有任何团队时显示空态和「新建团队」入口
- [ ] AC12：加载中显示 `LoadingState`；请求失败显示 `ErrorNote` +「重试」，重试后能恢复
- [ ] AC13：点击卡片进入团队详情；「新建团队」按钮进入 `/teams/new`

**新建团队 `/teams/new`**

- [ ] AC14：团队名称为空或纯空格时，前端直接提示「团队名称不能为空」，不发送请求
- [ ] AC15：名称最长 64、简介最长 500，输入框有 `maxLength`；不填简介也能创建
- [ ] AC16：创建成功弹 toast，并跳转到新团队详情；新团队立刻出现在 `/teams` 列表里，角色为「所有者」
- [ ] AC17：后端返回 400 / 其他错误时，表单内联展示后端中文 message，按钮恢复可点
- [ ] AC18：取消返回 `/teams`

**团队详情 `/teams/:teamId`**

- [ ] AC19：详情展示团队名、简介、创建日期、当前用户角色、成员数量
- [ ] AC20：成员表格按后端顺序（`joinedAt` 升序）展示，含成员名、角色、加入时间；当前用户那一行标注「你」
- [ ] AC21：团队成员加载失败（403 / 404）时显示后端 message，不渲染空的成员管理区

**邀请成员**

- [ ] AC22：`OWNER` / `ADMIN` 能看到邀请表单；`MEMBER` 看不到
- [ ] AC23：邮箱为空 / 纯空格时前端提示「请输入邮箱」；明显非法格式（不含 `@` 或域名没有 `.`）提示「请输入有效的邮箱」；两种情况都不发送请求
- [ ] AC24：邀请成功 toast 显示被邀请人用户名，输入框清空，成员表格立即出现新成员（角色为「成员」）
- [ ] AC25：邮箱不存在时表单内联显示「用户不存在」；已是成员时显示「该用户已是团队成员」

**改角色**

- [ ] AC26：`OWNER` 看到每个成员的角色下拉（`所有者` / `管理员` / `成员`）；`ADMIN` / `MEMBER` 只看到只读角色标签
- [ ] AC27：`OWNER` 改角色成功后有 toast，刷新页面角色仍保持；后端报错时展示 message 并恢复原角色显示
- [ ] AC28：团队只剩一个 `OWNER` 时，该成员的角色下拉禁用，并显示「团队至少需要保留一个所有者」

**移除成员**

- [ ] AC29：`OWNER` 可移除 `ADMIN` / `MEMBER`，以及非最后一个 `OWNER`；`ADMIN` 只能移除 `MEMBER`；不能移除最后一个 `OWNER`；不满足条件的行不渲染移除按钮
- [ ] AC30：点击移除先弹 `ConfirmDialog`，确认后 toast、成员行消失；取消则不发请求
- [ ] AC31：后端 403 / 409 时展示中文 message

**退出团队**

- [ ] AC32：任意成员都能在详情右侧看到「退出团队」；最后一个 `OWNER` 的按钮禁用并显示「团队至少需要保留一个所有者」
- [ ] AC33：退出前有确认弹窗；确认后 toast、跳回 `/teams`，该团队不再出现在列表里
- [ ] AC34：非最后一个 `OWNER` 退出成功后，团队里仍有其他 `OWNER`（后端规则，前端不额外造数据）

**任务模块回归**

- [ ] AC35：`/tasks/new` 的团队下拉仍正常；只有一个团队时自动选中；没有团队时仍显示「你还没有加入任何团队」提示
- [ ] AC36：任务列表、详情、新建、编辑、评论区的现有交互没有被本次改动影响

**整体**

- [ ] AC37：成员表格在窄屏可横向滚动，不撑破页面；按钮 / 输入框在移动端可点
- [ ] AC38：所有新增错误文案来自后端中文 message 或前端中文提示，没有英文原文、没有 `[object Object]`
- [ ] AC39：删除 / 移除 / 退出这类破坏性操作都有二次确认

## 已定的决策

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 模块范围（Q1） | 列表 + 详情 + 新建 + 成员管理全做 | 后端接口已齐，只做一半会留下「有接口没人用」 |
| 新建团队入口（Q2） | 独立页面 `/teams/new`，成功后跳详情 | 与 `/tasks/new` 一致，校验 / 取消 / 返回路径现成 |
| 成员管理形态（Q3） | 团队详情页内联：邀请表单 + 成员表格行内角色下拉 + 移除按钮 + 退出团队 | 成员列表本来就在详情响应里，少一个路由和一次状态同步 |
| 前端权限预判（Q4） | 按当前用户 `role` 条件渲染 / 禁用；后端仍兜底 | 详情已返回当前用户角色和全部成员，判断成本低；减少「点了才 403/409」 |
| 列表数据口径（Q5） | `teamsApi.listAll()` 逐页取全量，客户端搜索；顺手修任务新建页只取第一页 | 团队数量小，客户端过滤足够；两处口径一致 |
| 列表展示 | 卡片网格，不做分页控件 | 团队数量通常很少；分页 UI 成本高于收益 |
| 变更后刷新 | 邀请 / 移除成功后静默重拉详情；改角色先乐观更新行内显示、失败后重拉回滚；退出后跳列表 | 受控 role select 需要即时反馈，服务端仍是最终权威 |
| 角色文案 | `OWNER` → 所有者、`ADMIN` → 管理员、`MEMBER` → 成员 | 面向用户中文；API 值保持英文枚举 |
| 日期展示 | 列表 / 表格用 `toLocaleDateString('zh-CN')`，详情用 `toLocaleString('zh-CN')` | 不跨 feature 引任务模块的格式化函数，避免无谓耦合 |
| 测试 | 不引入前端测试框架，靠 `build:web` + 三角色人工走查 | 新依赖超出本轮；后端权限已有 e2e |

## 已知取舍

- **没有前端自动化测试。** 交互正确性依赖人工走查；角色 / 最后 OWNER 的判断即使前端有 bug，后端仍会 403 / 409 兜底。
- **前端权限判断基于本次加载的成员快照。** 其他管理员并发改角色 / 移除成员后，本页可能短暂显示过期按钮；点击后由后端拒绝并展示 message。
- **只有改角色做了行内乐观更新。** 为了让受控 `<select>` 在请求返回前不弹回旧值，先改行内显示；失败后靠静默重拉回滚。若回滚请求也失败，界面可能短暂停在乐观值并显示错误，重新进入页面会恢复。邀请 / 移除 / 退出都等服务端返回后重拉。
- **允许 `OWNER` 连续对多行改角色。** 两个 PATCH 可能并发；`loadSeq` 只采纳最后一次静默刷新，后端仍是最终权威。若需要更强约束，可在保存中禁用其他行的下拉。
- **邀请邮箱前端只拦明显非法格式。** 正则只要求有 `@` 且域名含 `.`，真正的合法性以后端 `@IsEmail()` 为准；前端拦截是为了避免把后端英文校验消息直接渲染给用户。
- **团队列表一次取全量。** 团队数量到几百个时首屏会变慢；当前不预做分页 / 虚拟列表。
- **不能移除最后一个 `OWNER` 的约束在 UI 上表现为禁用。** 如果快照过期，后端 409 的 message 仍会展示。
- **没有团队改名 / 解散 / 团队任务视图。** 后端没有对应接口，不在本轮补。
- **任务新建页的团队下拉改为全量后，请求次数增加。** 团队超过 100 个时会多几次分页请求，换取下拉不再截断。
- **成员角色下拉是原生 `<select>`。** 与任务表单一致，不引入自定义下拉组件。

## 预计改动

| 文件 | New / Edit | 说明 |
| --- | --- | --- |
| `web/src/features/teams/types.ts` | Edit | 补 `CreateTeamPayload` / `InviteTeamMemberPayload` / `UpdateTeamMemberRolePayload` / `RemoveTeamMemberResponse` |
| `web/src/features/teams/api.ts` | Edit | 补 `listAll` / `create` / `invite` / `updateMemberRole` / `removeMember` |
| `web/src/features/teams/constants.ts` | New | `ROLE_LABELS` / `ROLE_OPTIONS` / `ROLE_TONE` |
| `web/src/features/teams/permissions.ts` | New | `countOwners` / `canInvite` / `canChangeRoles` / `canRemoveMember` / `canLeaveTeam` / `isLastOwner` |
| `web/src/features/teams/components/RoleChip.tsx` | New | 角色标签 |
| `web/src/features/teams/components/InviteMemberForm.tsx` | New | 邮箱邀请表单、局部错误、提交中状态 |
| `web/src/features/teams/components/MemberTable.tsx` | New | 成员表格、行内角色下拉、移除按钮、当前用户标记 |
| `web/src/features/teams/pages/TeamsPage.tsx` | New | 列表、搜索、空态、加载 / 错误 / 重试 |
| `web/src/features/teams/pages/TeamCreatePage.tsx` | New | 新建表单、校验、成功跳详情 |
| `web/src/features/teams/pages/TeamDetailPage.tsx` | New | 详情、邀请、改角色、移除 / 退出、确认弹窗 |
| `web/src/features/teams/useTeamMembers.ts` | Edit | 复用统一的错误文案映射 |
| `web/src/shared/api/error-message.ts` | New | `toErrorMessage`：`ApiError` 用后端中文 message，网络错误统一中文兜底 |
| `web/src/app/App.tsx` | Edit | 三条 `/teams` 路由 |
| `web/src/shared/layout/AdminShell.tsx` | Edit | 顶栏团队标题 |
| `web/src/shared/layout/Sidebar.tsx` | Edit | 导航加「团队」（桌面 + 移动共用） |
| `web/src/features/tasks/pages/TaskCreatePage.tsx` | Edit | `teamsApi.list()` → `teamsApi.listAll()`；团队加载错误改用 `toErrorMessage` |
| `.claude/agents/reviewer.md` | Edit | 沉淀「需求符合性」两条清单；建议与功能改动分开提交 |
| `README.md` | Edit | 前端进度补团队页面，删除「前端没有团队相关页面」的缺口描述 |
| `docs/specs/web-teams.md` | New | 本 spec |

## 风险与回滚

- **只改前端，无 schema / 迁移 / 后端风险。** 最坏情况是页面报错或路由 404，不影响已有任务与评论功能。
- **路由与标题是接线重点**：`/teams/new` 必须写在 `/teams/:teamId` 前面，`AdminShell.getViewTitle` 的 fallback 不能被团队路径误命中成「任务详情」。
- **`teamsApi.listAll` 的循环必须有终止条件**（返回空页或已取够 `total`），否则会在后端异常时无限请求；实现直接沿用 `tasksApi.listAll` 的写法。
- **最后 OWNER 的前端禁用不能替代后端**：即使快照过期或前端 bug，后端 409 仍是最终结果，页面必须展示该 message。
- **回滚**：删除 `web/src/features/teams/pages|components|constants|permissions`、还原 `App.tsx` / `AdminShell.tsx` / `Sidebar.tsx` / `TaskCreatePage.tsx` / `README.md` 即可；后端与数据库零改动。
