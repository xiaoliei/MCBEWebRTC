import { describe, expect, it, vi } from "vitest";
import { handleClientJoin } from "../../../src/signaling/handlers/clientJoin.js";
import { handleBridgePositionUpdate } from "../../../src/signaling/handlers/bridgePosition.js";
import { handleWebRtcRelay } from "../../../src/signaling/handlers/webrtcRelay.js";
import { handlePresenceListReq } from "../../../src/signaling/handlers/presence.js";
import { SessionStore } from "../../../src/domain/session/SessionStore.js";
import { StateStore } from "../../../src/domain/state/StateStore.js";
import { ReconnectCodeStore } from "../../../src/domain/session/ReconnectCodeStore.js";

describe("signaling handlers", () => {
  it("client:join 成功后返回 connected", () => {
    const sessionStore = new SessionStore();
    const reconnectCodeStore = new ReconnectCodeStore();
    const emitSelf = vi.fn();

    const session = handleClientJoin(
      { playerName: "Steve" },
      {
        socketId: "sock-1",
        sessionStore,
        reconnectCodeStore,
        emitSelf,
        createSessionId: () => "s-1",
        nowProvider: () => 100,
      },
    );

    expect(session?.sessionId).toBe("s-1");
    expect(emitSelf).toHaveBeenCalledWith("connected", {
      sessionId: "s-1",
      playerName: "Steve",
    });
  });

  it("client:join 同名且无 code 时返回 DUPLICATE_NAME", () => {
    const sessionStore = new SessionStore();
    const reconnectCodeStore = new ReconnectCodeStore();
    const emitSelf = vi.fn();

    sessionStore.createSession({
      sessionId: "old",
      playerName: "Steve",
      socketId: "sock-old",
      connectedAt: 1,
    });

    const session = handleClientJoin(
      { playerName: "Steve" },
      {
        socketId: "sock-new",
        sessionStore,
        reconnectCodeStore,
        emitSelf,
        createSessionId: () => "s-2",
        generateReconnectCode: () => "654321",
        nowProvider: () => 100,
        reconnectCodeTtlMs: 60_000,
      },
    );

    expect(session).toBeNull();
    expect(emitSelf).toHaveBeenCalledWith(
      "connect:denied",
      expect.objectContaining({ reason: "DUPLICATE_NAME" }),
    );
    expect(reconnectCodeStore.getCode("Steve")?.code).toBe("654321");
  });

  it("bridge:position:update 会更新状态", () => {
    const stateStore = new StateStore();
    const ok = handleBridgePositionUpdate(
      {
        playerName: "Steve",
        position: { x: 1, y: 2, z: 3 },
        dim: 0,
        playerId: "pid",
      },
      { stateStore, nowProvider: () => 999 },
    );

    expect(ok).toBe(true);
    expect(stateStore.getPlayerByName("Steve")?.position).toEqual({
      x: 1,
      y: 2,
      z: 3,
    });
  });

  it("webrtc:* 会转发到目标 session", () => {
    const sessionStore = new SessionStore();
    const emitToSession = vi.fn();
    sessionStore.createSession({
      sessionId: "from",
      playerName: "A",
      socketId: "sock-a",
      connectedAt: 1,
    });
    sessionStore.createSession({
      sessionId: "to",
      playerName: "B",
      socketId: "sock-b",
      connectedAt: 1,
    });

    const ok = handleWebRtcRelay(
      "webrtc:offer",
      { toSessionId: "to", data: { sdp: "x" } },
      {
        fromSessionId: "from",
        sessionStore,
        emitToSession,
      },
    );

    expect(ok).toBe(true);
    expect(emitToSession).toHaveBeenCalledWith("to", "webrtc:offer", {
      fromSessionId: "from",
      data: { sdp: "x" },
    });
  });

  it("presence:list:req 返回同维度在线玩家", () => {
    const sessionStore = new SessionStore();
    const stateStore = new StateStore();
    const emitSelf = vi.fn();

    sessionStore.createSession({
      sessionId: "s1",
      playerName: "A",
      socketId: "sa",
      connectedAt: 1,
    });
    sessionStore.createSession({
      sessionId: "s2",
      playerName: "B",
      socketId: "sb",
      connectedAt: 1,
    });
    sessionStore.createSession({
      sessionId: "s3",
      playerName: "C",
      socketId: "sc",
      connectedAt: 1,
    });

    stateStore.upsertPlayer({
      playerName: "A",
      position: { x: 0, y: 0, z: 0 },
      dim: 0,
      now: 1,
    });
    stateStore.upsertPlayer({
      playerName: "B",
      position: { x: 1, y: 0, z: 0 },
      dim: 0,
      now: 1,
    });
    stateStore.upsertPlayer({
      playerName: "C",
      position: { x: 1, y: 0, z: 0 },
      dim: 1,
      now: 1,
    });

    handlePresenceListReq({
      requestSessionId: "s1",
      sessionStore,
      stateStore,
      emitSelf,
    });

    expect(emitSelf).toHaveBeenCalledWith("presence:list:res", {
      players: [
        {
          sessionId: "s2",
          playerName: "B",
          position: { x: 1, y: 0, z: 0 },
          dim: 0,
        },
      ],
    });
  });
});
