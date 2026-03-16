import { describe, expect, it } from "vitest";
import { readConfig } from "../../../src/config/readConfig.js";

function createBaseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    BRIDGE_JWT_SECRET: "test-secret-123456",
    PLAYER_JWT_SECRET: "player-secret-123456",
    PLAYER_JWT_EXPIRES_IN: "1h",
    PLAYER_TOKEN_REFRESH_STRATEGY: "none",
    AUTH_TELL_CODE_TTL_MS: "60000",
    AUTH_TELL_RATE_LIMIT_WINDOW_MS: "120000",
    AUTH_TELL_RATE_LIMIT_MAX: "5",
    AUTH_MANUAL_CODE_TTL_MS: "60000",
    AUTH_MANUAL_RATE_LIMIT_WINDOW_MS: "120000",
    AUTH_MANUAL_RATE_LIMIT_MAX: "5",
    AUTH_TOKEN_CLEANUP_INTERVAL_MS: "300000",
    AUTH_VERIFY_SESSION_CLEANUP_INTERVAL_MS: "300000",
    ...overrides,
  };
}

describe("readConfig", () => {
  describe("默认值处理", () => {
    it("当环境变量未设置时使用默认值", () => {
      const config = readConfig(createBaseEnv());

      expect(config.port).toBe(3000);
      expect(config.host).toBe("0.0.0.0");
      expect(config.jwtExpiresIn).toBe("2h");
      expect(config.iceServers).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
      expect(config.authVerificationEnabled).toBe(true);
      expect(config.authManual.messagePrefix).toBe("#");
    });
  });

  describe("端口解析", () => {
    it("解析有效端口", () => {
      expect(readConfig(createBaseEnv({ PORT: "1" })).port).toBe(1);
      expect(readConfig(createBaseEnv({ PORT: "65535" })).port).toBe(65535);
    });

    it("非法端口回退默认值", () => {
      expect(readConfig(createBaseEnv({ PORT: "invalid" })).port).toBe(3000);
      expect(readConfig(createBaseEnv({ PORT: "0" })).port).toBe(3000);
    });
  });

  describe("ICE 配置解析", () => {
    it("解析合法 ICE_SERVERS", () => {
      const config = readConfig(
        createBaseEnv({
          ICE_SERVERS:
            '[{"urls":["turn:localhost:3478"],"username":"u","credential":"p"}]',
        }),
      );

      expect(config.iceServers).toEqual([
        {
          urls: ["turn:localhost:3478"],
          username: "u",
          credential: "p",
        },
      ]);
    });

    it("非法 ICE_SERVERS 抛错", () => {
      expect(() =>
        readConfig(
          createBaseEnv({
            ICE_SERVERS: "{bad-json}",
          }),
        ),
      ).toThrowError(/ICE_SERVERS 解析失败/);
    });
  });

  describe("BRIDGE_JWT_SECRET 验证", () => {
    it("接受有效密钥并去除空格", () => {
      const config = readConfig(
        createBaseEnv({ BRIDGE_JWT_SECRET: "  valid-secret-123456  " }),
      );
      expect(config.bridgeJwtSecret).toBe("valid-secret-123456");
    });

    it("空值时报错", () => {
      expect(() => readConfig(createBaseEnv({ BRIDGE_JWT_SECRET: undefined }))).toThrowError(
        /BRIDGE_JWT_SECRET.*未设置/,
      );
      expect(() => readConfig(createBaseEnv({ BRIDGE_JWT_SECRET: "   " }))).toThrowError(
        /BRIDGE_JWT_SECRET.*未设置/,
      );
    });

    it("占位符时报错", () => {
      expect(() =>
        readConfig(createBaseEnv({ BRIDGE_JWT_SECRET: "change_me_in_production" })),
      ).toThrowError(/占位符/);
    });

    it("长度不足时报错", () => {
      expect(() => readConfig(createBaseEnv({ BRIDGE_JWT_SECRET: "short-secret" }))).toThrowError(
        /至少需要 16 个字符/,
      );
    });
  });

  describe("JWT_EXPIRES_IN", () => {
    it("支持常见格式", () => {
      expect(readConfig(createBaseEnv({ JWT_EXPIRES_IN: "30m" })).jwtExpiresIn).toBe("30m");
      expect(readConfig(createBaseEnv({ JWT_EXPIRES_IN: "2h" })).jwtExpiresIn).toBe("2h");
    });

    it("格式非法时报错", () => {
      expect(() => readConfig(createBaseEnv({ JWT_EXPIRES_IN: "2hours" }))).toThrowError(
        /JWT_EXPIRES_IN 格式无效/,
      );
    });
  });

  describe("玩家鉴权配置解析", () => {
    it("AUTH_VERIFICATION_ENABLED 默认值为 true", () => {
      const config = readConfig(createBaseEnv({ AUTH_VERIFICATION_ENABLED: undefined }));
      expect(config.authVerificationEnabled).toBe(true);
    });

    it("PLAYER_JWT_SECRET 必填", () => {
      expect(() => readConfig(createBaseEnv({ PLAYER_JWT_SECRET: undefined }))).toThrowError(
        /PLAYER_JWT_SECRET.*未设置/,
      );
      expect(() => readConfig(createBaseEnv({ PLAYER_JWT_SECRET: "   " }))).toThrowError(
        /PLAYER_JWT_SECRET.*未设置/,
      );
    });

    it("PLAYER_JWT_EXPIRES_IN 需要满足时长格式", () => {
      expect(readConfig(createBaseEnv({ PLAYER_JWT_EXPIRES_IN: "24h" })).playerJwt.expiresIn).toBe(
        "24h",
      );
      expect(() => readConfig(createBaseEnv({ PLAYER_JWT_EXPIRES_IN: "24hours" }))).toThrowError(
        /PLAYER_JWT_EXPIRES_IN 格式无效/,
      );
    });

    it("PLAYER_TOKEN_REFRESH_STRATEGY 仅允许 none", () => {
      expect(
        readConfig(createBaseEnv({ PLAYER_TOKEN_REFRESH_STRATEGY: "none" })).playerJwt
          .tokenRefreshStrategy,
      ).toBe("none");
      expect(() =>
        readConfig(createBaseEnv({ PLAYER_TOKEN_REFRESH_STRATEGY: "rolling" })),
      ).toThrowError(/PLAYER_TOKEN_REFRESH_STRATEGY 仅支持 none/);
    });

    it("解析 /tell 与 manual 的开关、TTL、限流与清理间隔", () => {
      const config = readConfig(
        createBaseEnv({
          AUTH_TELL_ENABLED: "false",
          AUTH_TELL_CODE_TTL_MS: "10000",
          AUTH_TELL_RATE_LIMIT_WINDOW_MS: "20000",
          AUTH_TELL_RATE_LIMIT_MAX: "3",
          AUTH_MANUAL_ENABLED: "false",
          AUTH_MANUAL_CODE_TTL_MS: "15000",
          AUTH_MANUAL_RATE_LIMIT_WINDOW_MS: "25000",
          AUTH_MANUAL_RATE_LIMIT_MAX: "4",
          AUTH_TOKEN_CLEANUP_INTERVAL_MS: "60000",
          AUTH_VERIFY_SESSION_CLEANUP_INTERVAL_MS: "70000",
        }),
      );

      expect(config.authTell).toEqual({
        enabled: false,
        codeTtlMs: 120000,
        rateLimitWindowMs: 60000,
        rateLimitMax: 3,
      });
      expect(config.authManual).toEqual({
        enabled: false,
        codeTtlMs: 300000,
        rateLimitWindowMs: 60000,
        rateLimitMax: 3,
        messagePrefix: "#",
      });
      expect(config.authCleanup).toEqual({
        tokenCleanupIntervalMs: 60000,
        verifySessionCleanupIntervalMs: 70000,
      });
    });

    it("AUTH_MANUAL_MESSAGE_PREFIX 默认值为 #", () => {
      const config = readConfig(createBaseEnv({ AUTH_MANUAL_MESSAGE_PREFIX: undefined }));
      expect(config.authManual.messagePrefix).toBe("#");
    });

    it("does not require player auth env vars when auth verification is disabled", () => {
      const config = readConfig(
        createBaseEnv({
          AUTH_VERIFICATION_ENABLED: "false",
          PLAYER_JWT_SECRET: undefined,
          PLAYER_JWT_EXPIRES_IN: undefined,
          AUTH_TELL_CODE_TTL_MS: undefined,
          AUTH_TELL_RATE_LIMIT_WINDOW_MS: undefined,
          AUTH_TELL_RATE_LIMIT_MAX: undefined,
          AUTH_MANUAL_CODE_TTL_MS: undefined,
          AUTH_MANUAL_RATE_LIMIT_WINDOW_MS: undefined,
          AUTH_MANUAL_RATE_LIMIT_MAX: undefined,
          AUTH_TOKEN_CLEANUP_INTERVAL_MS: undefined,
          AUTH_VERIFY_SESSION_CLEANUP_INTERVAL_MS: undefined,
        }),
      );

      expect(config.authVerificationEnabled).toBe(false);
      expect(config.playerJwt.secret).toBe("player-auth-disabled-placeholder");
      expect(config.authTell.codeTtlMs).toBe(120000);
      expect(config.authManual.codeTtlMs).toBe(300000);
      expect(config.authCleanup.tokenCleanupIntervalMs).toBe(60000);
    });

    it("does not require tell env vars when tell auth is disabled", () => {
      const config = readConfig(
        createBaseEnv({
          AUTH_TELL_ENABLED: "false",
          AUTH_TELL_CODE_TTL_MS: undefined,
          AUTH_TELL_RATE_LIMIT_WINDOW_MS: undefined,
          AUTH_TELL_RATE_LIMIT_MAX: undefined,
        }),
      );

      expect(config.authTell).toEqual({
        enabled: false,
        codeTtlMs: 120000,
        rateLimitWindowMs: 60000,
        rateLimitMax: 3,
      });
    });
  });
});
