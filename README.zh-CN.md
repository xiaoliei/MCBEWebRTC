# MCBE WebRTC 距离语音

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

基于 WebRTC 的**我的世界基岩版（Minecraft Bedrock Edition）**距离语音通信系统。

在同一 Minecraft 世界中的玩家可以根据游戏内的距离听到彼此的声音。距离越近，声音越大——就像真实世界一样。

## 功能特性

- **距离语音通话** — WebRTC 点对点音频，通话半径可配置
- **游戏内位置追踪** — 通过 Minecraft WebSocket 实时更新位置
- **JWT 鉴权** — 安全的玩家验证，支持两种模式：
  - **Tell 验证**：服务器通过 `/tell` 向你的游戏内聊天发送验证码
  - **手动验证**：复制验证码并在游戏聊天中发送
- **同名保护** — 防止身份冒用，支持强制替换
- **模块化架构** — 独立的后端、前端、MC 网关和共享包

## 系统架构

```
┌─────────────┐     WebSocket      ┌─────────┐    Socket.IO     ┌─────────┐    Socket.IO    ┌──────────┐
│   我的世界    │ ◄──────────────► │  mcwss  │ ◄─────────────► │ backend │ ◄────────────► │ frontend │
│   基岩版     │   /connect       │ (网关)   │                 │ (服务端) │                 │ (浏览器) │
└─────────────┘                   └─────────┘                 └─────────┘                 └──────────┘
                                        │                           │                          │
                                 位置更新上报                信令中继                  WebRTC P2P 音频
                                 (PlayerTransform)         + 邻近计算                 (麦克风 → 耳机)
```

**数据流：**
1. MC 客户端通过 WebSocket 将 `PlayerTransform` 事件发送到 `mcwss` 网关
2. `mcwss` 通过 Socket.IO 将位置转发到 `backend`
3. `backend` 计算邻近玩家并中继 WebRTC 信令
4. `frontend` 与邻近玩家建立 P2P 音频连接

## 项目结构

```
MCBEWebRTC/
├── backend/      # 信令服务端（Express + Socket.IO）
├── frontend/     # 浏览器客户端（React + Vite + WebRTC）
├── mcwss/        # Minecraft WebSocket 网关（ws + Socket.IO client）
├── shared/       # 共享 TypeScript 类型定义
└── demo/         # 旧版参考实现（已弃用）
```

## 前置要求

- **Node.js** >= 18
- **npm** >= 9
- **我的世界基岩版**（需启用 WebSocket 连接功能）

## 快速开始

### 1. 克隆并安装

```bash
git clone https://github.com/<your-username>/MCBEWebRTC.git
cd MCBEWebRTC

# 安装各子包依赖
cd backend && npm install && cd ..
cd mcwss && npm install && cd ..
cd frontend && npm install && cd ..
cd shared && npm install && cd ..
```

### 2. 配置环境变量

```bash
# 后端
cd backend
cp .env.example .env
# 编辑 .env — 将 BRIDGE_JWT_SECRET 和 PLAYER_JWT_SECRET 设置为强随机字符串

# MC 网关
cd ../mcwss
cp .env.example .env
# 编辑 .env — 设置 BRIDGE_JWT_SECRET（必须与后端一致）
```

**重要：** `backend/.env` 和 `mcwss/.env` 中的 `BRIDGE_JWT_SECRET` 必须保持一致。

### 3. 启动服务

**开发模式**（支持热重载）：

```bash
# 终端 1：后端
cd backend && npm run dev

# 终端 2：MC 网关
cd mcwss && npm run dev

# 终端 3：前端（可选）
cd frontend && npm run dev
```

**生产模式：**

```bash
cd shared && npm run build
cd backend && npm run build && npm run start
cd mcwss && npm run build && npm run start
cd frontend && npm run build  # 静态文件输出到 frontend/dist/
```

**Docker 部署：**

```bash
# 开发环境（支持热重载）
docker compose up --build

# 生产环境
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 生产环境停止
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

> 使用 Docker 时，仍需在各子包目录准备 `.env` 文件（参考上方"配置环境变量"步骤）。
> 确保 `backend/.env` 和 `mcwss/.env` 中的 `BRIDGE_JWT_SECRET` 一致。

### 4. 在 Minecraft 中连接

在我的世界基岩版中，启用 WebSocket 并连接到网关：

```
/connect localhost:8000
```

在浏览器中打开 `http://localhost:5173`，输入你的玩家昵称，完成验证后即可开始语音通话！

## 配置说明

### 后端环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | HTTP 服务端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `BRIDGE_JWT_SECRET` | *(必填)* | 网关 JWT 签名密钥 |
| `JWT_EXPIRES_IN` | `2h` | 网关 JWT 有效期 |
| `PLAYER_JWT_SECRET` | *(必填)* | 玩家会话 JWT 密钥 |
| `PLAYER_JWT_EXPIRES_IN` | `24h` | 玩家 JWT 有效期 |
| `ICE_SERVERS` | Google STUN | WebRTC ICE 服务器（JSON 数组） |
| `CALL_RADIUS` | `16` | 语音通话半径（方块） |
| `AUTH_VERIFICATION_ENABLED` | `true` | 是否启用玩家验证 |
| `AUTH_TELL_ENABLED` | `true` | 是否启用 Tell 验证 |
| `AUTH_MANUAL_ENABLED` | `true` | 是否启用手动验证 |

### MC 网关环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BACKEND_URL` | `http://127.0.0.1:3000` | 后端服务地址 |
| `BRIDGE_JWT_SECRET` | *(必填)* | 必须与后端一致 |
| `JWT_EXPIRES_IN` | `2h` | 网关 JWT 有效期 |
| `GATEWAY_PORT` | `8000` | MC WebSocket 监听端口 |
| `DEBUG` | `false` | 调试日志开关 |

### 前端环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VITE_BACKEND_URL` | *(空)* | 显式后端地址。留空则使用 Vite 代理 |

## 开发

### 运行测试

```bash
cd backend && npm test
cd mcwss && npm test
cd frontend && npm test
cd shared && npm test
```

### 代码规范

```bash
cd frontend && npm run lint
cd mcwss && npm run lint
```

本项目使用 **ESLint** + **Prettier** 进行代码格式化。

## 常见问题

### 网关无法连接到后端

1. 确认后端正在运行：`curl http://localhost:3000/healthz`
2. 检查两个 `.env` 文件中的 `BRIDGE_JWT_SECRET` 是否一致
3. 确认 `mcwss/.env` 中的 `BACKEND_URL` 配置正确

### 环境变量未生效

确保 `.env` 文件位于正确的子包目录中（`backend/.env`、`mcwss/.env`）。

### 端口被占用

在 `.env` 中修改端口配置：
- 后端：`PORT=3001`
- MC 网关：`GATEWAY_PORT=8001`

### WebRTC 音频无法跨网络使用

在 `backend/.env` 中配置 TURN 服务器：

```bash
ICE_SERVERS=[{"urls":"turn:your-turn-server.com:3478","username":"user","credential":"pass"}]
```

## 技术栈

| 子包 | 技术栈 |
|------|--------|
| **后端** | Node.js、Express 5、Socket.IO 4、TypeScript |
| **MC 网关** | Node.js、ws、Socket.IO client、TypeScript |
| **前端** | React 19、Vite 7、Socket.IO client、WebRTC、TypeScript |
| **共享模块** | TypeScript 类型定义 |
| **测试** | Vitest |

## 参与贡献

请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解贡献指南。

## 许可证

[MIT](./LICENSE) © 小礼
