定位：一个支持用户注册登录、创建项目、在项目下管理任务的 RESTful API 服务。不包含前端界面，用 Postman/Apifox 或 curl 调通即可。

技术栈：NestJS + TypeScript + PostgreSQL + TypeORM（或 Prisma）+ JWT + class-validator + Jest

一、功能需求清单

1. 用户模块（User）
   接口 方法 说明
   /auth/register POST 注册，接收用户名、邮箱、密码；密码用 bcrypt 哈希后入库
   /auth/login POST 登录，校验密码后签发 JWT，返回 access_token
   /users/me GET 获取当前登录用户信息（需 JWT 守卫保护）
   要求：

邮箱唯一，重复注册返回 409。

密码强度做基本校验（长度 ≥ 8），用 DTO + class-validator 实现。

返回用户信息时不能包含密码哈希字段（练习用拦截器或序列化排除敏感字段）。

2. 项目模块（Project）
   接口 方法 说明
   /projects POST 创建项目，自动把当前用户设为所有者
   /projects GET 获取当前用户参与的所有项目列表
   /projects/:id GET 获取项目详情（仅成员可访问）
   /projects/:id PATCH 更新项目名称/描述（仅所有者）
   /projects/:id DELETE 删除项目（仅所有者，级联删除任务）
   要求：

项目与用户是多对多关系（成员表），创建者自动成为成员且角色为 owner。

非成员访问项目详情返回 403，项目不存在返回 404。

权限判断用守卫实现，不要散落在 Service 里。

3. 任务模块（Task）
   接口 方法 说明
   /projects/:projectId/tasks POST 在项目下创建任务
   /projects/:projectId/tasks GET 获取项目下任务列表，支持按状态筛选、分页
   /tasks/:id GET 获取任务详情
   /tasks/:id PATCH 更新任务（标题、描述、状态、指派人）
   /tasks/:id DELETE 删除任务（仅任务创建者或项目所有者）
   任务字段：标题、描述、状态（todo / in_progress / done）、优先级（low / medium / high）、指派人（可选，必须是项目成员）、截止日期（可选）。

要求：

状态和优先级用枚举（enum）约束，非法值在 DTO 层就被拦截。

指派人必须是该项目成员，否则返回 400。

列表接口实现分页（page、pageSize 查询参数）和状态筛选，返回 { data, total, page, pageSize } 结构。

用拦截器统一包装所有成功响应格式，比如 { code: 0, data: ..., message: 'ok' }。

4. 全局能力
   全局异常过滤器：把 NestJS 抛出的异常统一成 { code, message, timestamp, path } 格式，避免默认错误结构外泄堆栈。

全局 ValidationPipe：开启 whitelist 和 forbidNonWhitelisted，自动剔除/拒绝 DTO 之外的字段。

环境变量：数据库连接、JWT 密钥、过期时间走 .env，用 @nestjs/config 加载，不硬编码。

日志：用 NestJS 内置 Logger 在关键操作（登录、创建项目、删除任务）打日志。
