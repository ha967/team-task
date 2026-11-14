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
