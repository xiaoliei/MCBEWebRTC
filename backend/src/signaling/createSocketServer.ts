import type http from "node:http";
import { Server, type Socket } from "socket.io";
import { SessionStore } from "../domain/session/SessionStore.js";
import { startProximityService } from "../domain/proximity/startProximityService.js";
import { StateStore } from "../domain/state/StateStore.js";
import { handleBridgePositionUpdate } from "./handlers/bridgePosition.js";
import { handleClientJoin } from "./handlers/clientJoin.js";
import { handlePresenceListReq } from "./handlers/presence.js";
import { handleWebRtcRelay } from "./handlers/webrtcRelay.js";
import { authBridge } from "./middleware/authBridge.js";

export interface SocketServerOptions {
  bridgeJwtSecret: string;
  callRadius: number;
  tickMs: number;
  gamePlayerTtlMs: number;
}

export interface SocketServerStores {
  stateStore: StateStore;
  sessionStore: SessionStore;
}

interface ValidatePlayerTokenSuccess {
  ok: true;
  playerName: string;
  jti: string;
}

interface ValidatePlayerTokenFailure {
  ok: false;
  error: {
    code: "RATE_LIMITED" | "BRIDGE_UNAVAILABLE" | "INVALID_VERIFICATION" | "TOKEN_INVALID" | "TOKEN_MISSING" | "TOKEN_EXPIRED" | "TOKEN_REVOKED";
    message: string;
  };
}

type ValidatePlayerTokenResult = ValidatePlayerTokenSuccess | ValidatePlayerTokenFailure;

interface PlayerAuthServiceLike {
  validatePlayerToken: (token: string) => ValidatePlayerTokenResult;
}

export interface SocketServerAuthOptions {
  requirePlayerTokenAuth: boolean;
  playerAuthService: PlayerAuthServiceLike;
}

export interface BridgeAuthCoordinator {
  sendTellVerificationCode: (playerName: string, code: string) => Promise<boolean>;
  startManualWatch: (playerName: string, challenge: string) => Promise<boolean>;
  stopManualWatch: (playerName: string) => void;
  handleManualMatched: (playerName: string, challenge: string) => void;
}

export interface CreateSocketServerInput {
  httpServer: http.Server;
  options: SocketServerOptions;
  stores: SocketServerStores;
  auth?: SocketServerAuthOptions;
  bridgeAuthCoordinator?: BridgeAuthCoordinator;
}

export interface SocketServerOutput {
  io: Server;
  collectBridgeSockets: () => Socket[];
}

