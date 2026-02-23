/**
 * Minecraft 网关主入口文件
 *
 * 功能概述：
 * - 连接到主服务器的信令服务器
 * - 监听 Minecraft 游戏服务器的 WebSocket 连接
 * - 转发游戏内玩家位置更新到主服务器
 * - 接收主服务器的命令并发送到游戏内
 * - 处理优雅关闭
 */

const { readConfig } = require('./config');
const { SignalingBridge } = require('./signalingBridge');
const { McGateway } = require('./mcGateway');

// 读取配置
const config = readConfig();

/**
 * 创建信令桥接器
 *
 * 负责与主服务器的 WebSocket 连接，用于：
 * - 发送玩家位置更新
 * - 接收游戏内命令
 */
const bridge = new SignalingBridge({
  signalingUrl: config.signalingUrl,
  token: config.mcToken,
  debug: config.debug,
});

/**
 * 创建 Minecraft 网关
 *
 * 负责监听 Minecraft 游戏服务器的 WebSocket 连接，用于：
 * - 接收玩家位置更新
 * - 发送游戏内命令
 */
const mc = new McGateway({
  port: config.port,
  debug: config.debug,
  // 当接收到玩家位置更新时，转发到信令桥接器
  onPlayerTransform: (payload) => bridge.sendPositionUpdate(payload),
});

/**
 * 监听来自主服务器的游戏内命令
 *
 * 当主服务器需要向游戏内发送命令（如 tell 命令）时，
 * 通过此事件接收并转发到 Minecraft 游戏服务器。
 */
bridge.on('mcCommand', ({ commandLine, originType }) => {
  const ok = mc.sendCommand({ commandLine, originType });
  if (config.debug) console.log(`[mc.command] ${ok ? 'sent' : 'failed'}: ${commandLine}`);
});

// 启动信令桥接器和 Minecraft 网关
bridge.start();
mc.start();

/**
 * 处理优雅关闭
 *
 * 当收到 SIGINT 信号（Ctrl+C）时，停止所有服务并退出进程。
 */
process.on('SIGINT', () => {
  console.log('Shutting down...');
  try {
    bridge.stop();
    mc.stop();
  } finally {
    process.exit(0);
  }
});

