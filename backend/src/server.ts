import "dotenv/config";
import { randomInt } from "node:crypto";
import http from "node:http";
import { readConfig } from "./config/readConfig.js";
import { AuthRateLimiter } from "./domain/auth/AuthRateLimiter.js";
import { InMemoryPlayerTokenWhitelistStore } from "./domain/auth/InMemoryPlayerTokenWhitelistStore.js";
import { InMemoryVerificationSessionStore } from "./domain/auth/InMemoryVerificationSessionStore.js";
import { PlayerAuthService } from "./domain/auth/PlayerAuthService.js";
import { SessionStore } from "./domain/session/SessionStore.js";
import { StateStore } from "./domain/state/StateStore.js";
import { createApp } from "./http/createApp.js";
import { createSocketServer } from "./signaling/createSocketServer.js";
import type { PlayerAuthServiceLike } from "./http/routes/auth.js";

const config = readConfig();

const stateStore = new StateStore();
const sessionStore = new SessionStore();

const verificationSessionStore = new InMemoryVerificationSessionStore();
const whitelistStore = new InMemoryPlayerTokenWhitelistStore();
const tellRateLimiter = new AuthRateLimiter(
  config.authTell.rateLimitWindowMs,
  config.authTell.rateLimitMax,
);
const manualRateLimiter = new AuthRateLimiter(
  config.authManual.rateLimitWindowMs,
  config.authManual.rateLimitMax,
);

// 创建 bridgeAuthCoordinator 基础对象，先用空实现
const bridgeAuthCoordinator = {
  sendTellVerificationCode: async (_playerName: string, _code: string) => false,
  startManualWatch: async (_playerName: string, _challenge: string) => false,
  stopManualWatch: (_playerName: string) => {},
  handleManualMatched: (_playerName: string, _challenge: string) => {},
};

const playerAuthService = new PlayerAuthService({
  config: {
    authTell: {
      codeTtlMs: config.authTell.codeTtlMs,
    },
    authManual: {
      codeTtlMs: config.authManual.codeTtlMs,
      messagePrefix: config.authManual.messagePrefix,
    },
    playerJwt: {
      secret: config.playerJwt.secret,
      expiresIn: config.playerJwt.expiresIn,
    },
  },
  verificationSessionStore,
  whitelistStore,
  tellRateLimiter,
  manualRateLimiter,
  bridgeCommandSender: {
    // 中文注释：鉴权服务只依赖抽象发送能力，具体由 Socket.IO bridge 通道在 createSocketServer 中接管实现。
    sendTellVerificationCode: (playerName: string, code: string) =>
      bridgeAuthCoordinator.sendTellVerificationCode(playerName, code),
  },
  bridgeAuthCoordinator: {
    startManualWatch: (playerName: string, challenge: string) =>
      bridgeAuthCoordinator.startManualWatch(playerName, challenge),
    stopManualWatch: (playerName: string) => bridgeAuthCoordinator.stopManualWatch(playerName),
  },
  now: () => Date.now(),
  createVerificationCode: () => String(randomInt(100000, 1000000)),
});

bridgeAuthCoordinator.handleManualMatched = (playerName: string, challenge: string) => {
  // 中文注释：按配置前缀提取原始 code，避免将前缀硬编码为 #。
  const prefix = config.authManual.messagePrefix;
  const code = challenge.startsWith(prefix)
    ? challenge.slice(prefix.length)
    : challenge;
  playerAuthService.handleManualGameMatched(playerName, code);
};

const app = createApp({
  iceServers: config.iceServers,
  auth: {
    playerAuthService: {
      startTellVerification: (playerName: string) =>
        playerAuthService.startTellVerification(playerName),
      finishTellVerification: (playerName: string, code: string) =>
        playerAuthService.finishTellVerification(playerName, code),
      startManualVerification: (playerName: string) =>
        playerAuthService.startManualVerification(playerName),
      confirmManualVerification: async (playerName: string, code: string) => {
        const result = await playerAuthService.confirmManualVerification(playerName, code);
        if (result.ok) {
          // 验证完成后停止 watch
          bridgeAuthCoordinator.stopManualWatch(playerName);
        }
        return result;
      },
    } as PlayerAuthServiceLike,
    authVerificationEnabled: config.authVerificationEnabled,
    authTellEnabled: config.authTell.enabled,
    authManualEnabled: config.authManual.enabled,
  },
});

const httpServer = http.createServer(app);

// 调用 createSocketServer，它会填充 bridgeAuthCoordinator 的实现
const { collectBridgeSockets } = createSocketServer({
  httpServer,
  options: {
    bridgeJwtSecret: config.bridgeJwtSecret,
    callRadius: 16,
    tickMs: 200,
    gamePlayerTtlMs: 30_000,
  },
  stores: {
    stateStore,
    sessionStore,
  },
  auth: {
    requirePlayerTokenAuth: config.authVerificationEnabled,
    playerAuthService,
  },
  bridgeAuthCoordinator,
});

// 使用 collectBridgeSockets 覆盖 bridgeAuthCoordinator 的 stopManualWatch 实现
bridgeAuthCoordinator.stopManualWatch = (playerName: string) => {
  const targets = collectBridgeSockets();
  for (const bridgeSocket of targets) {
    bridgeSocket.emit("bridge:auth:manual:watch:stop", { playerName });
  }
};

httpServer.listen(config.port, config.host, () => {
  // 中文日志便于本地调试快速确认监听地址。
  console.log(`[backend] listening on http://${config.host}:${config.port}`);
});