export function createSocketServer(input: CreateSocketServerInput): SocketServerOutput {
  const io = new Server(input.httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  const socketIdBySessionId = new Map<string, string>();
  const bridgeSockets = new Map<string, Socket>();

  const collectBridgeSockets = (): Socket[] => {
    return Array.from(io.sockets.sockets.values()).filter((candidate) => {
      const role = String(candidate.data.role ?? "").trim();
      return role === "mc-bridge";
    });
  };

  const stopProximityService = startProximityService({
    stateStore: input.stores.stateStore,
    sessionStore: input.stores.sessionStore,
    callRadius: input.options.callRadius,
    tickMs: input.options.tickMs,
    gamePlayerTtlMs: input.options.gamePlayerTtlMs,
    emitNearby: (sessionId, nearbyPlayers, myPosition) => {
      const targetSocketId = socketIdBySessionId.get(sessionId);
      if (!targetSocketId) {
        return;
      }
      io.to(targetSocketId).emit("presence:nearby", { players: nearbyPlayers, myPosition });
    },
  });

  if (input.bridgeAuthCoordinator) {
    // 中文注释：把鉴权桥接命令的发送能力挂到共享协调器对象上，HTTP 鉴权流程与 Socket.IO bridge 通道可复用同一能力。
    input.bridgeAuthCoordinator.sendTellVerificationCode = async (playerName, code) => {
      const targets = collectBridgeSockets();
      if (targets.length === 0) {
        return false;
      }

      for (const bridgeSocket of targets) {
        bridgeSocket.emit("bridge:auth:tell:send", {
          playerName,
          code,
        });
      }

      return true;
    };

    input.bridgeAuthCoordinator.startManualWatch = async (playerName, challenge) => {
      const targets = collectBridgeSockets();
      if (targets.length === 0) {
        return false;
      }

      for (const bridgeSocket of targets) {
        // 中文注释：同玩家重复发起 manual watch 时，先显式 stop 旧 watch，再启动新 watch，确保 bridge 侧状态可预测。
        bridgeSocket.emit("bridge:auth:manual:watch:stop", {
          playerName,
        });
        bridgeSocket.emit("bridge:auth:manual:watch:start", {
          playerName,
          challenge,
        });
      }

      return true;
    };

    input.bridgeAuthCoordinator.stopManualWatch = (playerName) => {
      const targets = collectBridgeSockets();
      for (const bridgeSocket of targets) {
        bridgeSocket.emit("bridge:auth:manual:watch:stop", {
          playerName,
        });
      }
    };
  }

  io.on("connection", (socket) => {
    const bridgeAuth = authBridge(socket, input.options.bridgeJwtSecret);
    if (bridgeAuth.isBridge) {
      if (!bridgeAuth.authorized) {
        socket.emit("auth:rejected", {
          reason: bridgeAuth.rejectReason ?? "UNAUTHORIZED",
        });
        socket.disconnect(true);
        return;
      }

      // 中文注释：把桥接网关身份写入 socket.data，便于后续链路追踪与审计。
      socket.data.gatewayId = bridgeAuth.gatewayId;
      socket.data.role = "mc-bridge";
      bridgeSockets.set(socket.id, socket);

      if (bridgeAuth.payload?.exp) {
        const expiresAt = new Date(bridgeAuth.payload.exp * 1000).toISOString();
        console.log(
          `[backend][bridge] authenticated gatewayId=${bridgeAuth.gatewayId ?? "unknown"} expiresAt=${expiresAt}`,
        );
      }

      socket.emit("auth:accepted");
      socket.on("bridge:position:update", (payload) => {
        handleBridgePositionUpdate(payload, {
          stateStore: input.stores.stateStore,
        });
      });

      socket.on("bridge:auth:tell:sent", (_payload) => {
        // 中文注释：当前最小实现下，/tell/start 只要求已投递到任意 bridge，不再等待 sent/failed 回执。
      });

      socket.on("bridge:auth:tell:failed", (_payload) => {
        // 中文注释：保留事件监听以兼容上游上报，后续如需严格回执语义可在此扩展。
      });

      socket.on("bridge:auth:manual:matched", (payload) => {
        const playerName = String(payload?.playerName ?? "").trim();
        const challenge = String(payload?.challenge ?? "").trim();
        if (!playerName || !challenge) {
          return;
        }
        input.bridgeAuthCoordinator?.handleManualMatched(playerName, challenge);
      });

      socket.on("disconnect", () => {
        bridgeSockets.delete(socket.id);
      });

      return;
    }

    socket.on("client:join", (payload) => {
      const session = handleClientJoin(payload, {
        socketId: socket.id,
        sessionStore: input.stores.sessionStore,
        emitSelf: (event, body) => {
          socket.emit(event, body);
        },
        requirePlayerTokenAuth: input.auth?.requirePlayerTokenAuth,
        playerAuthService: input.auth?.playerAuthService,
      });

      if (!session) {
        return;
      }

      socket.data.sessionId = session.sessionId;
      socketIdBySessionId.set(session.sessionId, socket.id);

      if (session.replacedSession) {
        const replacedSessionId = session.replacedSession.sessionId;
        const replacedSocketId =
          socketIdBySessionId.get(replacedSessionId) ?? session.replacedSession.socketId;

        // 中文注释：新连接接管会话时，主动下线旧 socket 并清理索引，避免旧连接继续参与信令与邻近广播。
        socketIdBySessionId.delete(replacedSessionId);
        input.stores.sessionStore.removeById(replacedSessionId);

        const replacedSocket = io.sockets.sockets.get(replacedSocketId);
        if (replacedSocket) {
          replacedSocket.data.sessionId = undefined;
          replacedSocket.disconnect(true);
        }
      }
    });

    socket.on("webrtc:offer", (payload) => relayWebRtc(socket, "webrtc:offer", payload));
    socket.on("webrtc:answer", (payload) =>
      relayWebRtc(socket, "webrtc:answer", payload),
    );
    socket.on("webrtc:candidate", (payload) =>
      relayWebRtc(socket, "webrtc:candidate", payload),
    );

    socket.on("presence:list:req", () => {
      const requestSessionId = String(socket.data.sessionId ?? "").trim();
      handlePresenceListReq({
        requestSessionId,
        sessionStore: input.stores.sessionStore,
        stateStore: input.stores.stateStore,
        emitSelf: (event, body) => socket.emit(event, body),
      });
    });

    socket.on("disconnect", () => {
      const sessionId = String(socket.data.sessionId ?? "").trim();
      if (!sessionId) {
        return;
      }

      // 断开连接时同步清理会话索引，避免脏会话被继续转发。
      socketIdBySessionId.delete(sessionId);
      input.stores.sessionStore.removeById(sessionId);
    });

    function relayWebRtc(
      sourceSocket: typeof socket,
      event: "webrtc:offer" | "webrtc:answer" | "webrtc:candidate",
      payload: { toSessionId: string; data: unknown },
    ): void {
      const fromSessionId = String(sourceSocket.data.sessionId ?? "").trim();
      if (!fromSessionId) {
        return;
      }

      handleWebRtcRelay(event, payload, {
        fromSessionId,
        sessionStore: input.stores.sessionStore,
        emitToSession: (toSessionId, forwardEvent, body) => {
          const targetSocketId = socketIdBySessionId.get(toSessionId);
          if (!targetSocketId) {
            return;
          }
          io.to(targetSocketId).emit(forwardEvent, body);
        },
      });
    }
  });

  io.engine.on("close", () => {
    stopProximityService();
    bridgeSockets.clear();
  });

  return {
    io,
    collectBridgeSockets,
  };
}

