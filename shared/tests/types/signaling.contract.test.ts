import { describe, expect, it, expectTypeOf } from "vitest";
import type {
  ClientToServerEvents,
  ConnectDeniedReason,
  ServerToClientEvents,
  WebRtcSignalPayload,
} from "../../src/types/signaling.js";

describe("signaling contracts", () => {
  it("webrtc 负载包含目标 session 与消息体", () => {
    expectTypeOf<WebRtcSignalPayload>().toMatchTypeOf<{
      toSessionId: string;
      data: unknown;
    }>();
  });

  it("connectDenied 原因值受限", () => {
    const reason: ConnectDeniedReason = "TOKEN_MISSING";
    expect(reason).toBe("TOKEN_MISSING");
  });

  it("client 与 server 事件命名符合 domain:action 约定", () => {
    type ClientEventNames = keyof ClientToServerEvents;
    type ServerEventNames = keyof ServerToClientEvents;

    expectTypeOf<ClientEventNames>().toEqualTypeOf<
      | "client:join"
      | "bridge:position:update"
      | "webrtc:offer"
      | "webrtc:answer"
      | "webrtc:candidate"
      | "presence:list:req"
    >();
    expectTypeOf<ServerEventNames>().toEqualTypeOf<
      | "auth:accepted"
      | "auth:rejected"
      | "connected"
      | "connect:denied"
      | "presence:nearby"
      | "presence:list:res"
      | "webrtc:offer"
      | "webrtc:answer"
      | "webrtc:candidate"
    >();
  });
});
