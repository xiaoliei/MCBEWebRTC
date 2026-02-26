import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { verifyBridgeJwtToken } from "../../../src/utils/jwt.js";

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

  it("缺少 token 时返回 MISSING_TOKEN", () => {
    const result = verifyBridgeJwtToken("", SECRET);
    expect(result).toEqual({ ok: false, reason: "MISSING_TOKEN" });
  });

  it("过期 token 返回 TOKEN_EXPIRED", () => {
    const token = jwt.sign({ role: "mc-bridge", gatewayId: "gw-expired" }, SECRET, {
      algorithm: "HS256",
      expiresIn: -1,
    });

    const result = verifyBridgeJwtToken(token, SECRET);
    expect(result).toEqual({ ok: false, reason: "TOKEN_EXPIRED" });
  });

  it("签名不匹配返回 INVALID_TOKEN", () => {
    const token = jwt.sign({ role: "mc-bridge", gatewayId: "gw-2" }, "other-secret", {
      algorithm: "HS256",
      expiresIn: "2h",
    });

    const result = verifyBridgeJwtToken(token, SECRET);
    expect(result).toEqual({ ok: false, reason: "INVALID_TOKEN" });
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
