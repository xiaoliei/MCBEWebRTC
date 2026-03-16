import http from "node:http";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import { createApp } from "../../../src/http/createApp.js";
import { createSocketServer } from "../../../src/signaling/createSocketServer.js";
import { StateStore } from "../../../src/domain/state/StateStore.js";
import { SessionStore } from "../../../src/domain/session/SessionStore.js";

describe("mc bridge flow", () => {
  let server: http.Server;
  let baseUrl: string;
  const sockets: Socket[] = [];
  const BRIDGE_JWT_SECRET = "bridge-secret-for-jwt-tests";

  beforeEach(async () => {
    const app = createApp({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    server = http.createServer(app);

    createSocketServer({
      httpServer: server,
      options: {
        bridgeJwtSecret: BRIDGE_JWT_SECRET,
        callRadius: 8,
        tickMs: 30,
        gamePlayerTtlMs: 60_000,
      },
      stores: {
        stateStore: new StateStore(),
        sessionStore: new SessionStore(),
      },
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("无法获取监听地址");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    // 安全地断开所有 socket 连接，即使某个 disconnect 失败也不影响其他清理
    for (const socket of sockets) {
      try {
        if (socket.connected) {
          socket.disconnect();
        }
      } catch (error) {
        console.error('Failed to disconnect socket:', error);
      }
    }
    sockets.length = 0;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("错误 token 会被拒绝", async () => {
    const badBridge = createClient(baseUrl, {
      auth: { clientType: "mc-bridge", token: "wrong-token" },
      transports: ["websocket"],
    });
    sockets.push(badBridge);

    const rejected = await waitForEvent<{ reason: string }>(
      badBridge,
      "auth:rejected",
    );
    expect(rejected.reason).toBe("TOKEN_INVALID");
  });

  it("bridge 上报位置后 client 能收到 presence:nearby", async () => {
    const bridge = createClient(baseUrl, {
      auth: {
        clientType: "mc-bridge",
        token: createBridgeJwt(BRIDGE_JWT_SECRET, "gateway-flow-test"),
      },
      transports: ["websocket"],
    });
    sockets.push(bridge);
    await waitForEvent(bridge, "auth:accepted");

    const clientA = createClient(baseUrl, { transports: ["websocket"] });
    const clientB = createClient(baseUrl, { transports: ["websocket"] });
    sockets.push(clientA, clientB);

    clientA.emit("client:join", { playerName: "Alice" });
    clientB.emit("client:join", { playerName: "Bob" });

    await waitForEvent(clientA, "connected");
    const bConnected = await waitForEvent<{ sessionId: string }>(
      clientB,
      "connected",
    );

    bridge.emit("bridge:position:update", {
      playerName: "Alice",
      playerId: "pa",
      position: { x: 0, y: 64, z: 0 },
      dim: 0,
    });
    bridge.emit("bridge:position:update", {
      playerName: "Bob",
      playerId: "pb",
      position: { x: 2, y: 64, z: 1 },
      dim: 0,
    });

    const aNearby = await waitForEvent<{
      players: Array<{ sessionId: string }>;
    }>(clientA, "presence:nearby");

    expect(aNearby.players.map((item) => item.sessionId)).toContain(
      bConnected.sessionId,
    );
  });
});

function waitForEvent<T>(
  socket: Socket,
  event: string,
  timeoutMs = 3000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`等待事件超时: ${event}`));
    }, timeoutMs);

    const onEvent = (payload: T) => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    };

    socket.once(event, onEvent);
  });
}

function createBridgeJwt(secret: string, gatewayId: string): string {
  return jwt.sign({ role: "mc-bridge", gatewayId }, secret, {
    algorithm: "HS256",
    expiresIn: "2h",
  });
}