# @mcbewss/backend

后端服务（Express + Socket.io），提供信令服务和 HTTP API。

## 开发

```bash
npm install
npm run dev
```

默认监听：`http://0.0.0.0:3000`

## 构建与启动

```bash
npm run build
npm run start
```

## 环境变量

创建 `.env` 文件（可参考 `.env.example`）：

- `PORT`：HTTP 服务器端口（默认 `3000`）
- `HOST`：监听地址（默认 `0.0.0.0`）
- `BRIDGE_JWT_SECRET`：网关 JWT 签名密钥（必须配置，不能使用占位符）
- `JWT_EXPIRES_IN`：网关 JWT 有效期（默认 `2h`，示例：`30m`/`2h`/`1d`）
- `ICE_SERVERS`：WebRTC ICE 服务器配置（JSON 数组格式，默认使用 Google STUN）

### 环境变量示例

```bash
PORT=3000
HOST=0.0.0.0
BRIDGE_JWT_SECRET=your-secure-random-token-here
JWT_EXPIRES_IN=2h
ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]
```

## 测试

```bash
npm test
```
