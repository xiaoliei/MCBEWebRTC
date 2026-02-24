import { describe, expect, it } from "vitest";
import { readConfig } from "../../../src/config/readConfig.js";

describe("readConfig", () => {
  it("在未提供环境变量时返回默认配置", () => {
    const config = readConfig({});

    expect(config.port).toBe(3000);
    expect(config.host).toBe("0.0.0.0");
    expect(config.bridgeToken).toBe("replace-with-strong-token");
    expect(config.iceServers).toEqual([
      { urls: "stun:stun.l.google.com:19302" },
    ]);
  });

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

  it("当 PORT 非法时回退到默认端口", () => {
    const config = readConfig({ PORT: "0" });
    expect(config.port).toBe(3000);
  });

  it("当 ICE_SERVERS 非法 JSON 时抛出错误", () => {
    expect(() => readConfig({ ICE_SERVERS: "{bad-json}" })).toThrowError(
      /ICE_SERVERS/i,
    );
  });
});
