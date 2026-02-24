import { describe, expect, it } from "vitest";
import { SessionStore } from "../../../src/domain/session/SessionStore.js";

describe("SessionStore", () => {
  it("创建会话后支持按 id 和玩家名查询", () => {
    const store = new SessionStore();
    const session = store.createSession({
      sessionId: "s-1",
      playerName: "Steve",
      socketId: "socket-1",
      connectedAt: 100,
    });

    expect(store.getById(session.sessionId)?.playerName).toBe("Steve");
    expect(store.getByPlayerName("Steve")?.sessionId).toBe("s-1");
  });

  it("删除会话时清理名称索引", () => {
    const store = new SessionStore();
    store.createSession({
      sessionId: "s-1",
      playerName: "Steve",
      socketId: "socket-1",
      connectedAt: 100,
    });

    store.removeById("s-1");
    expect(store.getById("s-1")).toBeNull();
    expect(store.getByPlayerName("Steve")).toBeNull();
  });

  it("同名会话会以最新 session 覆盖名称索引", () => {
    const store = new SessionStore();
    store.createSession({
      sessionId: "s-1",
      playerName: "Steve",
      socketId: "socket-1",
      connectedAt: 100,
    });
    store.createSession({
      sessionId: "s-2",
      playerName: "Steve",
      socketId: "socket-2",
      connectedAt: 200,
    });

    expect(store.getByPlayerName("Steve")?.sessionId).toBe("s-2");
  });
});
