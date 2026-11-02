用户可以归属不同的团队，每个团队有不同的任务，可以在任务下评论
设计表
用户表 团队表 团队成员表 任务表 评论表

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
npx prisma studio # 浏览器里查看/编辑数据

# NestJs

NestJs中模块，控制器，提供者

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

## 模块

@Module注解声明这个类是一个模块，如下:
@Module({
imports: [PrismaModule], // 模块：把别的模块的"能力"接入当前模块.imports 数组中只能是模块（被 @Module() 装饰的类，或者它的动态模块对象），不能放 service、controller 或普通类。
controllers: [TasksController], // 控制器：路由层
providers: [TasksService], // 提供者：可被注入的类/工厂/值
exports: [TasksService], // 导出：允许别的模块注入这些 provider
})

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

一个请求进入 NestJS 后，大致流向是：中间件 → 守卫 → 拦截器 → 管道 → Controller。
这意味着，中间件是最早接触到请求的环节之一。也正因如此，它适合做那些“全局性”的预处理

守卫（Guards）：处理认证与授权。比如用 JWT 守卫保护需要登录的路由。

拦截器（Interceptors）：适合做响应格式统一、日志记录等

管道（Pipes）：做数据校验和转换。配合 class-validator 和 DTO（数据传输对象），在请求进入业务逻辑前就拦截掉非法参数。
