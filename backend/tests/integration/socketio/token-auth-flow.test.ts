import http from "node:http";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import { createApp } from "../../../src/http/createApp.js";
import type { PlayerAuthServiceLike } from "../../../src/http/routes/auth.js";
import { AuthRateLimiter } from "../../../src/domain/auth/AuthRateLimiter.js";
import { InMemoryPlayerTokenWhitelistStore } from "../../../src/domain/auth/InMemoryPlayerTokenWhitelistStore.js";
import { InMemoryVerificationSessionStore } from "../../../src/domain/auth/InMemoryVerificationSessionStore.js";
import { PlayerAuthService } from "../../../src/domain/auth/PlayerAuthService.js";
import { SessionStore } from "../../../src/domain/session/SessionStore.js";
import { StateStore } from "../../../src/domain/state/StateStore.js";
import { createSocketServer } from "../../../src/signaling/createSocketServer.js";

describe("socket.io token auth flow", () => {
  let server: http.Server;
  let baseUrl: string;
  const sockets: Socket[] = [];
  const BRIDGE_JWT_SECRET = "bridge-secret-for-token-auth-tests";
  let bridgeAuthCoordinator: {
    sendTellVerificationCode: (playerName: string, code: string) => Promise<boolean>;
    startManualWatch: (playerName: string, challenge: string) => Promise<boolean>;
    stopManualWatch: (playerName: string) => void;
    handleManualMatched: (playerName: string, challenge: string) => void;
  };
  // 提取为模块级变量以便测试用例访问
  let playerAuthService: PlayerAuthService;
  let verificationSessionStore: InMemoryVerificationSessionStore;

  beforeEach(async () => {
    // 用于在测试中保存 bridge 发送的验证码
    let savedCode = "";

    bridgeAuthCoordinator = {
      sendTellVerificationCode: async (_playerName: string, code: string) => {
        savedCode = code;
        return true;
      },
      startManualWatch: async (_playerName: string, _challenge: string) => true,
      stopManualWatch: (_playerName: string) => {},
      handleManualMatched: (_playerName: string, _challenge: string) => {},
    };

    let codeSeq = 100000;
    verificationSessionStore = new InMemoryVerificationSessionStore();
    playerAuthService = new PlayerAuthService({
      config: {
        authTell: {
          codeTtlMs: 60_000,
        },
        authManual: {
          codeTtlMs: 60_000,
          messagePrefix: "!",
        },
        playerJwt: {
          secret: "player-jwt-secret-for-token-auth-tests",
          expiresIn: "2h",
        },
      },
      verificationSessionStore,
      whitelistStore: new InMemoryPlayerTokenWhitelistStore(),
      tellRateLimiter: new AuthRateLimiter(60_000, 20),
      manualRateLimiter: new AuthRateLimiter(60_000, 20),
      bridgeCommandSender: {
        // 中文注释：通过可替换协调器把 PlayerAuthService 与 Socket.IO bridge 通道解耦，便于先测后实现。
        sendTellVerificationCode: (playerName: string, code: string) =>
          bridgeAuthCoordinator.sendTellVerificationCode(playerName, code),
      },
      bridgeAuthCoordinator: {
        startManualWatch: (playerName: string, challenge: string) =>
          bridgeAuthCoordinator.startManualWatch(playerName, challenge),
        stopManualWatch: (playerName: string) =>
          bridgeAuthCoordinator.stopManualWatch(playerName),
      },
      now: () => Date.now(),
      createVerificationCode: () => String(++codeSeq),
    });

    bridgeAuthCoordinator.handleManualMatched = (playerName: string, challenge: string) => {
      // 中文注释：按配置前缀提取 code，确保非 # 前缀也能正确匹配。
      const manualPrefix = "!";
      const code = challenge.startsWith(manualPrefix)
        ? challenge.slice(manualPrefix.length)
        : challenge;
      playerAuthService.handleManualGameMatched(playerName, code);
    };

    const app = createApp({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      auth: {
        playerAuthService: {
          startTellVerification: (playerName: string) =>
            playerAuthService.startTellVerification(playerName),
          finishTellVerification: (playerName: string, code: string) =>
            playerAuthService.finishTellVerification(playerName, code),
          startManualVerification: (playerName: string) =>
            playerAuthService.startManualVerification(playerName),
          confirmManualVerification: async (playerName: string, code: string) => {
            const result = await playerAuthService.confirmManualVerification(
              playerName,
              code,
            );
            if (result.ok) {
              // 验证完成后停止 watch
              bridgeAuthCoordinator.stopManualWatch(playerName);
            }
            return result;
          },
        } as PlayerAuthServiceLike,
        authVerificationEnabled: true,
        authTellEnabled: true,
        authManualEnabled: true,
      },
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
      auth: {
        requirePlayerTokenAuth: true,
        playerAuthService,
      },
      bridgeAuthCoordinator,
    } as any);

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
    for (const socket of sockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    sockets.length = 0;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("/tell/start -> /tell/finish -> client:join", async () => {
    const bridge = createBridgeClient(baseUrl, BRIDGE_JWT_SECRET, sockets);
    await waitForEvent(bridge, "auth:accepted");

    const tellStart = await request(server)
      .post("/api/auth/verify/tell/start")
      .send({ playerName: "Steve" });

    expect(tellStart.status).toBe(200);
    expect(tellStart.body.ok).toBe(true);
    // tell/start 不再返回 code，需要通过 bridge 模拟获取
    // 这里简化处理：直接访问 InMemoryVerificationSessionStore 获取 code
    const sessionStore = (playerAuthService as any).deps.verificationSessionStore;
    const session = sessionStore.getActiveByPlayerName("Steve");
    expect(session).not.toBeNull();
    const code = session!.code;

    const tellFinish = await request(server)
      .post("/api/auth/verify/tell/finish")
      .send({ playerName: "Steve", code });


    expect(tellFinish.status).toBe(200);
    expect(typeof tellFinish.body.token).toBe("string");

    const client = createClient(baseUrl, { transports: ["websocket"] });
    sockets.push(client);

    client.emit("client:join", {
      playerName: "Steve",
      token: tellFinish.body.token,
    });

    const connected = await waitForEvent<{ sessionId: string; playerName: string }>(
      client,
      "connected",
    );
    expect(connected.playerName).toBe("Steve");
  });

  it("manual/start -> bridge matched -> manual/confirm -> client:join", async () => {
    const bridge = createBridgeClient(baseUrl, BRIDGE_JWT_SECRET, sockets);
    await waitForEvent(bridge, "auth:accepted");

    const watchStartPromise = waitForEvent<{ playerName: string; challenge: string }>(
      bridge,
      "bridge:auth:manual:watch:start",
    );

    const manualStart = await request(server)
      .post("/api/auth/verify/manual/start")
      .send({ playerName: "Alex" });

    expect(manualStart.status).toBe(200);
    expect(manualStart.body.ok).toBe(true);

    const watchStart = await watchStartPromise;
    expect(watchStart.playerName).toBe("Alex");

    bridge.emit("bridge:auth:manual:matched", {
      playerName: "Alex",
      challenge: watchStart.challenge,
    });

    const watchStopPromise = waitForEvent<{ playerName: string }>(
      bridge,
      "bridge:auth:manual:watch:stop",
    );

    const manualConfirm = await request(server)
      .post("/api/auth/verify/manual/confirm")
      .send({ playerName: "Alex", code: manualStart.body.code });

    expect(manualConfirm.status).toBe(200);
    expect(typeof manualConfirm.body.token).toBe("string");

    const watchStop = await watchStopPromise;
    expect(watchStop.playerName).toBe("Alex");

    const client = createClient(baseUrl, { transports: ["websocket"] });
    sockets.push(client);

    client.emit("client:join", {
      playerName: "Alex",
      token: manualConfirm.body.token,
    });

    const connected = await waitForEvent<{ sessionId: string; playerName: string }>(
      client,
      "connected",
    );
    expect(connected.playerName).toBe("Alex");
  });

  it("同玩家第二次 manual/start 时 bridge 会先收到 stop 再收到 start", async () => {
    const bridge = createBridgeClient(baseUrl, BRIDGE_JWT_SECRET, sockets);
    await waitForEvent(bridge, "auth:accepted");

    const firstWatchStartPromise = waitForEvent<{ playerName: string; challenge: string }>(
      bridge,
      "bridge:auth:manual:watch:start",
    );

    const firstStart = await request(server)
      .post("/api/auth/verify/manual/start")
      .send({ playerName: "Alex" });

    expect(firstStart.status).toBe(200);
    const firstWatchStart = await firstWatchStartPromise;
    expect(firstWatchStart.playerName).toBe("Alex");

    const eventOrder: string[] = [];
    const stopHandler = () => {
      eventOrder.push("stop");
    };
    const startHandler = () => {
      eventOrder.push("start");
    };
    bridge.on("bridge:auth:manual:watch:stop", stopHandler);
    bridge.on("bridge:auth:manual:watch:start", startHandler);

    const secondStart = await request(server)
      .post("/api/auth/verify/manual/start")
      .send({ playerName: "Alex" });

    expect(secondStart.status).toBe(200);

    await waitUntil(() => eventOrder.length >= 2);
    expect(eventOrder.slice(0, 2)).toEqual(["stop", "start"]);

    bridge.off("bridge:auth:manual:watch:stop", stopHandler);
    bridge.off("bridge:auth:manual:watch:start", startHandler);
  });

  it("同玩家旧连接会被 forceReplace=true 的新连接替换", async () => {
    const bridge = createBridgeClient(baseUrl, BRIDGE_JWT_SECRET, sockets);
    await waitForEvent(bridge, "auth:accepted");

    const tellStart = await request(server)
      .post("/api/auth/verify/tell/start")
      .send({ playerName: "Steve" });
    expect(tellStart.status).toBe(200);

    // tell/start 不再返回 code，需要通过 session store 获取
    const session = verificationSessionStore.getActiveByPlayerName("Steve");
    expect(session).not.toBeNull();
    const code = session!.code;

    const tellFinish = await request(server)
      .post("/api/auth/verify/tell/finish")
      .send({ playerName: "Steve", code });

    const token = String(tellFinish.body.token);

    const oldClient = createClient(baseUrl, { transports: ["websocket"] });
    const newClient = createClient(baseUrl, { transports: ["websocket"] });
    sockets.push(oldClient, newClient);

    oldClient.emit("client:join", { playerName: "Steve", token });
    await waitForEvent(oldClient, "connected");

    const oldDisconnectedPromise = waitForDisconnect(oldClient);

    newClient.emit("client:join", {
      playerName: "Steve",
      token,
      forceReplace: true,
    });

    const newConnected = await waitForEvent<{ playerName: string }>(
      newClient,
      "connected",
    );
    expect(newConnected.playerName).toBe("Steve");

    const disconnectReason = await oldDisconnectedPromise;
    expect(disconnectReason).toBe("io server disconnect");
  });

  it("mcwss 不在线时 /tell/start 返回桥接不可用", async () => {
    const tellStart = await request(server)
      .post("/api/auth/verify/tell/start")
      .send({ playerName: "NoBridge" });

    expect(tellStart.status).toBe(503);
    expect(tellStart.body).toMatchObject({
      ok: false,
      error: {
        code: "BRIDGE_UNAVAILABLE",
      },
    });
  });

  it("manual/start 在 watch 启动失败时返回 BRIDGE_UNAVAILABLE", async () => {
    const bridge = createBridgeClient(baseUrl, BRIDGE_JWT_SECRET, sockets);
    await waitForEvent(bridge, "auth:accepted");

    bridgeAuthCoordinator.startManualWatch = async () => false;

    const manualStart = await request(server)
      .post("/api/auth/verify/manual/start")
      .send({ playerName: "Alex" });

    expect(manualStart.status).toBe(503);
    expect(manualStart.body).toMatchObject({
      ok: false,
      error: {
        code: "BRIDGE_UNAVAILABLE",
      },
    });

    expect(verificationSessionStore.getActiveByPlayerName("Alex")).toBeNull();
  });
});

function createBridgeClient(baseUrl: string, secret: string, sockets: Socket[]): Socket {
  const bridge = createClient(baseUrl, {
    auth: {
      clientType: "mc-bridge",
      token: createBridgeJwt(secret, "gateway-token-auth-test"),
    },
    transports: ["websocket"],
  });
  sockets.push(bridge);
  return bridge;
}

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

function waitForDisconnect(socket: Socket, timeoutMs = 3000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("disconnect", onDisconnect);
      reject(new Error("等待断开连接超时"));
    }, timeoutMs);

    const onDisconnect = (reason: string) => {
      clearTimeout(timer);
      socket.off("disconnect", onDisconnect);
      resolve(reason);
    };

    socket.once("disconnect", onDisconnect);
  });
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 3000,
  intervalMs = 10,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start >= timeoutMs) {
      throw new Error("等待条件超时");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function createBridgeJwt(secret: string, gatewayId: string): string {
  return jwt.sign({ role: "mc-bridge", gatewayId }, secret, {
    algorithm: "HS256",
    expiresIn: "2h",
  });
}
