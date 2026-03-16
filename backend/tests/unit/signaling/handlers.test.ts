import { describe, expect, it, vi } from "vitest";
import { handleClientJoin } from "../../../src/signaling/handlers/clientJoin.js";
import { handleBridgePositionUpdate } from "../../../src/signaling/handlers/bridgePosition.js";
import { handleWebRtcRelay } from "../../../src/signaling/handlers/webrtcRelay.js";
import { handlePresenceListReq } from "../../../src/signaling/handlers/presence.js";
import { SessionStore } from "../../../src/domain/session/SessionStore.js";
import { StateStore } from "../../../src/domain/state/StateStore.js";

describe("signaling handlers", () => {
  it("client:join 开启鉴权且未传 token 时返回 TOKEN_MISSING", () => {
    const sessionStore = new SessionStore();
    const emitSelf = vi.fn();

    const session = handleClientJoin(
      { playerName: "Steve" },
      {
        socketId: "sock-1",
        sessionStore,
        emitSelf,
        requirePlayerTokenAuth: true,
        playerAuthService: {
          validatePlayerToken: vi.fn(),
        },
        createSessionId: () => "s-1",
        nowProvider: () => 100,
      },
    );

    expect(session).toBeNull();
    expect(emitSelf).toHaveBeenCalledWith(
      "connect:denied",
      expect.objectContaining({ reason: "TOKEN_MISSING" }),
    );
  });

  it("client:join 有效 token 且无旧连接时成功", () => {
    const sessionStore = new SessionStore();
    const emitSelf = vi.fn();

    const session = handleClientJoin(
      { playerName: "Steve", token: "valid-token" },
      {
        socketId: "sock-1",
        sessionStore,
        emitSelf,
        requirePlayerTokenAuth: true,
        playerAuthService: {
          validatePlayerToken: vi.fn(() => ({
            ok: true as const,
            playerName: "Steve",
            jti: "jti-1",
          })),
        },
        createSessionId: () => "s-1",
        nowProvider: () => 100,
      },
    );

    expect(session?.sessionId).toBe("s-1");
    expect(session?.replacedSession).toBeNull();
    expect(emitSelf).toHaveBeenCalledWith("connected", {
      sessionId: "s-1",
      playerName: "Steve",
    });
  });

  it("client:join 有效 token 且玩家已在线但未传 forceReplace 时返回 FORCE_REPLACE_REQUIRED", () => {
    const sessionStore = new SessionStore();
    const emitSelf = vi.fn();

    sessionStore.createSession({
      sessionId: "old",
      playerName: "Steve",
      socketId: "sock-old",
      connectedAt: 1,
    });

    const session = handleClientJoin(
      { playerName: "Steve", token: "valid-token" },
      {
        socketId: "sock-new",
        sessionStore,
        emitSelf,
        requirePlayerTokenAuth: true,
        playerAuthService: {
          validatePlayerToken: vi.fn(() => ({
            ok: true as const,
            playerName: "Steve",
            jti: "jti-1",
          })),
        },
        createSessionId: () => "s-2",
        nowProvider: () => 100,
      },
    );

    expect(session).toBeNull();
    expect(emitSelf).toHaveBeenCalledWith(
      "connect:denied",
      expect.objectContaining({ reason: "FORCE_REPLACE_REQUIRED" }),
    );
  });

  it("client:join 有效 token 且 forceReplace=true 时替换旧连接", () => {
    const sessionStore = new SessionStore();
    const emitSelf = vi.fn();

    sessionStore.createSession({
      sessionId: "old",
      playerName: "Steve",
      socketId: "sock-old",
      connectedAt: 1,
    });

    const session = handleClientJoin(
      { playerName: "Steve", token: "valid-token", forceReplace: true },
      {
        socketId: "sock-new",
        sessionStore,
        emitSelf,
        requirePlayerTokenAuth: true,
        playerAuthService: {
          validatePlayerToken: vi.fn(() => ({
            ok: true as const,
            playerName: "Steve",
            jti: "jti-1",
          })),
        },
        createSessionId: () => "s-2",
        nowProvider: () => 100,
      },
    );

    expect(session?.sessionId).toBe("s-2");
    expect(session?.replacedSession).toEqual(
      expect.objectContaining({
        sessionId: "old",
        playerName: "Steve",
        socketId: "sock-old",
      }),
    );
    expect(sessionStore.getById("old")).toBeNull();
    expect(sessionStore.getById("s-2")).not.toBeNull();
  });

  it("client:join 关闭鉴权时 forceReplace=true 也可以替换旧连接", () => {
    const sessionStore = new SessionStore();
    const emitSelf = vi.fn();

    sessionStore.createSession({
      sessionId: "old",
      playerName: "Steve",
      socketId: "sock-old",
      connectedAt: 1,
    });

    const denied = handleClientJoin(
      { playerName: "Steve" },
      {
        socketId: "sock-new",
        sessionStore,
        emitSelf,
        requirePlayerTokenAuth: false,
        createSessionId: () => "s-2",
        nowProvider: () => 100,
      },
    );

    expect(denied).toBeNull();
    expect(emitSelf).toHaveBeenLastCalledWith(
      "connect:denied",
      expect.objectContaining({ reason: "FORCE_REPLACE_REQUIRED" }),
    );

    const joined = handleClientJoin(
      { playerName: "Steve", forceReplace: true },
      {
        socketId: "sock-new",
        sessionStore,
        emitSelf,
        requirePlayerTokenAuth: false,
        createSessionId: () => "s-2",
        nowProvider: () => 100,
      },
    );

    expect(joined?.sessionId).toBe("s-2");
    expect(joined?.replacedSession).toEqual(
      expect.objectContaining({
        sessionId: "old",
        playerName: "Steve",
      }),
    );
    expect(sessionStore.getById("old")).toBeNull();
    expect(sessionStore.getById("s-2")).not.toBeNull();
  });

  it("client:join 无效 token 且 forceReplace=true 时返回 TOKEN_INVALID", () => {
    const sessionStore = new SessionStore();
    const emitSelf = vi.fn();

    sessionStore.createSession({
      sessionId: "old",
      playerName: "Steve",
      socketId: "sock-old",
      connectedAt: 1,
    });

    const session = handleClientJoin(
      { playerName: "Steve", token: "invalid-token", forceReplace: true },
      {
        socketId: "sock-new",
        sessionStore,
        emitSelf,
        requirePlayerTokenAuth: true,
        playerAuthService: {
          validatePlayerToken: vi.fn(() => ({
            ok: false as const,
            error: {
              code: "TOKEN_INVALID" as const,
              message: "token 无效",
            },
          })),
        },
        createSessionId: () => "s-2",
        nowProvider: () => 100,
      },
    );

    expect(session).toBeNull();
    expect(emitSelf).toHaveBeenCalledWith(
      "connect:denied",
      expect.objectContaining({ reason: "TOKEN_INVALID" }),
    );
    expect(sessionStore.getById("old")).not.toBeNull();
  });

  it("client:join 过期 token 时返回 TOKEN_EXPIRED", () => {
    const sessionStore = new SessionStore();
    const emitSelf = vi.fn();

    const session = handleClientJoin(
      { playerName: "Steve", token: "expired-token" },
      {
        socketId: "sock-1",
        sessionStore,
        emitSelf,
        requirePlayerTokenAuth: true,
        playerAuthService: {
          validatePlayerToken: vi.fn(() => ({
            ok: false as const,
            error: {
              code: "TOKEN_EXPIRED" as const,
              message: "token 已过期",
            },
          })),
        },
        createSessionId: () => "s-1",
        nowProvider: () => 100,
      },
    );

    expect(session).toBeNull();
    expect(emitSelf).toHaveBeenCalledWith(
      "connect:denied",
      expect.objectContaining({ reason: "TOKEN_EXPIRED" }),
    );
  });

  it("client:join 被撤销 token 时返回 TOKEN_REVOKED", () => {
    const sessionStore = new SessionStore();
    const emitSelf = vi.fn();

    const session = handleClientJoin(
      { playerName: "Steve", token: "revoked-token" },
      {
        socketId: "sock-1",
        sessionStore,
        emitSelf,
        requirePlayerTokenAuth: true,
        playerAuthService: {
          validatePlayerToken: vi.fn(() => ({
            ok: false as const,
            error: {
              code: "TOKEN_REVOKED" as const,
              message: "token 未在白名单中生效",
            },
          })),
        },
        createSessionId: () => "s-1",
        nowProvider: () => 100,
      },
    );

    expect(session).toBeNull();
    expect(emitSelf).toHaveBeenCalledWith(
      "connect:denied",
      expect.objectContaining({ reason: "TOKEN_REVOKED" }),
    );
  });

  it("client:join token 中 playerName 与 join 不一致时返回 TOKEN_PLAYER_MISMATCH", () => {
    const sessionStore = new SessionStore();
    const emitSelf = vi.fn();

    const session = handleClientJoin(
      { playerName: "Steve", token: "valid-token", forceReplace: true },
      {
        socketId: "sock-1",
        sessionStore,
        emitSelf,
        requirePlayerTokenAuth: true,
        playerAuthService: {
          validatePlayerToken: vi.fn(() => ({
            ok: true as const,
            playerName: "Alex",
            jti: "jti-1",
          })),
        },
        createSessionId: () => "s-1",
        nowProvider: () => 100,
      },
    );

    expect(session).toBeNull();
    expect(emitSelf).toHaveBeenCalledWith(
      "connect:denied",
      expect.objectContaining({ reason: "TOKEN_PLAYER_MISMATCH" }),
    );
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
