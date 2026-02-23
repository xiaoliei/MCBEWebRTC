/**
 * MCBEWSS 主服务器入口文件
 *
 * 功能概述：
 * - 提供 HTTP 静态文件服务（前端页面）
 * - 提供 ICE 服务器配置 API（用于 WebRTC 连接）
 * - 启动 WebSocket 信令服务器（处理客户端连接和 WebRTC 信令）
 * - 启动邻近服务（检测玩家之间的距离并推送附近玩家列表）
 */

const path = require('path');
const http = require('http');
const express = require('express');

// 导入配置模块
const { readConfig } = require('./config');
// 导入 ICE 服务器配置（用于 WebRTC NAT 穿透）
const { getIceServersFromEnv } = require('./http/iceConfig');
// 导入状态管理类（管理游戏玩家和客户端会话）
const { State } = require('./domain/state');
// 导入邻近服务（检测玩家距离）
const { startProximityService } = require('./domain/proximityService');
// 导入信令服务器（处理 WebSocket 连接和 WebRTC 信令）
const { attachSignalingServer } = require('./signaling/signalingServer');

// 读取配置
const config = readConfig();
// 创建全局状态实例
const state = new State();

// 创建 Express 应用
const app = express();
// 提供静态文件服务（前端页面）
app.use(express.static(path.join(__dirname, 'public')));

/**
 * ICE 服务器配置 API
 *
 * 客户端通过此接口获取 STUN/TURN 服务器配置，
 * 用于 WebRTC 连接的 NAT 穿透
 */
app.get('/api/ice', (_req, res) => {
  res.json({ iceServers: getIceServersFromEnv() });
});

// 创建 HTTP 服务器
const httpServer = http.createServer(app);
// 启动 HTTP 服务器监听
httpServer.listen(config.appPort, () => {
  console.log(`Server started: http://localhost:${config.appPort}/`);
});

/**
 * 附加信令服务器
 *
 * 在 HTTP 服务器上附加 WebSocket 服务，处理：
 * - 客户端连接认证
 * - Minecraft 网关连接认证
 * - WebRTC 信令交换（offer/answer/candidate）
 * - 玩家位置更新
 */
attachSignalingServer({
  httpServer,
  wsPath: config.wsPath,
  state,
  config,
});

/**
 * 启动邻近服务
 *
 * 定期检测玩家之间的距离，向每个客户端推送附近玩家列表。
 * 只有在指定半径内的玩家才会被推送到客户端。
 */
startProximityService({
  state,
  callRadius: config.callRadius,          // 通话半径（方块距离）
  tickMs: config.proximityTickMs,         // 检测间隔（毫秒）
  gamePlayerTtlMs: config.gamePlayerTtlMs, // 玩家数据过期时间（毫秒）
  debug: config.debug,
});

