import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../src/http/createApp.js";

type AuthErrorCode =
  | "RATE_LIMITED"
  | "BRIDGE_UNAVAILABLE"
  | "INVALID_VERIFICATION"
  | "TOKEN_INVALID"
  | "AUTH_DISABLED";

type AuthFailure = {
  ok: false;
  error: {
    code: AuthErrorCode;
    message: string;
  };
};

type StartTellResult =
  | {
      ok: true;
      ttlMs: number;
      expiresAt: number;
    }
  | AuthFailure;

type FinishTellResult =
  | {
      ok: true;
      token: string;
    }
  | AuthFailure;

type StartManualResult =
  | {
      ok: true;
      code: string;
      challenge: string;
      ttlMs: number;
      expiresAt: number;
    }
  | AuthFailure;

type ConfirmManualResult =
  | {
      ok: true;
      token: string;
    }
  | AuthFailure;

interface PlayerAuthServiceLike {
  startTellVerification(playerName: string): Promise<StartTellResult>;
  finishTellVerification(playerName: string, code: string): Promise<FinishTellResult>;
  startManualVerification(playerName: string): Promise<StartManualResult>;
  confirmManualVerification(
    playerName: string,
    code: string,
  ): Promise<ConfirmManualResult>;
}

describe("auth http routes", () => {
  it("POST /api/auth/verify/tell/start 返回会话数据（不含验证码）", async () => {
    const app = createAppWithAuth(createServiceStub());

    const response = await request(app)
      .post("/api/auth/verify/tell/start")
      .send({ playerName: "Steve" });

    expect(response.status).toBe(200);
    // 安全基线：/tell/start 成功响应不应包含 code
    expect(response.body).toMatchObject({
      ok: true,
      ttlMs: 60_000,
      expiresAt: 170_000,
    });
    expect("code" in response.body).toBe(false);
  });

  it("POST /api/auth/verify/tell/finish 返回 token", async () => {
    const app = createAppWithAuth(createServiceStub());

    const response = await request(app)
      .post("/api/auth/verify/tell/finish")
      .send({ playerName: "Steve", code: "123456" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, token: "player-jwt-token" });
  });

  it("POST /api/auth/verify/manual/start 返回 challenge", async () => {
    const app = createAppWithAuth(createServiceStub());

    const response = await request(app)
      .post("/api/auth/verify/manual/start")
      .send({ playerName: "Alex" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      code: "654321",
      challenge: "#654321",
      ttlMs: 120_000,
      expiresAt: 230_000,
    });
  });

  it("POST /api/auth/verify/manual/confirm 返回 token", async () => {
    const app = createAppWithAuth(createServiceStub());

    const response = await request(app)
      .post("/api/auth/verify/manual/confirm")
      .send({ playerName: "Alex", code: "654321" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, token: "player-jwt-token-manual" });
  });

  it("POST /api/auth/verify/manual/confirm 缺少 code 时返回 INVALID_VERIFICATION", async () => {
    const app = createAppWithAuth(createServiceStub());

    const response = await request(app)
      .post("/api/auth/verify/manual/confirm")
      .send({ playerName: "Alex" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      ok: false,
      error: {
        code: "INVALID_VERIFICATION",
        message: "playerName 与 code 必填",
      },
    });
  });

  it("鉴权开关关闭时返回 AUTH_DISABLED", async () => {
    const app = createAppWithAuth(createServiceStub(), {
      authVerificationEnabled: false,
      authTellEnabled: false,
      authManualEnabled: false,
    });

    const tellStart = await request(app)
      .post("/api/auth/verify/tell/start")
      .send({ playerName: "Steve" });
    expect(tellStart.status).toBe(403);
    expect(tellStart.body).toEqual({
      ok: false,
      error: {
        code: "AUTH_DISABLED",
        message: "鉴权功能未启用",
      },
    });

    const manualStart = await request(app)
      .post("/api/auth/verify/manual/start")
      .send({ playerName: "Alex" });
    expect(manualStart.status).toBe(403);
    expect(manualStart.body.error.code).toBe("AUTH_DISABLED");
  });

  it("会话过期/替代/验证码错误都返回 INVALID_VERIFICATION", async () => {
    const app = createAppWithAuth(
      createServiceStub({
        finishTellVerification: async (playerName: string, code: string) => {
          const normalizedName = playerName.trim();
          if (normalizedName === "expired" && code === "111111") {
            return {
              ok: false,
              error: {
                code: "INVALID_VERIFICATION",
                message: "会话已过期",
              },
            };
          }
          if (normalizedName === "superseded" && code === "222222") {
            return {
              ok: false,
              error: {
                code: "INVALID_VERIFICATION",
                message: "会话已被替代",
              },
            };
          }
          return {
            ok: false,
            error: {
              code: "INVALID_VERIFICATION",
              message: "验证码错误",
            },
          };
        },
      }),
    );

    const expired = await request(app)
      .post("/api/auth/verify/tell/finish")
      .send({ playerName: "expired", code: "111111" });
    expect(expired.status).toBe(400);
    expect(expired.body.error.code).toBe("INVALID_VERIFICATION");

    const superseded = await request(app)
      .post("/api/auth/verify/tell/finish")
      .send({ playerName: "superseded", code: "222222" });
    expect(superseded.status).toBe(400);
    expect(superseded.body.error.code).toBe("INVALID_VERIFICATION");

    const wrongCode = await request(app)
      .post("/api/auth/verify/tell/finish")
      .send({ playerName: "wrong", code: "000000" });
    expect(wrongCode.status).toBe(400);
    expect(wrongCode.body.error.code).toBe("INVALID_VERIFICATION");
  });

  it("token 无效时返回 TOKEN_INVALID，且不出现 INVALID_TOKEN", async () => {
    const app = createAppWithAuth(
      createServiceStub({
        finishTellVerification: async () => ({
          ok: false,
          error: {
            code: "TOKEN_INVALID",
            message: "token 无效",
          },
        }),
      }),
    );

    const response = await request(app)
      .post("/api/auth/verify/tell/finish")
      .send({ playerName: "Steve", code: "000000" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("TOKEN_INVALID");
    expect(response.body.error.code).not.toBe("INVALID_TOKEN");
    expect(JSON.stringify(response.body)).not.toContain("INVALID_TOKEN");
  });
});

function createAppWithAuth(
  playerAuthService: PlayerAuthServiceLike,
  options?: {
    authVerificationEnabled?: boolean;
    authTellEnabled?: boolean;
    authManualEnabled?: boolean;
  },
) {
  // 通过 any 输入兼容 TDD 第一阶段：在路由尚未接入前先让测试表达目标行为。
  return createApp({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    auth: {
      playerAuthService,
      authVerificationEnabled: options?.authVerificationEnabled ?? true,
      authTellEnabled: options?.authTellEnabled ?? true,
      authManualEnabled: options?.authManualEnabled ?? true,
    },
  } as any);
}

function createServiceStub(overrides?: Partial<PlayerAuthServiceLike>): PlayerAuthServiceLike {
  return {
    startTellVerification:
      overrides?.startTellVerification ??
      (async () => ({
        ok: true,
        ttlMs: 60_000,
        expiresAt: 170_000,
      })),
    finishTellVerification:
      overrides?.finishTellVerification ??
      (async () => ({
        ok: true,
        token: "player-jwt-token",
      })),
    startManualVerification:
      overrides?.startManualVerification ??
      (async () => ({
        ok: true,
        code: "654321",
        challenge: "#654321",
        ttlMs: 120_000,
        expiresAt: 230_000,
      })),
    confirmManualVerification:
      overrides?.confirmManualVerification ??
      (async (_playerName: string, _code: string) => ({
        ok: true,
        token: "player-jwt-token-manual",
      })),
  };
}
