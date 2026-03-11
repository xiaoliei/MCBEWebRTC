# @mcbewebrtc/mcwss

Minecraft WebSocket 网关（TypeScript + Socket.io client），负责将游戏侧 `PlayerTransform` 上报到 `backend`。

## 开发

```bash
npm install
npm run dev
```

默认监听：`ws://0.0.0.0:8000`

## 构建与启动

```bash
npm run build
npm run start
```

## 环境变量

- `BACKEND_URL`：后端地址（默认 `http://127.0.0.1:3000`）
- `BRIDGE_JWT_SECRET`：桥接 JWT 签名密钥（需与 backend 一致）
- `JWT_EXPIRES_IN`：桥接 JWT 有效期（默认 `2h`，示例：`30m`/`2h`/`1d`）
- `GATEWAY_PORT`：网关监听端口（默认 `8000`）
- `DEBUG`：调试日志开关（`true/false`）

可参考 `.env.example`。
