import { describe, expect, it } from "vitest";
import { readConfig } from "../../../src/config/readConfig.js";

describe("readConfig", () => {
  describe("默认值处理", () => {
    it("当环境变量未设置时使用默认值", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "valid-test-token",
      });

      expect(config.port).toBe(3000);
      expect(config.host).toBe("0.0.0.0");
      expect(config.iceServers).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
    });

    it("当 HOST 未设置时默认为 0.0.0.0", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "valid-test-token",
        PORT: "4000",
      });

      expect(config.host).toBe("0.0.0.0");
    });

    it("当 ICE_SERVERS 未设置时使用默认 STUN 服务器", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "valid-test-token",
      });

      expect(config.iceServers).toHaveLength(1);
      expect(config.iceServers[0].urls).toBe("stun:stun.l.google.com:19302");
    });
  });

  describe("端口解析", () => {
    it("解析自定义环境变量并读取 ICE 服务器列表", () => {
      const config = readConfig({
        PORT: "4567",
        HOST: "127.0.0.1",
        BRIDGE_TOKEN: "abc-token",
        ICE_SERVERS:
          '[{"urls":["turn:localhost:3478"],"username":"u","credential":"p"}]',
      });

      expect(config.port).toBe(4567);
      expect(config.host).toBe("127.0.0.1");
      expect(config.bridgeToken).toBe("abc-token");
      expect(config.iceServers).toEqual([
        {
          urls: ["turn:localhost:3478"],
          username: "u",
          credential: "p",
        },
      ]);
    });

    it("正确解析有效的端口号", () => {
      const config1 = readConfig({ PORT: "1", BRIDGE_TOKEN: "test-token" });
      expect(config1.port).toBe(1);

      const config2 = readConfig({ PORT: "65535", BRIDGE_TOKEN: "test-token" });
      expect(config2.port).toBe(65535);
    });

    it("当 PORT 为非数字时回退到默认端口", () => {
      const config = readConfig({ PORT: "invalid", BRIDGE_TOKEN: "test-token" });
      expect(config.port).toBe(3000);
    });

    it("当 PORT 超出范围时回退到默认端口", () => {
      const config1 = readConfig({ PORT: "0", BRIDGE_TOKEN: "test-token" });
      expect(config1.port).toBe(3000);

      const config2 = readConfig({ PORT: "65536", BRIDGE_TOKEN: "test-token" });
      expect(config2.port).toBe(3000);

      const config3 = readConfig({ PORT: "-1", BRIDGE_TOKEN: "test-token" });
      expect(config3.port).toBe(3000);
    });

    it("当 PORT 为浮点数时回退到默认端口", () => {
      const config = readConfig({ PORT: "3000.5", BRIDGE_TOKEN: "test-token" });
      expect(config.port).toBe(3000);
    });
  });

  describe("ICE 服务器配置解析", () => {
    it("解析单个 STUN 服务器", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "test-token",
        ICE_SERVERS: '[{"urls":"stun:stun.example.com:3478"}]',
      });

      expect(config.iceServers).toEqual([
        { urls: "stun:stun.example.com:3478" },
      ]);
    });

    it("解析多个 ICE 服务器", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "test-token",
        ICE_SERVERS: JSON.stringify([
          { urls: "stun:stun1.example.com:3478" },
          { urls: "stun:stun2.example.com:3478" },
        ]),
      });

      expect(config.iceServers).toHaveLength(2);
    });

    it("解析带认证的 TURN 服务器", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "test-token",
        ICE_SERVERS: JSON.stringify([
          {
            urls: ["turn:turn.example.com:3478"],
            username: "user",
            credential: "pass",
          },
        ]),
      });

      expect(config.iceServers[0].username).toBe("user");
      expect(config.iceServers[0].credential).toBe("pass");
    });

    it("当 ICE_SERVERS 非法 JSON 时抛出错误", () => {
      expect(() =>
        readConfig({ ICE_SERVERS: "{bad-json}", BRIDGE_TOKEN: "test-token" })
      ).toThrowError(/ICE_SERVERS 解析失败/);
    });

    it("当 ICE_SERVERS 不是数组时抛出错误", () => {
      expect(() =>
        readConfig({ ICE_SERVERS: '{"urls":"stun:stun.example.com"}', BRIDGE_TOKEN: "test-token" })
      ).toThrowError(/ICE_SERVERS.*必须是数组/);
    });

    it("当 ICE 服务器项缺少 urls 字段时抛出错误", () => {
      expect(() =>
        readConfig({ ICE_SERVERS: '[{}]', BRIDGE_TOKEN: "test-token" })
      ).toThrowError(/urls.*字段/);
    });

    it("当 urls 不是字符串时抛出错误", () => {
      expect(() =>
        readConfig({ ICE_SERVERS: '[{"urls":123}]', BRIDGE_TOKEN: "test-token" })
      ).toThrowError(/urls.*必须是字符串/);
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
      expect(() => readConfig({})).toThrowError(/BRIDGE_TOKEN.*环境变量未设置/);
    });

    it("当 BRIDGE_TOKEN 为空字符串时抛出错误", () => {
      expect(() => readConfig({ BRIDGE_TOKEN: "" })).toThrowError(/环境变量未设置/);
    });

    it("当 BRIDGE_TOKEN 仅为空格时抛出错误", () => {
      expect(() => readConfig({ BRIDGE_TOKEN: "   " })).toThrowError(/环境变量未设置/);
    });

    it("当 BRIDGE_TOKEN 使用占位符时抛出错误", () => {
      const placeholders = [
        "replace-with-strong-token",
        "your-secure-random-token-here",
        "change_me_in_production",
      ];

      for (const placeholder of placeholders) {
        expect(() => readConfig({ BRIDGE_TOKEN: placeholder })).toThrowError(/占位符/);
      }
    });

    it("占位符检测不区分大小写", () => {
      expect(() => readConfig({ BRIDGE_TOKEN: "CHANGE_ME_IN_PRODUCTION" }))
        .toThrowError(/占位符/);
      expect(() => readConfig({ BRIDGE_TOKEN: "Replace-With-Strong-Token" }))
        .toThrowError(/占位符/);
    });
  });

  describe("HOST 配置", () => {
    it("正确解析 HOST 配置", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "test-token",
        HOST: "192.168.1.100",
      });

      expect(config.host).toBe("192.168.1.100");
    });

    it("去除 HOST 前后空格", () => {
      const config = readConfig({
        BRIDGE_TOKEN: "test-token",
        HOST: "  localhost  ",
      });

      expect(config.host).toBe("localhost");
    });
  });
});
