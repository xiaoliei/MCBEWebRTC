/**
 * 信令桥接器类
 *
 * 功能概述：
 * - 连接到主服务器的 WebSocket 信令服务器
 * - 发送玩家位置更新到主服务器
 * - 接收来自主服务器的游戏内命令
 * - 自动重连机制（指数退避）
 * - 发出连接状态事件
 */

const EventEmitter = require("events");
const { WebSocket } = require("ws");

class SignalingBridge extends EventEmitter {
  /**
   * 构造函数
   *
   * @param {Object} params - 配置参数
   * @param {string} params.signalingUrl - 主服务器 WebSocket URL
   * @param {string} params.token - 认证令牌
   * @param {boolean} params.debug - 是否启用调试日志
   */
  constructor({ signalingUrl, token, debug }) {
    super();
    this.signalingUrl = signalingUrl;
    this.token = token;
    this.debug = debug;

    this.socket = null; // WebSocket 连接实例
    this._stopped = false; // 是否已停止
    this._reconnectDelayMs = 500; // 重连延迟（毫秒）
    this._reconnectTimer = null; // 重连定时器
  }

  /**
   * 启动桥接器
   *
   * 开始连接到主服务器，并启用自动重连。
   */
  start() {
    this._stopped = false;
    this._connect();
  }

  /**
   * 停止桥接器
   *
   * 停止自动重连并关闭连接。
   */
  stop() {
    this._stopped = true;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
    }
  }

  /**
   * 发送玩家位置更新
   *
   * @param {Object} params - 位置更新参数
   * @param {string} params.playerName - 玩家名称
   * @param {string|null} params.playerId - 玩家唯一标识符
   * @param {Object} params.position - 玩家位置 {x, y, z}
   * @param {number|null} params.dim - 维度 ID
   * @returns {boolean} 是否发送成功
   */
  sendPositionUpdate({ playerName, playerId, position, dim }) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(
        JSON.stringify({
          type: "positionUpdate",
          playerName,
          playerId,
          position,
          dim,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 安排重连
   *
   * 使用指数退避算法安排重连，延迟时间从 500ms 开始，
   * 每次失败后乘以 1.5，最大不超过 5000ms。
   *
   * @private
   */
  _scheduleReconnect() {
    if (this._stopped) return;
    if (this._reconnectTimer) return;
    const delay = this._reconnectDelayMs;
    this._reconnectDelayMs = Math.min(
      5000,
      Math.floor(this._reconnectDelayMs * 1.5),
    );

    if (this.debug) console.log(`[bridge] reconnect in ${delay}ms`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connect();
    }, delay);
  }

  /**
   * 连接到主服务器
   *
   * @private
   */
  _connect() {
    if (this._stopped) return;

    if (this.debug) console.log(`[bridge] connecting: ${this.signalingUrl}`);
    const socket = new WebSocket(this.signalingUrl);
    this.socket = socket;

    // 连接成功
    socket.on("open", () => {
      this._reconnectDelayMs = 500; // 重置重连延迟
      if (this.debug) console.log("[bridge] connected");
      this._sendAuth(); // 发送认证
      this.emit("connected"); // 发出连接成功事件
    });

    // 接收消息
    socket.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      // 处理游戏内命令
      if (msg?.type === "mc.command") {
        const commandLine = msg?.data?.commandLine;
        const originType = msg?.data?.originType;
        if (commandLine) this.emit("mcCommand", { commandLine, originType });
      }
    });

    // 连接关闭
    socket.on("close", () => {
      if (this.debug) console.log("[bridge] disconnected");
      this.emit("disconnected"); // 发出断开连接事件
      this._scheduleReconnect(); // 安排重连
    });

    // 连接错误
    socket.on("error", (err) => {
      if (this.debug) console.log(`[bridge] error: ${err?.message || err}`);
    });
  }

  /**
   * 发送认证消息
   *
   * @private
   */
  _sendAuth() {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: "authenticate",
        token: this.token,
      }),
    );
  }
}

module.exports = {
  SignalingBridge,
};
