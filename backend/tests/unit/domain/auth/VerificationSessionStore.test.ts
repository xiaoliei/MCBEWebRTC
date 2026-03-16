import { describe, expect, it, vi } from "vitest";
import { InMemoryVerificationSessionStore } from "../../../../src/domain/auth/InMemoryVerificationSessionStore.js";

describe("InMemoryVerificationSessionStore", () => {
  it("创建 /tell 会话", () => {
    const store = new InMemoryVerificationSessionStore();
    const record = store.createOrReplace("Steve", "tell", "123456", 2_000);

    expect(record.playerName).toBe("Steve");
    expect(record.mode).toBe("tell");
    expect(record.code).toBe("123456");
    expect(record.status).toBe("active");
    expect(record.createdAt).toBeTypeOf("number");
    expect(record.expiresAt).toBe(2_000);
    expect(store.getActiveByPlayerName("Steve")?.code).toBe("123456");
  });

  it("同玩家再次创建新会话会把旧会话标记为 superseded", () => {
    const store = new InMemoryVerificationSessionStore();
    const first = store.createOrReplace("Alex", "tell", "111111", 10_000);
    const second = store.createOrReplace("Alex", "tell", "222222", 20_000);

    expect(first.status).toBe("superseded");
    expect(first.supersededAt).toBeTypeOf("number");
    expect(second.status).toBe("active");
    expect(store.getActiveByPlayerName("Alex")?.code).toBe("222222");
  });

  it("manual 会话命中游戏消息后变为 game_confirmed", () => {
    const store = new InMemoryVerificationSessionStore();
    store.createOrReplace("Herobrine", "manual", "654321", 10_000);

    const updated = store.markGameConfirmed("Herobrine");

    expect(updated?.status).toBe("game_confirmed");
    expect(updated?.gameConfirmedAt).toBeTypeOf("number");
  });

  it("前端确认后记录 frontendConfirmedAt", () => {
    const store = new InMemoryVerificationSessionStore();
    store.createOrReplace("Notch", "manual", "777777", 10_000);

    const updated = store.markFrontendConfirmed("Notch");

    expect(updated?.status).toBe("frontend_confirmed");
    expect(updated?.frontendConfirmedAt).toBeTypeOf("number");
  });

  it("过期清理应删除所有过期状态会话", () => {
    const store = new InMemoryVerificationSessionStore();

    store.createOrReplace("ExpiredSuperseded", "tell", "100001", 1);
    store.markSuperseded("ExpiredSuperseded");

    store.createOrReplace("ExpiredVerified", "tell", "100002", 1);
    store.markVerified("ExpiredVerified");

    store.createOrReplace("ExpiredGameConfirmed", "manual", "100003", 1);
    store.markGameConfirmed("ExpiredGameConfirmed");

    store.createOrReplace("ExpiredFrontendConfirmed", "manual", "100004", 1);
    store.markFrontendConfirmed("ExpiredFrontendConfirmed");

    store.createOrReplace("FutureActive", "tell", "100005", Number.MAX_SAFE_INTEGER);

    store.deleteExpired();

    expect(store.markVerified("ExpiredSuperseded")).toBeNull();
    expect(store.markVerified("ExpiredVerified")).toBeNull();
    expect(store.markVerified("ExpiredGameConfirmed")).toBeNull();
    expect(store.markVerified("ExpiredFrontendConfirmed")).toBeNull();
    expect(store.getActiveByPlayerName("FutureActive")?.status).toBe("active");
  });

  describe("懒清理", () => {
    it("createOrReplace 应调用 deleteExpired", () => {
      const store = new InMemoryVerificationSessionStore();
      const deleteExpiredSpy = vi.spyOn(store as any, "deleteExpired");

      store.createOrReplace("Player1", "tell", "123456", Date.now() + 60000);

      expect(deleteExpiredSpy).toHaveBeenCalled();
    });
  });
});
