import { describe, expect, it, vi } from "vitest";
import { InMemoryPlayerTokenWhitelistStore } from "../../../../src/domain/auth/InMemoryPlayerTokenWhitelistStore.js";
import { InMemoryVerificationSessionStore } from "../../../../src/domain/auth/InMemoryVerificationSessionStore.js";
import { AuthRateLimiter } from "../../../../src/domain/auth/AuthRateLimiter.js";
import { PlayerAuthService } from "../../../../src/domain/auth/PlayerAuthService.js";
import { issuePlayerJwtToken, verifyPlayerJwtToken } from "../../../../src/utils/jwt.js";

interface TestConfig {
  authTell: {
    codeTtlMs: number;
    rateLimitWindowMs: number;
    rateLimitMax: number;
  };
  authManual: {
    codeTtlMs: number;
    rateLimitWindowMs: number;
    rateLimitMax: number;
    messagePrefix: string;
  };
  playerJwt: {
    secret: string;
    expiresIn: string;
  };
}

describe("PlayerAuthService", () => {
  it("/tell/start 创建会话并返回 TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);

    const verificationSessionStore = new InMemoryVerificationSessionStore();
    const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

    const service = createService({
      verificationSessionStore,
      whitelistStore,
      sendTellCommand: async () => true,
    });

    const result = await service.startTellVerification("Steve");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      vi.useRealTimers();
      return;
    }

    // 安全基线：/tell/start 成功响应不应包含验证码
    expect("code" in result).toBe(false);
    expect(result.ttlMs).toBe(60_000);
    expect(result.expiresAt).toBe(70_000);
    const active = verificationSessionStore.getActiveByPlayerName("Steve");
    expect(active?.mode).toBe("tell");
    // 验证码仍需存储在会话中供后续 finish 验证使用
    expect(active?.code).toBeDefined();

    vi.useRealTimers();
  });

  it("/tell/finish 验证成功后签发 token 并写白名单", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);

    const verificationSessionStore = new InMemoryVerificationSessionStore();
    const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

    const service = createService({
      verificationSessionStore,
      whitelistStore,
      sendTellCommand: async () => true,
    });

    const start = await service.startTellVerification("Alex");
    expect(start.ok).toBe(true);
    if (!start.ok) {
      vi.useRealTimers();
      return;
    }

    // 从会话存储中获取验证码（不再通过 start 返回）
    const activeSession = verificationSessionStore.getActiveByPlayerName("Alex");
    const code = activeSession?.code ?? "000000";

    const finish = await service.finishTellVerification("Alex", code);
    expect(finish.ok).toBe(true);
    if (!finish.ok) {
      vi.useRealTimers();
      return;
    }

    const verified = verifyPlayerJwtToken(finish.token, "player-test-secret-123456");
    expect(verified.ok).toBe(true);
    if (!verified.ok) {
      vi.useRealTimers();
      return;
    }

    expect(whitelistStore.isActive(verified.payload.jti)).toBe(true);

    vi.useRealTimers();
  });

  it("manual/start 创建会话并返回 #校验码", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(30_000);

    const verificationSessionStore = new InMemoryVerificationSessionStore();
    const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

    const service = createService({
      verificationSessionStore,
      whitelistStore,
      sendTellCommand: async () => true,
      startManualWatch: async () => true,
    });

    const result = await service.startManualVerification("Notch");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      vi.useRealTimers();
      return;
    }

    expect(result.challenge.startsWith("#")).toBe(true);
    expect(result.challenge).toBe(`#${result.code}`);
    const active = verificationSessionStore.getActiveByPlayerName("Notch");
    expect(active?.mode).toBe("manual");
    expect(active?.code).toBe(result.code);

    vi.useRealTimers();
  });

  it("manual/start 在 watch 启动失败时返回 BRIDGE_UNAVAILABLE 且不落会话状态", async () => {
    const verificationSessionStore = new InMemoryVerificationSessionStore();
    const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

    const service = createService({
      verificationSessionStore,
      whitelistStore,
      sendTellCommand: async () => true,
      startManualWatch: async () => false,
    });

    const result = await service.startManualVerification("FailPlayer");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "BRIDGE_UNAVAILABLE",
        message: "mcwss 不可用，无法启动 manual watch",
      },
    });
    expect(verificationSessionStore.getActiveByPlayerName("FailPlayer")).toBeNull();
  });

  it("manual 必须先 game_confirmed 再 frontendConfirmed 才能签发", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(40_000);

    const verificationSessionStore = new InMemoryVerificationSessionStore();
    const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

    const service = createService({
      verificationSessionStore,
      whitelistStore,
      sendTellCommand: async () => true,
    });

    const start = await service.startManualVerification("Herobrine");
    expect(start.ok).toBe(true);
    if (!start.ok) {
      vi.useRealTimers();
      return;
    }

    const earlyConfirm = await service.confirmManualVerification("Herobrine", start.code);
    expect(earlyConfirm).toEqual({
      ok: false,
      error: {
        code: "INVALID_VERIFICATION",
        message: "manual 验证尚未完成游戏内确认",
      },
    });

    const wrongMatch = service.handleManualGameMatched("Herobrine", "000000");
    expect(wrongMatch).toEqual({
      ok: false,
      error: {
        code: "INVALID_VERIFICATION",
        message: "校验码错误或会话不存在",
      },
    });

    const matched = service.handleManualGameMatched("Herobrine", start.code);
    expect(matched.ok).toBe(true);

    const finalConfirm = await service.confirmManualVerification("Herobrine", start.code);
    expect(finalConfirm.ok).toBe(true);

    vi.useRealTimers();
  });

  it("manual/confirm 使用错误 code 时拒绝签发 token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(45_000);

    const verificationSessionStore = new InMemoryVerificationSessionStore();
    const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

    const service = createService({
      verificationSessionStore,
      whitelistStore,
      sendTellCommand: async () => true,
    });

    const start = await service.startManualVerification("Builder");
    expect(start.ok).toBe(true);
    if (!start.ok) {
      vi.useRealTimers();
      return;
    }

    const matched = service.handleManualGameMatched("Builder", start.code);
    expect(matched.ok).toBe(true);

    const confirm = await service.confirmManualVerification("Builder", "000000");
    expect(confirm).toEqual({
      ok: false,
      error: {
        code: "INVALID_VERIFICATION",
        message: "校验码错误或会话不存在",
      },
    });

    vi.useRealTimers();
  });

  it("同玩家新请求只使旧待验证会话 superseded，不废除旧 JWT", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(50_000);

    const verificationSessionStore = new InMemoryVerificationSessionStore();
    const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

    // 使用固定的验证码生成器，便于测试验证
    let codeSequence = 0;
    const generateCode = () => String(++codeSequence).padStart(6, "0");

    const service = createService({
      verificationSessionStore,
      whitelistStore,
      sendTellCommand: async () => true,
      createVerificationCode: generateCode,
    });

    const firstStart = await service.startTellVerification("Steve");
    expect(firstStart.ok).toBe(true);
    if (!firstStart.ok) {
      vi.useRealTimers();
      return;
    }
    const firstCode = "000001";

    const secondStart = await service.startTellVerification("Steve");
    expect(secondStart.ok).toBe(true);
    if (!secondStart.ok) {
      vi.useRealTimers();
      return;
    }
    const secondCode = "000002";

    // 旧会话已被替代，使用旧验证码应该失败
    const finishWithOldCode = await service.finishTellVerification("Steve", firstCode);
    expect(finishWithOldCode).toEqual({
      ok: false,
      error: {
        code: "INVALID_VERIFICATION",
        message: "校验码错误或会话不存在",
      },
    });

    // 新会话使用新验证码应该成功
    const finishWithNewCode = await service.finishTellVerification("Steve", secondCode);
    expect(finishWithNewCode.ok).toBe(true);
    if (!finishWithNewCode.ok) {
      vi.useRealTimers();
      return;
    }

    const thirdStart = await service.startTellVerification("Steve");
    expect(thirdStart.ok).toBe(true);

    const tokenValidation = service.validatePlayerToken(finishWithNewCode.token);
    expect(tokenValidation.ok).toBe(true);

    vi.useRealTimers();
  });

  it("tell/manual 使用独立限流器", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(60_000);

    const verificationSessionStore = new InMemoryVerificationSessionStore();
    const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

    const service = createService({
      verificationSessionStore,
      whitelistStore,
      sendTellCommand: async () => true,
      config: {
        authTell: {
          codeTtlMs: 60_000,
          rateLimitWindowMs: 120_000,
          rateLimitMax: 1,
        },
        authManual: {
          codeTtlMs: 60_000,
          rateLimitWindowMs: 120_000,
          rateLimitMax: 1,
          messagePrefix: "#",
        },
        playerJwt: {
          secret: "player-test-secret-123456",
          expiresIn: "1h",
        },
      },
    });

    const tellFirst = await service.startTellVerification("Alex");
    expect(tellFirst.ok).toBe(true);

    const tellSecond = await service.startTellVerification("Alex");
    expect(tellSecond).toEqual({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "请求过于频繁，请稍后再试",
      },
    });

    const manualFirst = await service.startManualVerification("Alex");
    expect(manualFirst.ok).toBe(true);

    const manualSecond = await service.startManualVerification("Alex");
    expect(manualSecond).toEqual({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "请求过于频繁，请稍后再试",
      },
    });

    vi.useRealTimers();
  });

  it("使用注入的当前时间提供器计算 expiresAt", async () => {
    const verificationSessionStore = new InMemoryVerificationSessionStore();
    const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

    const service = createService({
      verificationSessionStore,
      whitelistStore,
      sendTellCommand: async () => true,
      now: () => 123_456,
    });

    const result = await service.startTellVerification("TimePlayer");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.expiresAt).toBe(183_456);
    const active = verificationSessionStore.getActiveByPlayerName("TimePlayer");
    expect(active?.expiresAt).toBe(183_456);
  });

  it("使用注入的验证码生成器创建校验码", async () => {
    const verificationSessionStore = new InMemoryVerificationSessionStore();
    const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

    const service = createService({
      verificationSessionStore,
      whitelistStore,
      sendTellCommand: async () => true,
      createVerificationCode: () => "654321",
    });

    const result = await service.startManualVerification("CodePlayer");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.code).toBe("654321");
    expect(result.challenge).toBe("#654321");
    const active = verificationSessionStore.getActiveByPlayerName("CodePlayer");
    expect(active?.code).toBe("654321");
  });

  it("mcwss 不可用时报 BRIDGE_UNAVAILABLE", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(70_000);

    const verificationSessionStore = new InMemoryVerificationSessionStore();
    const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

    const service = createService({
      verificationSessionStore,
      whitelistStore,
      sendTellCommand: async () => false,
    });

    const result = await service.startTellVerification("Steve");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "BRIDGE_UNAVAILABLE",
        message: "mcwss 不可用，无法下发 /tell 指令",
      },
    });
    expect(verificationSessionStore.getActiveByPlayerName("Steve")).toBeNull();

    vi.useRealTimers();
  });

  describe("validatePlayerToken", () => {
    it("空字符串 token 返回 TOKEN_MISSING", () => {
      const verificationSessionStore = new InMemoryVerificationSessionStore();
      const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

      const service = createService({
        verificationSessionStore,
        whitelistStore,
        sendTellCommand: async () => true,
      });

      const result = service.validatePlayerToken("");
      expect(result).toEqual({
        ok: false,
        error: { code: "TOKEN_MISSING", message: expect.any(String) },
      });
    });

    it("空格字符串 token 返回 TOKEN_MISSING", () => {
      const verificationSessionStore = new InMemoryVerificationSessionStore();
      const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

      const service = createService({
        verificationSessionStore,
        whitelistStore,
        sendTellCommand: async () => true,
      });

      const result = service.validatePlayerToken("   ");
      expect(result).toEqual({
        ok: false,
        error: { code: "TOKEN_MISSING", message: expect.any(String) },
      });
    });

    it("过期 token 返回 TOKEN_EXPIRED", () => {
      vi.useFakeTimers();
      vi.setSystemTime(100_000);

      const verificationSessionStore = new InMemoryVerificationSessionStore();
      const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

      const service = createService({
        verificationSessionStore,
        whitelistStore,
        sendTellCommand: async () => true,
      });

      // 创建一个已经过期的 token
      const expiredToken = issuePlayerJwtToken("player-test-secret-123456", -1, "Steve");

      const result = service.validatePlayerToken(expiredToken);
      expect(result).toEqual({
        ok: false,
        error: { code: "TOKEN_EXPIRED", message: expect.any(String) },
      });

      vi.useRealTimers();
    });

    it("无效 token 返回 TOKEN_INVALID", () => {
      const verificationSessionStore = new InMemoryVerificationSessionStore();
      const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

      const service = createService({
        verificationSessionStore,
        whitelistStore,
        sendTellCommand: async () => true,
      });

      const result = service.validatePlayerToken("invalid-token");
      expect(result).toEqual({
        ok: false,
        error: { code: "TOKEN_INVALID", message: expect.any(String) },
      });
    });

    it("token 未在白名单中返回 TOKEN_REVOKED", () => {
      const verificationSessionStore = new InMemoryVerificationSessionStore();
      const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

      const service = createService({
        verificationSessionStore,
        whitelistStore,
        sendTellCommand: async () => true,
      });

      // 创建一个有效的 token，但不将其添加到白名单
      const validToken = issuePlayerJwtToken("player-test-secret-123456", "1h", "Steve");

      const result = service.validatePlayerToken(validToken);
      expect(result).toEqual({
        ok: false,
        error: { code: "TOKEN_REVOKED", message: expect.any(String) },
      });
    });

    it("白名单中已撤销的 token 返回 TOKEN_REVOKED", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(100_000);

      const verificationSessionStore = new InMemoryVerificationSessionStore();
      const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

      const service = createService({
        verificationSessionStore,
        whitelistStore,
        sendTellCommand: async () => true,
      });

      // 创建一个 token 并添加到白名单
      const start = await service.startTellVerification("Steve");
      expect(start.ok).toBe(true);
      if (!start.ok) {
        vi.useRealTimers();
        return;
      }

      const activeSession = verificationSessionStore.getActiveByPlayerName("Steve");
      const code = activeSession?.code ?? "000000";

      const finish = await service.finishTellVerification("Steve", code);
      expect(finish.ok).toBe(true);
      if (!finish.ok) {
        vi.useRealTimers();
        return;
      }

      // 从白名单中移除该 token
      const verified = verifyPlayerJwtToken(finish.token, "player-test-secret-123456");
      expect(verified.ok).toBe(true);
      if (!verified.ok) {
        vi.useRealTimers();
        return;
      }
      whitelistStore.revoke(verified.payload.jti, "test-revoked");

      // 验证已撤销的 token
      const result = service.validatePlayerToken(finish.token);
      expect(result).toEqual({
        ok: false,
        error: { code: "TOKEN_REVOKED", message: expect.any(String) },
      });

      vi.useRealTimers();
    });

    it("有效 token 返回成功结果", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(110_000);

      const verificationSessionStore = new InMemoryVerificationSessionStore();
      const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

      const service = createService({
        verificationSessionStore,
        whitelistStore,
        sendTellCommand: async () => true,
      });

      // 创建并验证一个 token
      const start = await service.startTellVerification("Alex");
      expect(start.ok).toBe(true);
      if (!start.ok) {
        vi.useRealTimers();
        return;
      }

      const activeSession = verificationSessionStore.getActiveByPlayerName("Alex");
      const code = activeSession?.code ?? "000000";

      const finish = await service.finishTellVerification("Alex", code);
      expect(finish.ok).toBe(true);
      if (!finish.ok) {
        vi.useRealTimers();
        return;
      }

      const result = service.validatePlayerToken(finish.token);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.playerName).toBe("Alex");
        expect(typeof result.jti).toBe("string");
      }

      vi.useRealTimers();
    });
  });

  describe("bridgeAuthCoordinator", () => {
    it("manual/start 成功时应调用 startManualWatch", async () => {
      const mockStartManualWatch = vi.fn(async () => true);
      const mockStopManualWatch = vi.fn();

      const verificationSessionStore = new InMemoryVerificationSessionStore();
      const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

      const service = createService({
        verificationSessionStore,
        whitelistStore,
        sendTellCommand: async () => true,
        startManualWatch: mockStartManualWatch,
        bridgeAuthCoordinator: {
          stopManualWatch: mockStopManualWatch,
        },
      });

      await service.startManualVerification("Player1");

      expect(mockStartManualWatch).toHaveBeenCalledWith("Player1", expect.stringMatching(/^#/));
      expect(mockStopManualWatch).not.toHaveBeenCalled();
    });

    it("manual 会话过期时 confirmManualVerification 应调用 stopManualWatch", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000);

      const mockStopManualWatch = vi.fn();
      const verificationSessionStore = new InMemoryVerificationSessionStore();
      const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

      const service = createService({
        verificationSessionStore,
        whitelistStore,
        sendTellCommand: async () => true,
        bridgeAuthCoordinator: {
          stopManualWatch: mockStopManualWatch,
        },
      });

      const start = await service.startManualVerification("Player2");
      expect(start.ok).toBe(true);
      if (!start.ok) {
        vi.useRealTimers();
        return;
      }
      mockStopManualWatch.mockClear();

      vi.setSystemTime(start.expiresAt + 1);

      const result = await service.confirmManualVerification("Player2", start.code);
      expect(result).toEqual({
        ok: false,
        error: {
          code: "INVALID_VERIFICATION",
          message: "校验码错误或会话不存在",
        },
      });

      expect(mockStopManualWatch).toHaveBeenCalledWith("Player2");
      expect(mockStopManualWatch).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it("manual 会话过期时 handleManualGameMatched 应调用 stopManualWatch", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(2_000);

      const mockStopManualWatch = vi.fn();
      const verificationSessionStore = new InMemoryVerificationSessionStore();
      const whitelistStore = new InMemoryPlayerTokenWhitelistStore();

      const service = createService({
        verificationSessionStore,
        whitelistStore,
        sendTellCommand: async () => true,
        bridgeAuthCoordinator: {
          stopManualWatch: mockStopManualWatch,
        },
      });

      const start = await service.startManualVerification("Player3");
      expect(start.ok).toBe(true);
      if (!start.ok) {
        vi.useRealTimers();
        return;
      }
      mockStopManualWatch.mockClear();

      vi.setSystemTime(start.expiresAt + 1);

      const result = service.handleManualGameMatched("Player3", start.code);
      expect(result).toEqual({
        ok: false,
        error: {
          code: "INVALID_VERIFICATION",
          message: "校验码错误或会话不存在",
        },
      });

      expect(mockStopManualWatch).toHaveBeenCalledWith("Player3");
      expect(mockStopManualWatch).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });
});

function createService(input: {
  verificationSessionStore: InMemoryVerificationSessionStore;
  whitelistStore: InMemoryPlayerTokenWhitelistStore;
  sendTellCommand: (playerName: string, code: string) => Promise<boolean>;
  startManualWatch?: (playerName: string, challenge: string) => Promise<boolean>;
  now?: () => number;
  createVerificationCode?: () => string;
  config?: TestConfig;
  bridgeAuthCoordinator?: { stopManualWatch: (playerName: string) => void };
}) {
  const config: TestConfig =
    input.config ??
    {
      authTell: {
        codeTtlMs: 60_000,
        rateLimitWindowMs: 120_000,
        rateLimitMax: 10,
      },
      authManual: {
        codeTtlMs: 60_000,
        rateLimitWindowMs: 120_000,
        rateLimitMax: 10,
        messagePrefix: "#",
      },
      playerJwt: {
        secret: "player-test-secret-123456",
        expiresIn: "1h",
      },
    };

  return new PlayerAuthService({
    config,
    verificationSessionStore: input.verificationSessionStore,
    whitelistStore: input.whitelistStore,
    tellRateLimiter: new AuthRateLimiter(
      config.authTell.rateLimitWindowMs,
      config.authTell.rateLimitMax,
    ),
    manualRateLimiter: new AuthRateLimiter(
      config.authManual.rateLimitWindowMs,
      config.authManual.rateLimitMax,
    ),
    bridgeCommandSender: {
      sendTellVerificationCode: input.sendTellCommand,
    },
    bridgeAuthCoordinator: {
      startManualWatch: input.startManualWatch,
      stopManualWatch: input.bridgeAuthCoordinator?.stopManualWatch ?? (() => {}),
    },
    now: input.now ?? (() => Date.now()),
    createVerificationCode:
      input.createVerificationCode ??
      (() => String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")),
  });
}
