import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import {
  issuePlayerJwtToken,
  verifyBridgeJwtToken,
  verifyPlayerJwtToken,
} from "../../../src/utils/jwt.js";

const SECRET = "backend-jwt-secret-123456";

describe("verifyBridgeJwtToken", () => {
  it("验证通过时返回 payload", () => {
    const token = jwt.sign({ role: "mc-bridge", gatewayId: "gw-1" }, SECRET, {
      algorithm: "HS256",
      expiresIn: "2h",
    });

    const result = verifyBridgeJwtToken(token, SECRET);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.gatewayId).toBe("gw-1");
  });

  it("缺少 token 时返回 TOKEN_MISSING", () => {
    const result = verifyBridgeJwtToken("", SECRET);
    expect(result).toEqual({ ok: false, reason: "TOKEN_MISSING" });
  });

  it("过期 token 返回 TOKEN_EXPIRED", () => {
    const token = jwt.sign({ role: "mc-bridge", gatewayId: "gw-expired" }, SECRET, {
      algorithm: "HS256",
      expiresIn: -1,
    });

    const result = verifyBridgeJwtToken(token, SECRET);
    expect(result).toEqual({ ok: false, reason: "TOKEN_EXPIRED" });
  });

  it("签名不匹配返回 TOKEN_INVALID", () => {
    const token = jwt.sign({ role: "mc-bridge", gatewayId: "gw-2" }, "other-secret", {
      algorithm: "HS256",
      expiresIn: "2h",
    });

    const result = verifyBridgeJwtToken(token, SECRET);
    expect(result).toEqual({ ok: false, reason: "TOKEN_INVALID" });
  });

  it("角色不匹配返回 INVALID_ROLE", () => {
    const token = jwt.sign({ role: "client", gatewayId: "gw-3" }, SECRET, {
      algorithm: "HS256",
      expiresIn: "2h",
    });

    const result = verifyBridgeJwtToken(token, SECRET);
    expect(result).toEqual({ ok: false, reason: "INVALID_ROLE" });
  });
});

describe("player jwt", () => {
  it("成功签发并验签 player token，返回包含 jti/playerName/iat/exp 的 payload", () => {
    const token = issuePlayerJwtToken(SECRET, "2h", "Steve");

    const result = verifyPlayerJwtToken(token, SECRET);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(typeof result.payload.jti).toBe("string");
    expect(result.payload.jti.length).toBeGreaterThan(0);
    expect(result.payload.playerName).toBe("Steve");
    expect(typeof result.payload.iat).toBe("number");
    expect(typeof result.payload.exp).toBe("number");
  });

  it("缺少 token 返回 TOKEN_MISSING", () => {
    const result = verifyPlayerJwtToken("", SECRET);
    expect(result).toEqual({ ok: false, reason: "TOKEN_MISSING" });
  });

  it("过期返回 TOKEN_EXPIRED", () => {
    const expiredToken = issuePlayerJwtToken(SECRET, -1, "Alex");

    const result = verifyPlayerJwtToken(expiredToken, SECRET);
    expect(result).toEqual({ ok: false, reason: "TOKEN_EXPIRED" });
  });

  it("playerName 不匹配可由上层校验字段", () => {
    const token = issuePlayerJwtToken(SECRET, "2h", "Steve");

    const result = verifyPlayerJwtToken(token, SECRET);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    // 验签只保证 token 合法，业务层可基于 payload.playerName 做目标玩家校验。
    expect(result.payload.playerName).not.toBe("Alex");
    expect(result.payload.playerName).toBe("Steve");
  });

  it("非玩家角色返回 TOKEN_INVALID", () => {
    const token = jwt.sign({ role: "mc-bridge", playerName: "Steve", jti: "j-1" }, SECRET, {
      algorithm: "HS256",
      expiresIn: "2h",
    });

    const result = verifyPlayerJwtToken(token, SECRET);
    expect(result).toEqual({ ok: false, reason: "TOKEN_INVALID" });
  });

  it("payload 不完整返回 TOKEN_INVALID", () => {
    const token = jwt.sign({ role: "player", playerName: "Steve" }, SECRET, {
      algorithm: "HS256",
      expiresIn: "2h",
    });

    const result = verifyPlayerJwtToken(token, SECRET);
    expect(result).toEqual({ ok: false, reason: "TOKEN_INVALID" });
  });

  it("空格字符串 token 返回 TOKEN_MISSING", () => {
    const result = verifyPlayerJwtToken("   ", SECRET);
    expect(result).toEqual({ ok: false, reason: "TOKEN_MISSING" });
  });
});
