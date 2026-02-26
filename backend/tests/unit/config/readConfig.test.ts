import { describe, expect, it } from "vitest";
import { readConfig } from "../../../src/config/readConfig.js";

describe("readConfig", () => {
  describe("默认值处理", () => {
    it("当环境变量未设置时使用默认值", () => {
      const config = readConfig({
        BRIDGE_JWT_SECRET: "valid-test-secret-1234",
      });

      expect(config.port).toBe(3000);
      expect(config.host).toBe("0.0.0.0");
      expect(config.jwtExpiresIn).toBe("2h");
      expect(config.iceServers).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
    });
  });

  describe("端口解析", () => {
    it("解析有效端口", () => {
      expect(
        readConfig({ PORT: "1", BRIDGE_JWT_SECRET: "test-secret-123456" }).port,
      ).toBe(1);
      expect(
        readConfig({ PORT: "65535", BRIDGE_JWT_SECRET: "test-secret-123456" }).port,
      ).toBe(65535);
    });

    it("非法端口回退默认值", () => {
      expect(
        readConfig({ PORT: "invalid", BRIDGE_JWT_SECRET: "test-secret-123456" })
          .port,
      ).toBe(3000);
      expect(
        readConfig({ PORT: "0", BRIDGE_JWT_SECRET: "test-secret-123456" }).port,
      ).toBe(3000);
    });
  });

  describe("ICE 配置解析", () => {
    it("解析合法 ICE_SERVERS", () => {
      const config = readConfig({
        BRIDGE_JWT_SECRET: "test-secret-123456",
        ICE_SERVERS:
          '[{"urls":["turn:localhost:3478"],"username":"u","credential":"p"}]',
      });

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
        readConfig({
          ICE_SERVERS: "{bad-json}",
          BRIDGE_JWT_SECRET: "test-secret-123456",
        }),
      ).toThrowError(/ICE_SERVERS 解析失败/);
    });
  });

  describe("BRIDGE_JWT_SECRET 验证", () => {
    it("接受有效密钥并去除空格", () => {
      const config = readConfig({ BRIDGE_JWT_SECRET: "  valid-secret-123456  " });
      expect(config.bridgeJwtSecret).toBe("valid-secret-123456");
    });

    it("空值时报错", () => {
      expect(() => readConfig({})).toThrowError(/BRIDGE_JWT_SECRET.*未设置/);
      expect(() => readConfig({ BRIDGE_JWT_SECRET: "   " })).toThrowError(
        /BRIDGE_JWT_SECRET.*未设置/,
      );
    });

    it("占位符时报错", () => {
      expect(() =>
        readConfig({ BRIDGE_JWT_SECRET: "change_me_in_production" }),
      ).toThrowError(/占位符/);
    });

    it("长度不足时报错", () => {
      expect(() => readConfig({ BRIDGE_JWT_SECRET: "short-secret" })).toThrowError(
        /至少需要 16 个字符/,
      );
    });
  });

  describe("JWT_EXPIRES_IN", () => {
    it("支持常见格式", () => {
      expect(
        readConfig({
          BRIDGE_JWT_SECRET: "test-secret-123456",
          JWT_EXPIRES_IN: "30m",
        }).jwtExpiresIn,
      ).toBe("30m");
      expect(
        readConfig({
          BRIDGE_JWT_SECRET: "test-secret-123456",
          JWT_EXPIRES_IN: "2h",
        }).jwtExpiresIn,
      ).toBe("2h");
    });

    it("格式非法时报错", () => {
      expect(() =>
        readConfig({
          BRIDGE_JWT_SECRET: "test-secret-123456",
          JWT_EXPIRES_IN: "2hours",
        }),
      ).toThrowError(/JWT_EXPIRES_IN 格式无效/);
    });
  });
});
