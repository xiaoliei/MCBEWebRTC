import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { authBridge } from "../../../src/signaling/middleware/authBridge.js";

const SECRET = "backend-jwt-secret-123456";

function createBridgeSocket(token: string) {
  return {
    handshake: {
      auth: {
        clientType: "mc-bridge",
        token,
      },
    },
  } as any;
}

describe("authBridge", () => {
  it("非 mc-bridge 客户端直接跳过", () => {
    const socket = {
      handshake: { auth: { clientType: "client", token: "ignored" } },
    } as any;

    const result = authBridge(socket, SECRET);
    expect(result).toEqual({ isBridge: false, authorized: false });
  });

  it("合法 JWT 认证成功并返回 gatewayId", () => {
    const token = jwt.sign({ role: "mc-bridge", gatewayId: "gw-auth-ok" }, SECRET, {
      algorithm: "HS256",
      expiresIn: "2h",
    });

    const result = authBridge(createBridgeSocket(token), SECRET);
    expect(result.authorized).toBe(true);
    expect(result.gatewayId).toBe("gw-auth-ok");
  });

  it("缺失 token 认证失败", () => {
    const result = authBridge(createBridgeSocket(""), SECRET);
    expect(result.authorized).toBe(false);
    expect(result.rejectReason).toBe("MISSING_TOKEN");
  });

  it("错误签名认证失败", () => {
    const token = jwt.sign(
      { role: "mc-bridge", gatewayId: "gw-auth-invalid" },
      "wrong-secret",
      {
        algorithm: "HS256",
        expiresIn: "2h",
      },
    );

    const result = authBridge(createBridgeSocket(token), SECRET);
    expect(result.authorized).toBe(false);
    expect(result.rejectReason).toBe("INVALID_TOKEN");
  });
});
