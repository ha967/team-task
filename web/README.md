# web

团队任务看板的前端，Vite + React + TypeScript。

## 启动

在仓库根目录执行：

```bash
# 1. 起数据库
docker compose up -d

# 2. 同时启动后端和前端
npm run dev

# 或者分开启动
npm run dev:api   # Nest，http://localhost:3001
npm run dev:web   # Vite，默认 http://localhost:5173
```

后端端口由根目录 `.env` 的 `PORT` 决定（当前是 3001）。如果改了它，`web/vite.config.ts` 里代理的 `target` 也要同步修改。

如果 5173 被其他项目占用，Vite 会自动换端口；想固定端口可以：

```bash
npm run dev:web -- --port 5174 --strictPort
```

演示账号：`alice@example.com` / `Password123!`（来自 `prisma/seed.ts`）。

## 目录结构

```
web/src/
├─ app/                  # 应用装配：路由、全局样式
├─ features/             # 按业务域划分，和 src/ 下的 Nest 模块一一对应
│  ├─ auth/              # 登录、注册、会话恢复
│  └─ tasks/             # 任务列表
└─ shared/
   └─ api/http.ts        # fetch 封装：注入 token、401 自动刷新并重试
```

新增一个业务域时，在 `features/` 下建目录，内部放 `api.ts`、`types.ts`、`components/`、`pages/`。只有被两个以上 feature 复用的东西才上移到 `shared/`。

## 请求链路

```
组件 → features/*/api.ts → shared/api/http.ts → /api/*
                                        ↓
                              Vite 开发代理（vite.config.ts）
                                        ↓
                              http://localhost:3001/api/*
```

后端在 [src/main.ts](../src/main.ts) 里设置了全局前缀 `api`，所以所有接口都是 `/api/...`。开发环境走 Vite 代理，浏览器看到的是同源请求，因此后端不需要开 CORS。

## 登录状态

- `accessToken` 只放在内存里，页面刷新后丢失。
- `refreshToken` 放在 `localStorage`，刷新页面后用它自动换新的 access token。
- `shared/api/http.ts` 里做了两件事：
  - 请求自动带上 `Authorization: Bearer <accessToken>`；
  - 遇到 401 时，用 refresh token 换一次新令牌并重试原请求；多个请求同时 401 只会刷新一次（共享同一个 Promise）。
- 刷新失败会清空本地令牌，`ProtectedRoute` 自动跳转到 `/login`。

生产环境建议把 refresh token 改成 httpOnly cookie，并配合 CSRF 防护和同域部署；当前方案适合本地开发和学习。

## 环境变量

复制 `web/.env.example` 为 `web/.env.local` 可覆盖默认值。只有 `VITE_` 前缀的变量会被打包进浏览器，**不要在任何前端变量里放密钥**。
