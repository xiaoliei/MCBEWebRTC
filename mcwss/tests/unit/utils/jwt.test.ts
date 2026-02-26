import { describe, expect, it } from "vitest";
import { extractGatewayIdFromToken, issueBridgeJwt } from "../../../src/utils/jwt.js";

describe("issueBridgeJwt", () => {
  it("签发 token 并返回 gatewayId 与过期时间", () => {
    const issued = issueBridgeJwt("mcwss-secret-123456", "2h");

    expect(typeof issued.token).toBe("string");
    expect(issued.gatewayId.length).toBeGreaterThan(0);
    expect(issued.expiresAtMs).toBeGreaterThan(Date.now());
  });

  it("从 token 提取 gatewayId", () => {
    const issued = issueBridgeJwt("mcwss-secret-123456", "30m");
    const gatewayId = extractGatewayIdFromToken(issued.token);

    expect(gatewayId).toBe(issued.gatewayId);
  });

  it("非法 expiresIn 格式抛错", () => {
    expect(() => issueBridgeJwt("mcwss-secret-123456", "2hours")).toThrowError(
      /JWT_EXPIRES_IN 格式无效/,
    );
  });
});
