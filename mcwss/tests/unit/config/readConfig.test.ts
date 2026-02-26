import { describe, expect, it } from "vitest";
import { readConfig } from "../../../src/config/readConfig.js";

describe("readConfig", () => {
  it("默认值正确", () => {
    const config = readConfig({
      BRIDGE_JWT_SECRET: "valid-test-secret-1234",
    });

    expect(config.backendUrl).toBe("http://127.0.0.1:3000");
    expect(config.gatewayPort).toBe(8000);
    expect(config.debug).toBe(false);
    expect(config.jwtExpiresIn).toBe("2h");
  });

  it("解析完整配置", () => {
    const config = readConfig({
      BACKEND_URL: "https://api.example.com:4000/",
      BRIDGE_JWT_SECRET: "secure-secret-123456",
      JWT_EXPIRES_IN: "45m",
      GATEWAY_PORT: "9000",
      DEBUG: "true",
    });

    expect(config.backendUrl).toBe("https://api.example.com:4000");
    expect(config.bridgeJwtSecret).toBe("secure-secret-123456");
    expect(config.jwtExpiresIn).toBe("45m");
    expect(config.gatewayPort).toBe(9000);
    expect(config.debug).toBe(true);
  });

  it("BRIDGE_JWT_SECRET 为空时报错", () => {
    expect(() => readConfig({})).toThrowError(/BRIDGE_JWT_SECRET is required/);
  });

  it("BRIDGE_JWT_SECRET 占位符时报错", () => {
    expect(() =>
      readConfig({ BRIDGE_JWT_SECRET: "change_me_in_production" }),
    ).toThrowError(/placeholder/);
  });

  it("BRIDGE_JWT_SECRET 长度不足时报错", () => {
    expect(() =>
      readConfig({ BRIDGE_JWT_SECRET: "short-secret" }),
    ).toThrowError(/at least 16 characters/);
  });

  it("JWT_EXPIRES_IN 非法格式时报错", () => {
    expect(() =>
      readConfig({
        BRIDGE_JWT_SECRET: "secure-secret-123456",
        JWT_EXPIRES_IN: "2hours",
      }),
    ).toThrowError(/JWT_EXPIRES_IN format is invalid/);
  });
});
