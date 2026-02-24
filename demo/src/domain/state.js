/**
 * 全局状态管理类
 *
 * 功能概述：
 * - 管理游戏内玩家数据（位置、维度等）
 * - 管理客户端 WebSocket 会话
 * - 管理 Minecraft 网关连接
 * - 管理重连验证码
 */

const { v4: uuidv4 } = require("uuid");

class State {
  constructor() {
    /**
     * 游戏玩家数据映射表
     * key: 玩家名称
     * value: { name, position, dim, playerId, lastSeenAt }
     * - position: {x, y, z} 玩家位置坐标
     * - dim: 维度 ID（如主世界、下界、末地）
     * - playerId: 玩家唯一标识符
     * - lastSeenAt: 最后更新时间戳
     */
    this.gamePlayersByName = new Map();

    /**
     * 客户端会话映射表（按 sessionId 索引）
     * key: 会话 ID（UUID）
     * value: { sessionId, playerName, socket, connectedAt }
     */
    this.clientSessionsById = new Map();

    /**
     * 客户端会话映射表（按玩家名称索引）
     * key: 玩家名称
     * value: 会话 ID（UUID）
     */
    this.clientSessionIdByName = new Map();

    /**
     * 待验证的重连码映射表
     * key: 玩家名称
     * value: { code, expiresAt }
     * - code: 6 位数字验证码
     * - expiresAt: 过期时间戳
     */
    this.pendingReconnectByName = new Map();

    /**
     * Minecraft 网关 WebSocket 连接
     * 用于接收游戏内玩家位置更新和发送游戏内命令
     */
    this.mcBridgeSocket = null;
  }

  /**
   * 更新或插入游戏玩家数据
   *
   * @param {Object} params - 参数对象
   * @param {string} params.playerName - 玩家名称
   * @param {Object} params.position - 玩家位置 {x, y, z}
   * @param {number|null} params.dim - 维度 ID
   * @param {string|null} params.playerId - 玩家唯一标识符
   * @param {number} params.now - 当前时间戳
   * @returns {Object|null} 更新后的玩家数据，如果玩家名称无效则返回 null
   */
  upsertGamePlayer({ playerName, position, dim, playerId, now }) {
    const name = String(playerName || "").trim();
    if (!name) return null;

    // 获取现有数据或创建新数据
    const current = this.gamePlayersByName.get(name) || {
      name,
      position: { x: 0, y: 0, z: 0 },
      dim: null,
      playerId: null,
      lastSeenAt: 0,
    };

    // 更新字段（只更新提供的字段）
    if (position && typeof position === "object") current.position = position;
    if (dim != null) current.dim = dim;
    if (playerId != null) current.playerId = playerId;
    current.lastSeenAt = now;

    this.gamePlayersByName.set(name, current);
    return current;
  }

  /**
   * 清理过期的游戏玩家数据
   *
   * 删除超过指定时间未更新的玩家数据。
   *
   * @param {Object} params - 参数对象
   * @param {number} params.ttlMs - 生存时间（毫秒）
   * @param {number} params.now - 当前时间戳
   */
  pruneGamePlayers({ ttlMs, now }) {
    for (const [name, player] of this.gamePlayersByName.entries()) {
      if (!player?.lastSeenAt) continue;
      if (now - player.lastSeenAt > ttlMs) this.gamePlayersByName.delete(name);
    }
  }

  /**
   * 设置 Minecraft 网关连接
   *
   * @param {WebSocket} socket - 已认证的网关 WebSocket 连接
   */
  setMcBridge(socket) {
    this.mcBridgeSocket = socket;
  }

  /**
   * 清除 Minecraft 网关连接
   *
   * @param {WebSocket} socket - 要清除的连接
   */
  clearMcBridge(socket) {
    if (this.mcBridgeSocket === socket) this.mcBridgeSocket = null;
  }

  /**
   * 创建客户端会话
   *
   * @param {Object} params - 参数对象
   * @param {string} params.playerName - 玩家名称
   * @param {WebSocket} params.socket - WebSocket 连接
   * @returns {Object|null} 创建的会话对象，如果玩家名称无效则返回 null
   */
  createClientSession({ playerName, socket }) {
    const name = String(playerName || "").trim();
    if (!name) return null;

    // 生成唯一的会话 ID
    const sessionId = uuidv4();
    const session = {
      sessionId,
      playerName: name,
      socket,
      connectedAt: Date.now(),
    };

    // 同时更新两个索引
    this.clientSessionsById.set(sessionId, session);
    this.clientSessionIdByName.set(name, sessionId);
    return session;
  }

  /**
   * 根据会话 ID 获取客户端会话
   *
   * @param {string} sessionId - 会话 ID
   * @returns {Object|null} 会话对象，如果不存在则返回 null
   */
  getClientSessionById(sessionId) {
    return this.clientSessionsById.get(sessionId) || null;
  }

  /**
   * 根据玩家名称获取会话 ID
   *
   * @param {string} playerName - 玩家名称
   * @returns {string|null} 会话 ID，如果不存在则返回 null
   */
  getClientSessionIdByName(playerName) {
    return (
      this.clientSessionIdByName.get(String(playerName || "").trim()) || null
    );
  }

  /**
   * 移除客户端会话
   *
   * @param {string} sessionId - 要移除的会话 ID
   */
  removeClientSession(sessionId) {
    const session = this.clientSessionsById.get(sessionId);
    if (!session) return;

    // 从主索引中删除
    this.clientSessionsById.delete(sessionId);

    // 从名称索引中删除（仅当匹配时）
    const name = session.playerName;
    if (this.clientSessionIdByName.get(name) === sessionId) {
      this.clientSessionIdByName.delete(name);
    }
  }

  /**
   * 列出所有在线客户端会话
   *
   * @returns {Array} 会话对象数组
   */
  listOnlineClientSessions() {
    return Array.from(this.clientSessionsById.values());
  }

  /**
   * 设置重连验证码
   *
   * 当检测到重复玩家名称时，生成验证码并发送到游戏内，
   * 玩家需要使用"玩家名#验证码"格式重连。
   *
   * @param {string} playerName - 玩家名称
   * @param {string} code - 6 位数字验证码
   * @param {number} expiresAt - 过期时间戳
   */
  setReconnectCode(playerName, code, expiresAt) {
    const name = String(playerName || "").trim();
    if (!name) return;
    this.pendingReconnectByName.set(name, { code, expiresAt });
  }

  /**
   * 消费重连验证码
   *
   * 验证验证码是否正确且未过期，验证成功后删除验证码。
   *
   * @param {string} playerName - 玩家名称
   * @param {string} code - 验证码
   * @param {number} now - 当前时间戳
   * @returns {boolean} 验证是否成功
   */
  consumeReconnectCode(playerName, code, now) {
    const name = String(playerName || "").trim();
    const item = this.pendingReconnectByName.get(name);
    if (!item) return false;

    // 检查是否过期
    if (now > item.expiresAt) {
      this.pendingReconnectByName.delete(name);
      return false;
    }

    // 检查验证码是否匹配
    if (String(code || "").trim() !== item.code) return false;

    // 验证成功，删除验证码
    this.pendingReconnectByName.delete(name);
    return true;
  }
}

module.exports = {
  State,
};
