import { describe, expect, it, vi } from "vitest";
import { InMemoryPlayerTokenWhitelistStore } from "../../../../src/domain/auth/InMemoryPlayerTokenWhitelistStore.js";

describe("InMemoryPlayerTokenWhitelistStore", () => {
  it("issue 后可命中", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    const store = new InMemoryPlayerTokenWhitelistStore();
    const record = store.issue("Steve", "jti-1", 10_000);

    expect(record.playerName).toBe("Steve");
    expect(record.jti).toBe("jti-1");
    expect(record.issuedAt).toBe(1_000);
    expect(store.getByJti("jti-1")?.playerName).toBe("Steve");
    expect(store.isActive("jti-1")).toBe(true);

    vi.useRealTimers();
  });

  it("过期时 isActive 返回 false", () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);

    const store = new InMemoryPlayerTokenWhitelistStore();
    store.issue("Alex", "jti-expired", 1_500);

    expect(store.isActive("jti-expired")).toBe(false);

    vi.useRealTimers();
  });

  it("revoke 后失效", () => {
    vi.useFakeTimers();
    vi.setSystemTime(3_000);

    const store = new InMemoryPlayerTokenWhitelistStore();
    store.issue("Notch", "jti-revoke", 10_000);

    const revoked = store.revoke("jti-revoke", "manual revoke");

    expect(revoked).not.toBeNull();
    expect(revoked?.revokedAt).toBe(3_000);
    expect(revoked?.revokeReason).toBe("manual revoke");
    expect(store.isActive("jti-revoke")).toBe(false);

    vi.useRealTimers();
  });

  it("deleteExpired 会清理过期记录", () => {
    vi.useFakeTimers();
    vi.setSystemTime(4_000);

    const store = new InMemoryPlayerTokenWhitelistStore();
    store.issue("PlayerA", "jti-old", 3_999);
    // 第一次 issue 会清理掉已过期的 jti-old
    store.issue("PlayerA", "jti-new", 9_000);

    // 此时 jti-old 已在上一次 issue 时被懒清理，deleteExpired 返回 0
    const deleted = store.deleteExpired();

    expect(deleted).toBe(0);
    expect(store.getByJti("jti-old")).toBeNull();
    expect(store.getByJti("jti-new")?.jti).toBe("jti-new");

    vi.useRealTimers();
  });

  it("惰性删除场景：查询时发现过期后可以移除", () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);

    const store = new InMemoryPlayerTokenWhitelistStore();
    store.issue("PlayerB", "jti-lazy", 4_000);

    expect(store.getByJti("jti-lazy")).toBeNull();
    expect(store.removeByJti("jti-lazy")).toBe(false);
    expect(store.deleteExpired()).toBe(0);

    vi.useRealTimers();
  });

  describe("懒清理", () => {
    it("issue 应调用 deleteExpired", () => {
      const store = new InMemoryPlayerTokenWhitelistStore();
      const deleteExpiredSpy = vi.spyOn(store as any, "deleteExpired");

      store.issue("Player1", "jti-1", Date.now() + 60000);

      expect(deleteExpiredSpy).toHaveBeenCalled();
    });
  });
});
