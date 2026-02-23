# MCBEWSS（MC WebSocket + WebRTC 距离语音）

## 运行
- 启动信令服务：`npm run start`（默认 `http://localhost:3000`，WS 路径 `/ws`）
- 启动 MC 网关：`npm run start:gateway`（默认监听 `8000`，游戏内用 `/connect localhost:8000`）

## 环境变量
- `APP_PORT`：信令 HTTP 端口（默认 `3000`）
- `WS_PATH`：信令 WS 路径（默认 `/ws`）
- `CALL_RADIUS`：附近判断半径（默认 `10`）
- `PROXIMITY_TICK_MS`：附近列表计算周期（默认 `250`）
- `GAME_PLAYER_TTL_MS`：位置数据过期时间（默认 `10000`）
- `MCBEWSS_TOKEN`：网关认证 token（建议设置；信令与网关需一致）

### TURN（跨公网/NAT 建议必配）
- `ICE_SERVERS_JSON`：直接传完整 ICE servers 数组 JSON（优先级最高）
- 或使用：
  - `STUN_URLS`：逗号分隔 STUN（默认 `stun:stun.l.google.com:19302`）
  - `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL`

## 同名重连（校验码）
- 若同名已在线，网页会被拒绝并提示。
- 若 MC 网关在线，服务端会尝试向游戏内发送校验码（`tell "<玩家名>" <校验码>`）。
- 重新连接时，在输入框使用：`玩家名#校验码`。

