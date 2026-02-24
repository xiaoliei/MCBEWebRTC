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
npm run dev --prefix frontend
```

MVP 已覆盖：`join`、`presence:nearby`、`connect:denied(DUPLICATE_NAME)` 提示、`webrtc:*` 信令收发与状态跟踪、`/api/ice` 拉取与回退。
