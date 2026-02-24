# WebRTCForMCBE

基于 WebRTC 的 Minecraft Bedrock Edition 距离语音通信系统。

## 项目结构

```
WebRTCForMCBE/
├── backend/          # 后端服务（Express + Socket.io）
├── mcwss/            # MC 网关（WebSocket 桥接）
├── frontend/         # 浏览器客户端（React）
├── shared/           # 共享类型定义
└── demo/             # 简陋实现（Node.js 示例）
```

## 快速开始

### 前置要求

- Node.js >= 18
- npm >= 9

### 1. 安装依赖

```bash
# 安装所有子包依赖
npm install
# 或分别安装
cd backend && npm install
cd mcwss && npm install
cd frontend && npm install
```

### 2. 配置环境变量

```bash
# Backend 配置
cd backend
cp .env.example .env
# 编辑 .env 文件，设置 BRIDGE_TOKEN 为强随机字符串

# MC 网关配置
cd ../mcwss
cp .env.example .env
# 编辑 .env 文件，确保 BRIDGE_TOKEN 与 backend 一致
```

**重要**：两个服务的 `BRIDGE_TOKEN` 必须保持一致，否则网关无法通过认证。

### 3. 启动服务

#### 开发模式（推荐）

使用开发模式可启用热重载和详细日志：

```bash
# 终端 1：启动后端服务
cd backend
npm run dev

# 终端 2：启动 MC 网关
cd mcwss
npm run dev

# 终端 3：启动前端（可选）
cd frontend
npm run dev
```

#### 生产模式

```bash
# 构建后端
cd backend
npm run build
npm run start

# 构建 MC 网关
cd mcwss
npm run build
npm run start
```

### 4. 访问服务

- **后端 API**：`http://localhost:3000`
- **MC 网关**：`ws://localhost:8000`
- **前端界面**：`http://localhost:5173`（Vite 开发服务器）

## 开发工作流

### 运行测试

```bash
# Backend 测试
cd backend && npm test

# MC 网关测试
cd mcwss && npm test
```

### 代码检查与格式化

```bash
# Backend
cd backend && npm run lint
cd backend && npm run format:fix

# MC 网关
cd mcwss && npm run lint
cd mcwss && npm run format:fix
```

## 架构说明

### 后端服务 (`backend/`)

提供 HTTP API 和 WebSocket 信令服务：

- **端口**：3000（可通过 `PORT` 环境变量配置）
- **主要功能**：
  - WebSocket 信令中继
  - 邻近玩家计算
  - ICE 服务器配置
  - 网关认证

**环境变量**：
- `PORT`：HTTP 服务器端口（默认 `3000`）
- `HOST`：监听地址（默认 `0.0.0.0`）
- `BRIDGE_TOKEN`：网关认证 token（必须配置）
- `ICE_SERVERS`：WebRTC ICE 服务器 JSON 配置

### MC 网关 (`mcwss/`)

桥接 Minecraft WebSocket 和后端信令服务：

- **端口**：8000（可通过 `GATEWAY_PORT` 环境变量配置）
- **主要功能**：
  - 接收 MC 的 `PlayerTransform` 事件
  - 上报到后端信令服务
  - 转发后端命令到 MC

**环境变量**：
- `BACKEND_URL`：后端服务地址（默认 `http://127.0.0.1:3000`）
- `BRIDGE_TOKEN`：网关认证 token（必须与 backend 一致）
- `GATEWAY_PORT`：网关监听端口（默认 `8000`）
- `DEBUG`：调试日志开关（默认 `false`）

### Demo 参考 (`demo/`)

可运行的 Node.js 示例，包含完整的端到端实现：

```bash
cd demo
npm install
npm run start        # 启动信令服务
npm run start:gateway  # 启动 MC 网关
```

访问 `http://localhost:3000` 查看演示界面。

## 故障排查

### 网关无法连接到后端

1. 检查后端服务是否运行：`curl http://localhost:3000`
2. 检查 `BRIDGE_TOKEN` 是否一致
3. 检查 `BACKEND_URL` 配置是否正确

### 环境变量未生效

确保 `.env` 文件位于正确的子包目录中（`backend/.env` 或 `mcwss/.env`）。

### 端口被占用

修改对应服务的 `.env` 文件中的端口配置：
- Backend: `PORT=3001`
- MC 网关: `GATEWAY_PORT=8001`

## 技术栈

- **Backend**: Node.js + Express + Socket.io + TypeScript
- **MC 网关**: Node.js + ws + Socket.io-client + TypeScript
- **Frontend**: React + Vite + TypeScript
- **共享模块**: TypeScript 类型定义
- **测试**: Vitest

## 开发规范

详见 [CLAUDE.md](./CLAUDE.md)。