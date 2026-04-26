import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../src/http/createApp.js";

interface PlayerAuthServiceLike {
  startTellVerification(playerName: string): Promise<any>;
  finishTellVerification(playerName: string, code: string): Promise<any>;
  startManualVerification(playerName: string): Promise<any>;
  confirmManualVerification(playerName: string, code: string): Promise<any>;
}

describe("CORS 中间件", () => {
  it("OPTIONS 预检请求返回 Access-Control-Allow-Origin 头", async () => {
    const app = createAppWithAuth(createServiceStub());

    const response = await request(app)
      .options("/api/auth/verify/tell/start")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST");

    // 预检请求应返回 204（cors 库默认行为）
    expect(response.status).toBe(204);
    // cors() 默认配置返回 *，表示允许所有来源
    expect(response.headers["access-control-allow-origin"]).toBeDefined();
  });

  it("普通 POST 请求的响应包含 CORS 头", async () => {
    const app = createAppWithAuth(createServiceStub());

    const response = await request(app)
      .post("/api/auth/verify/tell/start")
      .set("Origin", "http://localhost:5173")
      .send({ playerName: "Steve" });

    expect(response.status).toBe(200);
    // cors() 默认配置返回 *，表示允许所有来源
    expect(response.headers["access-control-allow-origin"]).toBeDefined();
  });

  it("不带 Origin 的请求也能正常响应（非浏览器调用）", async () => {
    const app = createAppWithAuth(createServiceStub());

    const response = await request(app)
      .post("/api/auth/verify/tell/start")
      .send({ playerName: "Steve" });

    expect(response.status).toBe(200);
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
