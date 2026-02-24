/**
 * WebSocket 信令服务器模块
 *
 * 功能概述：
 * - 处理客户端 WebSocket 连接和认证
 * - 处理 Minecraft 网关连接和认证
 * - 转发 WebRTC 信令消息（offer/answer/candidate）
 * - 接收并更新游戏内玩家位置
 * - 向游戏内发送命令（如 tell 命令）
 * - 处理重复玩家名称的重连验证
 */

const { Server: WebSocketServer, WebSocket } = require("ws");
const { safeSend, tryParseJson } = require("../utils/wsJson");
const { randomDigits } = require("../utils/randomCode");

/**
 * 附加信令服务器到 HTTP 服务器
 *
 * @param {Object} params - 配置参数
 * @param {http.Server} params.httpServer - HTTP 服务器实例
 * @param {string} params.wsPath - WebSocket 路径
 * @param {State} params.state - 全局状态实例
 * @param {Object} params.config - 配置对象
 * @returns {WebSocketServer} WebSocket 服务器实例
 */
function attachSignalingServer({ httpServer, wsPath, state, config }) {
  // 创建 WebSocket 服务器
  const wss = new WebSocketServer({ server: httpServer, path: wsPath });

  /**
   * 检查 socket 是否为 Minecraft 网关连接
   *
   * @param {WebSocket} socket - WebSocket 连接
   * @returns {boolean} 是否为网关连接
   */
  function requireMcBridge(socket) {
    return socket && socket.__role === "mc-bridge";
  }

  /**
   * 向游戏内玩家发送 tell 命令
   *
   * @param {string} playerName - 玩家名称
   * @param {string} message - 消息内容
   * @returns {boolean} 是否发送成功
   */
  function sendTellToPlayer(playerName, message) {
    if (!state.mcBridgeSocket) return false;
    const commandLine = `tell "${playerName}" ${message}`;
    return safeSend(state.mcBridgeSocket, {
      type: "mc.command",
      data: {
        commandLine,
        originType: "player",
      },
    });
  }

  /**
   * 关闭客户端会话
   *
   * @param {string} sessionId - 会话 ID
   * @param {number} code - 关闭码
   * @param {string} reason - 关闭原因
   */
  function closeClientSession(sessionId, code, reason) {
    const session = state.getClientSessionById(sessionId);
    if (!session) return;
    try {
      session.socket.close(code, reason);
    } catch {
      // ignore
    }
    state.removeClientSession(sessionId);
  }

  // 处理新的 WebSocket 连接
  wss.on("connection", (socket) => {
    // 初始化 socket 角色
    socket.__role = "unknown";
    socket.__sessionId = null;

    // 处理接收到的消息
    socket.on("message", (raw) => {
      const parsed = tryParseJson(raw.toString());
      if (!parsed.ok) return;
      const msg = parsed.value || {};

      // 根据消息类型分发处理
      switch (msg.type) {
        /**
         * Minecraft 网关认证
         *
         * 网关连接需要提供正确的 token 才能通过认证。
         * 认证成功后，socket 角色设置为 'mc-bridge'。
         */
        case "authenticate": {
          const token = String(msg?.token || "");
          if (config.mcToken && token !== config.mcToken) {
            safeSend(socket, { type: "authRejected" });
            socket.close(1008, "auth rejected");
            return;
          }
          socket.__role = "mc-bridge";
          state.setMcBridge(socket);
          safeSend(socket, { type: "authAccepted" });
          return;
        }

        /**
         * 玩家位置更新
         *
         * 由 Minecraft 网关发送，更新游戏内玩家的位置和维度信息。
         */
        case "positionUpdate": {
          if (!requireMcBridge(socket)) return;
          const now = Date.now();
          state.upsertGamePlayer({
            playerName: msg.playerName,
            playerId: msg.playerId,
            position: msg.position,
            dim: msg.dim,
            now,
          });
          return;
        }

        /**
         * 客户端连接请求
         *
         * 客户端使用玩家名称连接服务器。
         * 如果玩家名称已存在，需要提供验证码才能重连。
         */
        case "connect": {
          if (socket.__role !== "unknown") return;
          const playerName = String(msg?.playerName || "").trim();
          const code = String(msg?.code || "").trim();
          if (!playerName) {
            safeSend(socket, {
              type: "connectDenied",
              reason: "missingPlayerName",
            });
            return;
          }

          // 检查是否已存在同名会话
          const existingSessionId = state.getClientSessionIdByName(playerName);
          const now = Date.now();

          if (existingSessionId) {
            // 尝试验证重连码
            const ok = code
              ? state.consumeReconnectCode(playerName, code, now)
              : false;
            if (!ok) {
              // 生成新的验证码并发送到游戏内
              const newCode = randomDigits(6);
              state.setReconnectCode(
                playerName,
                newCode,
                now + config.reconnectCodeTtlMs,
              );

              const told = sendTellToPlayer(playerName, newCode);
              safeSend(socket, {
                type: "connectDenied",
                reason: "duplicateName",
                needVerification: true,
                toldInGame: told,
                hint: "请关闭旧连接，或在输入框使用 玩家名#校验码 重连",
              });
              return;
            }

            // 验证成功，关闭旧连接
            closeClientSession(existingSessionId, 4000, "reconnected");
          }

          // 创建新会话
          socket.__role = "client";
          const session = state.createClientSession({ playerName, socket });
          socket.__sessionId = session.sessionId;
          safeSend(socket, {
            type: "connected",
            data: {
              sessionId: session.sessionId,
              playerName: session.playerName,
            },
          });
          return;
        }

        /**
         * WebRTC 信令消息
         *
         * 转发 WebRTC 的 offer、answer 和 candidate 消息到目标客户端。
         */
        case "webrtc.offer":
        case "webrtc.answer":
        case "webrtc.candidate": {
          if (socket.__role !== "client" || !socket.__sessionId) return;
          const fromSessionId = socket.__sessionId;
          const fromSession = state.getClientSessionById(fromSessionId);
          const targetSessionId = String(msg?.data?.targetSessionId || "");
          const target = state.getClientSessionById(targetSessionId);
          if (!fromSession || !target) return;

          safeSend(target.socket, {
            type: msg.type,
            data: {
              fromSessionId,
              fromPlayerName: fromSession.playerName,
              payload: msg?.data?.payload,
            },
          });
          return;
        }

        /**
         * 获取所有在线玩家列表
         *
         * 返回所有在线客户端及其对应的游戏玩家数据。
         */
        case "getAllPlayers": {
          if (socket.__role !== "client") return;
          const sessions = state.listOnlineClientSessions().map((s) => ({
            sessionId: s.sessionId,
            playerName: s.playerName,
            position:
              state.gamePlayersByName.get(s.playerName)?.position || null,
            dim: state.gamePlayersByName.get(s.playerName)?.dim ?? null,
          }));
          safeSend(socket, { type: "allPlayers", data: sessions });
          return;
        }

        default:
          return;
      }
    });

    // 处理连接关闭
    socket.on("close", () => {
      state.clearMcBridge(socket);
      if (socket.__role === "client" && socket.__sessionId) {
        state.removeClientSession(socket.__sessionId);
      }
    });

    // 处理连接错误
    socket.on("error", () => {
      // ignore
    });
  });

  /**
   * 心跳定时器
   *
   * 每 15 秒向所有连接发送 ping，检测死连接。
   */
  const heartbeatTimer = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      try {
        socket.ping();
      } catch {
        // ignore
      }
    }
  }, 15_000);

  // 服务器关闭时清理定时器
  wss.on("close", () => clearInterval(heartbeatTimer));
  return wss;
}

module.exports = {
  attachSignalingServer,
};
