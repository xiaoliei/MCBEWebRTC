# @mcbewss/frontend

Web 前端 MVP（React + TypeScript + Vite + socket.io-client）。

## 开发

```bash
npm install
npm run dev
```

默认地址：`http://localhost:5173/`

## 测试

```bash
npm test
```

## 构建

```bash
npm run build
```

## 联调（与后端）

在仓库根目录分别启动：

```bash
npm run dev --prefix backend
npm run dev --prefix mcwss
npm run dev --prefix frontend
```

### 模式A：Vite 代理（默认）

- 前端不配置 `VITE_BACKEND_URL`
- `frontend/vite.config.ts` 会将 `/api` 与 `/socket.io` 代理到 `http://127.0.0.1:3000`

### 模式B：显式后端地址

- 设置 `VITE_BACKEND_URL`，例如：`http://127.0.0.1:3000`
- 前端会直接连接 `${VITE_BACKEND_URL}/socket.io`，并请求 `${VITE_BACKEND_URL}/api/ice`

MVP 已覆盖：`join`、`presence:nearby`、`connect:denied(DUPLICATE_NAME)` 提示、`webrtc:*` 信令收发与状态跟踪、`/api/ice` 拉取与回退。
