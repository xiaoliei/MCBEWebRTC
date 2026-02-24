/**
 * 邻近服务模块
 *
 * 功能概述：
 * - 定期检测游戏内玩家之间的距离
 * - 向每个客户端推送附近玩家列表（在通话半径内的玩家）
 * - 只推送有变化的附近玩家列表，减少网络传输
 * - 自动清理过期的玩家数据
 */

const { safeSend } = require("../utils/wsJson");

/**
 * 计算两点之间的平方距离
 *
 * 使用平方距离避免开方运算，提高性能。
 *
 * @param {Object} a - 第一个坐标点 {x, y, z}
 * @param {Object} b - 第二个坐标点 {x, y, z}
 * @returns {number} 两点之间的平方距离
 */
function distanceSquared(a, b) {
  const dx = (a?.x || 0) - (b?.x || 0);
  const dy = (a?.y || 0) - (b?.y || 0);
  const dz = (a?.z || 0) - (b?.z || 0);
  return dx * dx + dy * dy + dz * dz;
}

/**
 * 启动邻近服务
 *
 * 该服务会定期执行以下操作：
 * 1. 清理过期的游戏玩家数据
 * 2. 遍历所有在线客户端会话
 * 3. 计算每个玩家附近的其他玩家（在通话半径内且在同一维度）
 * 4. 向客户端推送附近玩家列表（仅当列表发生变化时）
 *
 * @param {Object} params - 配置参数
 * @param {State} params.state - 全局状态实例
 * @param {number} params.callRadius - 通话半径（方块距离）
 * @param {number} params.tickMs - 检测间隔（毫秒）
 * @param {number} params.gamePlayerTtlMs - 玩家数据过期时间（毫秒）
 * @param {boolean} params.debug - 是否启用调试日志
 * @returns {Function} 停止服务的函数
 */
function startProximityService({
  state,
  callRadius,
  tickMs,
  gamePlayerTtlMs,
  debug,
}) {
  // 预计算半径的平方，避免在循环中重复计算
  const radius2 = callRadius * callRadius;
  // 记录每个会话上次发送的附近玩家列表的 key，用于判断是否需要更新
  const lastSentKeyBySessionId = new Map(); // sessionId -> string

  // 定时执行邻近检测
  const timer = setInterval(() => {
    const now = Date.now();
    // 清理过期的游戏玩家数据
    state.pruneGamePlayers({ ttlMs: gamePlayerTtlMs, now });

    // 获取所有在线客户端会话
    const sessions = state.listOnlineClientSessions();

    // 遍历每个会话，计算其附近玩家
    for (const session of sessions) {
      // 获取当前会话对应的游戏玩家数据
      const selfPlayer = state.gamePlayersByName.get(session.playerName);

      // 如果玩家数据不存在，发送空列表
      if (!selfPlayer) {
        const key = "";
        // 只有当上次发送的 key 不同时才发送，避免重复推送
        if (lastSentKeyBySessionId.get(session.sessionId) !== key) {
          lastSentKeyBySessionId.set(session.sessionId, key);
          safeSend(session.socket, { type: "nearbyPlayers", data: [] });
        }
        continue;
      }

      // 收集附近玩家列表
      const nearby = [];
      for (const other of sessions) {
        // 跳过自己
        if (other.sessionId === session.sessionId) continue;

        // 获取其他玩家的游戏数据
        const otherPlayer = state.gamePlayersByName.get(other.playerName);
        if (!otherPlayer) continue;

        // 只在同一维度的玩家之间建立连接
        if (
          selfPlayer.dim != null &&
          otherPlayer.dim != null &&
          selfPlayer.dim !== otherPlayer.dim
        )
          continue;

        // 检查距离是否在通话半径内
        if (
          distanceSquared(selfPlayer.position, otherPlayer.position) > radius2
        )
          continue;

        // 添加到附近玩家列表
        nearby.push({
          sessionId: other.sessionId,
          playerName: other.playerName,
          position: otherPlayer.position,
          dim: otherPlayer.dim,
        });
      }

      // 按 sessionId 排序，确保列表顺序一致
      nearby.sort((a, b) => a.sessionId.localeCompare(b.sessionId));

      // 生成列表的唯一标识 key（用 sessionId 拼接）
      const key = nearby.map((p) => p.sessionId).join(",");

      // 如果列表未变化，跳过发送
      if (lastSentKeyBySessionId.get(session.sessionId) === key) continue;

      // 更新上次发送的 key
      lastSentKeyBySessionId.set(session.sessionId, key);

      // 输出调试日志
      if (debug)
        console.log(
          `[nearby] ${session.playerName}(${session.sessionId}) => ${key}`,
        );

      // 向客户端推送附近玩家列表
      safeSend(session.socket, { type: "nearbyPlayers", data: nearby });
    }
  }, tickMs);

  // 返回停止函数
  return () => clearInterval(timer);
}

module.exports = {
  startProximityService,
};
