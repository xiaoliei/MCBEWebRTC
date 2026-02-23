/**
 * Minecraft 网关类
 *
 * 功能概述：
 * - 监听 Minecraft 游戏服务器的 WebSocket 连接
 * - 订阅玩家位置变化事件（PlayerTransform）
 * - 接收并转发玩家位置更新
 * - 向游戏内发送命令
 *
 * 注意：同一时间只允许一个 Minecraft 连接，新连接会替换旧连接。
 */

const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

class McGateway {
  /**
   * 构造函数
   *
   * @param {Object} params - 配置参数
   * @param {number} params.port - 监听端口
   * @param {boolean} params.debug - 是否启用调试日志
   * @param {Function} params.onPlayerTransform - 玩家位置更新回调函数
   */
  constructor({ port, debug, onPlayerTransform }) {
    this.port = port;
    this.debug = debug;
    this.onPlayerTransform = onPlayerTransform;

    this.wss = null;  // WebSocket 服务器实例
    this.mcSocket = null;  // 当前 Minecraft 连接
  }

  /**
   * 启动网关服务
   *
   * 创建 WebSocket 服务器并监听指定端口。
   */
  start() {
    this.wss = new WebSocketServer({ port: this.port });
    console.log(`listening on port: ${this.port}`);

    // 处理新的连接
    this.wss.on('connection', (socket) => {
      // 如果已有连接，关闭旧连接
      if (this.mcSocket && this.mcSocket !== socket) {
        try {
          this.mcSocket.close(4000, 'replaced');
        } catch {
          // ignore
        }
      }

      // 设置新连接
      this.mcSocket = socket;
      if (this.debug) console.log('[mc] connected');

      // 订阅玩家位置变化事件
      this._subscribePlayerTransform(socket);

      // 处理接收到的消息
      socket.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        // 只处理 PlayerTransform 事件
        if (msg?.header?.eventName !== 'PlayerTransform') return;
        
        // 提取玩家数据
        const player = msg?.body?.player;
        const playerName = player?.name;
        const position = player?.position;
        const dim = player?.dimension;
        const playerId = player?.uniqueId ?? player?.id ?? player?.runtimeId ?? null;

        // 验证必要字段
        if (!playerName || !position) return;
        
        // 触发回调函数
        if (this.onPlayerTransform) this.onPlayerTransform({ playerName, playerId, position, dim });
      });

      // 处理连接关闭
      socket.on('close', () => {
        if (this.mcSocket === socket) this.mcSocket = null;
        if (this.debug) console.log('[mc] disconnected');
      });

      // 处理连接错误
      socket.on('error', () => {
        // ignore
      });
    });
  }

  /**
   * 停止网关服务
   */
  stop() {
    try {
      this.wss?.close();
    } catch {
      // ignore
    }
    this.wss = null;
    this.mcSocket = null;
  }

  /**
   * 向游戏内发送命令
   *
   * @param {Object} params - 命令参数
   * @param {string} params.commandLine - 命令行（如 "tell player message"）
   * @param {string} params.originType - 命令来源类型（默认为 'player'）
   * @returns {boolean} 是否发送成功
   */
  sendCommand({ commandLine, originType = 'player' }) {
    const socket = this.mcSocket;
    if (!socket) return false;

    try {
      socket.send(
        JSON.stringify({
          body: {
            origin: { type: originType },
            commandLine,
            version: 1,
          },
          header: {
            requestId: uuidv4(),
            messagePurpose: 'commandRequest',
            version: 1,
            messageType: 'commandRequest',
          },
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 订阅玩家位置变化事件
   *
   * 向 Minecraft 游戏服务器发送订阅请求，
   * 以便接收玩家位置更新事件。
   *
   * @param {WebSocket} socket - WebSocket 连接
   * @private
   */
  _subscribePlayerTransform(socket) {
    socket.send(
      JSON.stringify({
        header: {
          version: 1,
          requestId: uuidv4(),
          messageType: 'commandRequest',
          messagePurpose: 'subscribe',
        },
        body: {
          eventName: 'PlayerTransform',
        },
      }),
    );
  }
}

module.exports = {
  McGateway,
};

