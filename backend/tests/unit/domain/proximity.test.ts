import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StateStore } from "../../../src/domain/state/StateStore.js";
import { SessionStore } from "../../../src/domain/session/SessionStore.js";
import { startProximityService } from "../../../src/domain/proximity/startProximityService.js";

describe("startProximityService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("仅推送同维度且在半径内的玩家", () => {
    const stateStore = new StateStore();
    const sessionStore = new SessionStore();
    const emitNearby = vi.fn();

    sessionStore.createSession({
      sessionId: "s1",
      playerName: "A",
      socketId: "sock-a",
      connectedAt: Date.now(),
    });
    sessionStore.createSession({
      sessionId: "s2",
      playerName: "B",
      socketId: "sock-b",
      connectedAt: Date.now(),
    });
    sessionStore.createSession({
      sessionId: "s3",
      playerName: "C",
      socketId: "sock-c",
      connectedAt: Date.now(),
    });

    stateStore.upsertPlayer({
      playerName: "A",
      position: { x: 0, y: 0, z: 0 },
      dim: 0,
      now: Date.now(),
    });
    stateStore.upsertPlayer({
      playerName: "B",
      position: { x: 3, y: 0, z: 4 },
      dim: 0,
      now: Date.now(),
    });
    stateStore.upsertPlayer({
      playerName: "C",
      position: { x: 1, y: 0, z: 1 },
      dim: 1,
      now: Date.now(),
    });

    const stop = startProximityService({
      stateStore,
      sessionStore,
      callRadius: 5,
      tickMs: 100,
      gamePlayerTtlMs: 10_000,
      emitNearby,
    });

    vi.advanceTimersByTime(120);

    const emitForA = emitNearby.mock.calls.find((call) => call[0] === "s1");
    expect(emitForA).toBeTruthy();
    expect(
      emitForA?.[1].map((item: { sessionId: string }) => item.sessionId),
    ).toEqual(["s2"]);

    stop();
  });

  it("邻近列表不变化时不会重复推送", () => {
    const stateStore = new StateStore();
    const sessionStore = new SessionStore();
    const emitNearby = vi.fn();

    sessionStore.createSession({
      sessionId: "s1",
      playerName: "A",
      socketId: "sock-a",
      connectedAt: Date.now(),
    });
    sessionStore.createSession({
      sessionId: "s2",
      playerName: "B",
      socketId: "sock-b",
      connectedAt: Date.now(),
    });
    stateStore.upsertPlayer({
      playerName: "A",
      position: { x: 0, y: 0, z: 0 },
      dim: 0,
      now: Date.now(),
    });
    stateStore.upsertPlayer({
      playerName: "B",
      position: { x: 1, y: 0, z: 1 },
      dim: 0,
      now: Date.now(),
    });

    const stop = startProximityService({
      stateStore,
      sessionStore,
      callRadius: 5,
      tickMs: 100,
      gamePlayerTtlMs: 10_000,
      emitNearby,
    });

    vi.advanceTimersByTime(120);
    const firstCount = emitNearby.mock.calls.length;

    vi.advanceTimersByTime(500);
    expect(emitNearby.mock.calls.length).toBe(firstCount);

    stop();
  });
});
