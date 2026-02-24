import type http from "node:http";
import { Server } from "socket.io";
import { ReconnectCodeStore } from "../domain/session/ReconnectCodeStore.js";
import { SessionStore } from "../domain/session/SessionStore.js";
import { startProximityService } from "../domain/proximity/startProximityService.js";
import { StateStore } from "../domain/state/StateStore.js";
import { handleBridgePositionUpdate } from "./handlers/bridgePosition.js";
import { handleClientJoin } from "./handlers/clientJoin.js";
import { handlePresenceListReq } from "./handlers/presence.js";
import { handleWebRtcRelay } from "./handlers/webrtcRelay.js";
import { authBridge } from "./middleware/authBridge.js";

export interface SocketServerOptions {
  bridgeToken: string;
  callRadius: number;
  tickMs: number;
  gamePlayerTtlMs: number;
}

export interface SocketServerStores {
  stateStore: StateStore;
  sessionStore: SessionStore;
  reconnectCodeStore: ReconnectCodeStore;
}

export interface CreateSocketServerInput {
  httpServer: http.Server;
  options: SocketServerOptions;
  stores: SocketServerStores;
}

export function createSocketServer(input: CreateSocketServerInput): Server {
  const io = new Server(input.httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  const socketIdBySessionId = new Map<string, string>();

  const stopProximityService = startProximityService({
    stateStore: input.stores.stateStore,
    sessionStore: input.stores.sessionStore,
    callRadius: input.options.callRadius,
    tickMs: input.options.tickMs,
    gamePlayerTtlMs: input.options.gamePlayerTtlMs,
    emitNearby: (sessionId, nearbyPlayers) => {
      const targetSocketId = socketIdBySessionId.get(sessionId);
      if (!targetSocketId) {
        return;
      }
      io.to(targetSocketId).emit("presence:nearby", { players: nearbyPlayers });
    },
  });

  io.on("connection", (socket) => {
    const bridgeAuth = authBridge(socket, input.options.bridgeToken);
    if (bridgeAuth.isBridge) {
      if (!bridgeAuth.authorized) {
        socket.emit("auth:rejected", { reason: "UNAUTHORIZED" });
        socket.disconnect(true);
        return;
      }

      socket.emit("auth:accepted");
      socket.on("bridge:position:update", (payload) => {
        handleBridgePositionUpdate(payload, {
          stateStore: input.stores.stateStore,
        });
      });
      return;
    }

    socket.on("client:join", (payload) => {
      const session = handleClientJoin(payload, {
        socketId: socket.id,
        sessionStore: input.stores.sessionStore,
        reconnectCodeStore: input.stores.reconnectCodeStore,
        emitSelf: (event, body) => {
          socket.emit(event, body);
        },
      });

      if (!session) {
        return;
      }

      socket.data.sessionId = session.sessionId;
      socketIdBySessionId.set(session.sessionId, socket.id);
    });

    socket.on("webrtc:offer", (payload) =>
      relayWebRtc(socket, "webrtc:offer", payload),
    );
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
  });

  return io;
}
