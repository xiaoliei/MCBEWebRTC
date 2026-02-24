import { describe, expect, it } from "vitest";
import { readConfig } from "../../../src/config/readConfig.js";

describe("readConfig", () => {
  describe("默认值处理", () => {
    it("当环境变量未设置时使用默认值", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "valid-test-token",
      });

      expect(config.backendUrl).toBe("http://127.0.0.1:3000");
      expect(config.gatewayPort).toBe(8000);
      expect(config.debug).toBe(false);
    });

    it("当 BACKEND_URL 未设置时默认为本地地址", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "valid-test-token",
      });

      expect(config.backendUrl).toBe("http://127.0.0.1:3000");
    });

    it("当 GATEWAY_PORT 未设置时默认为 8000", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "valid-test-token",
      });

      expect(config.gatewayPort).toBe(8000);
    });

    it("当 DEBUG 未设置时默认为 false", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "valid-test-token",
      });

      expect(config.debug).toBe(false);
    });
  });

  describe("端口解析", () => {
    it("正确解析有效的端口号", () => {
      const config1 = readConfig({
        BRIDGE_TOKEN: "test-token",
        GATEWAY_PORT: "9000",
      });
      expect(config1.gatewayPort).toBe(9000);

      const config2 = readConfig({
        BRIDGE_TOKEN: "test-token",
        GATEWAY_PORT: "1",
      });
      expect(config2.gatewayPort).toBe(1);

      const config3 = readConfig({
        BRIDGE_TOKEN: "test-token",
        GATEWAY_PORT: "65535",
      });
      expect(config3.gatewayPort).toBe(65535);
    });

    it("当 PORT 为非数字时回退到默认端口", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "test-token",
        GATEWAY_PORT: "invalid",
      });
      expect(config.gatewayPort).toBe(8000);
    });

    it("当 PORT 超出范围时回退到默认端口", () => {
      const config1 = readConfig({
        BRIDGE_TOKEN: "test-token",
        GATEWAY_PORT: "0",
      });
      expect(config1.gatewayPort).toBe(8000);

      const config2 = readConfig({
        BRIDGE_TOKEN: "test-token",
        GATEWAY_PORT: "65536",
      });
      expect(config2.gatewayPort).toBe(8000);

      const config3 = readConfig({
        BRIDGE_TOKEN: "test-token",
        GATEWAY_PORT: "-1",
      });
      expect(config3.gatewayPort).toBe(8000);
    });

    it("当 PORT 为浮点数时回退到默认端口", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "test-token",
        GATEWAY_PORT: "8000.5",
      });
      expect(config.gatewayPort).toBe(8000);
    });
  });

  describe("后端 URL 解析", () => {
    it("正确解析 BACKEND_URL", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "test-token",
        BACKEND_URL: "https://example.com:4000",
      });

      expect(config.backendUrl).toBe("https://example.com:4000");
    });

    it("去除 URL 末尾的斜杠", () => {
      const config1 = readConfig({
        BRIDGE_TOKEN: "test-token",
        BACKEND_URL: "http://localhost:3000/",
      });
      expect(config1.backendUrl).toBe("http://localhost:3000");

      const config2 = readConfig({
        BRIDGE_TOKEN: "test-token",
        BACKEND_URL: "http://localhost:3000///",
      });
      expect(config2.backendUrl).toBe("http://localhost:3000");
    });

    it("去除 URL 前后空格", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "test-token",
        BACKEND_URL: "  http://localhost:3000  ",
      });

      expect(config.backendUrl).toBe("http://localhost:3000");
    });
  });

  describe("布尔值解析", () => {
    it("解析各种表示 true 的值", () => {
      const trueValues = ["1", "true", "True", "TRUE", "yes", "Yes", "on", "On"];

      for (const value of trueValues) {
        const config = readConfig({
          BRIDGE_TOKEN: "test-token",
          DEBUG: value,
        });
        expect(config.debug).toBe(true);
      }
    });

    it("解析各种表示 false 的值", () => {
      const falseValues = ["0", "false", "False", "FALSE", "no", "No", "off", "Off", "", "random"];

      for (const value of falseValues) {
        const config = readConfig({
          BRIDGE_TOKEN: "test-token",
          DEBUG: value,
        });
        expect(config.debug).toBe(false);
      }
    });

    it("布尔值解析不区分大小写", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "test-token",
        DEBUG: "TRUE",
      });
      expect(config.debug).toBe(true);
    });

    it("去除布尔值前后空格", () => {
      const config1 = readConfig({
        BRIDGE_TOKEN: "test-token",
        DEBUG: "  true  ",
      });
      expect(config1.debug).toBe(true);

      const config2 = readConfig({
        BRIDGE_TOKEN: "test-token",
        DEBUG: "  1  ",
      });
      expect(config2.debug).toBe(true);
    });
  });

  describe("BRIDGE_TOKEN 验证", () => {
    it("接受有效的 token", () => {
      const config = readConfig({ BRIDGE_TOKEN: "valid-secure-token-123" });
      expect(config.bridgeToken).toBe("valid-secure-token-123");
    });

    it("去除 token 前后空格", () => {
      const config = readConfig({ BRIDGE_TOKEN: "  valid-token  " });
      expect(config.bridgeToken).toBe("valid-token");
    });

    it("当 BRIDGE_TOKEN 未设置时抛出错误", () => {
      expect(() => readConfig({})).toThrowError(/BRIDGE_TOKEN is required/);
    });

    it("当 BRIDGE_TOKEN 为空字符串时抛出错误", () => {
      expect(() => readConfig({ BRIDGE_TOKEN: "" })).toThrowError(/BRIDGE_TOKEN is required/);
    });

    it("当 BRIDGE_TOKEN 仅为空格时抛出错误", () => {
      expect(() => readConfig({ BRIDGE_TOKEN: "   " })).toThrowError(/BRIDGE_TOKEN is required/);
    });

    it("当 BRIDGE_TOKEN 使用占位符时抛出错误", () => {
      const placeholders = [
        "change_me_in_production",
        "replace-with-strong-token",
        "your-secure-random-token-here",
        "your-token-here",
        "change-me",
        "example-token",
      ];

      for (const placeholder of placeholders) {
        expect(() => readConfig({ BRIDGE_TOKEN: placeholder }))
          .toThrowError(/placeholder/);
      }
    });

    it("占位符检测不区分大小写", () => {
      expect(() => readConfig({ BRIDGE_TOKEN: "CHANGE_ME_IN_PRODUCTION" }))
        .toThrowError(/placeholder/);
      expect(() => readConfig({ BRIDGE_TOKEN: "REPLACE-WITH-STRONG-TOKEN" }))
        .toThrowError(/placeholder/);
    });
  });

  describe("综合配置", () => {
    it("正确解析完整的配置", () => {
      const config = readConfig({
        BACKEND_URL: "https://api.example.com:4000/",
        BRIDGE_TOKEN: "secure-token-abc123",
        GATEWAY_PORT: "9000",
        DEBUG: "true",
      });

      expect(config.backendUrl).toBe("https://api.example.com:4000");
      expect(config.bridgeToken).toBe("secure-token-abc123");
      expect(config.gatewayPort).toBe(9000);
      expect(config.debug).toBe(true);
    });
  });
});
