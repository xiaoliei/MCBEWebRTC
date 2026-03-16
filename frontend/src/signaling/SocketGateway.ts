import type { NearbyPlayerDto, ConnectDeniedPayload, WebRtcSignalRelayPayload } from '@mcbewebrtc/shared';

export type GatewayEventMap = {
  connected: { sessionId: string; playerName: string };
  'connect:denied': ConnectDeniedPayload;
  'presence:nearby': { players: NearbyPlayerDto[] };
  'webrtc:offer': WebRtcSignalRelayPayload;
  'webrtc:answer': WebRtcSignalRelayPayload;
  'webrtc:candidate': WebRtcSignalRelayPayload;
  disconnect: void;
};

export interface SocketGateway {
  connect(): void;
  disconnect(): void;
  join(playerName: string, token?: string, forceReplace?: boolean): void;
  /**
   * 使用 forceReplace=true 重新加入，用于处理 FORCE_REPLACE_REQUIRED 拒绝
   */
  retryWithForceReplace(): void;
  requestPresenceList(): void;
  sendOffer(toSessionId: string, data: unknown): void;
  sendAnswer(toSessionId: string, data: unknown): void;
  sendCandidate(toSessionId: string, data: unknown): void;
  on<K extends keyof GatewayEventMap>(
    event: K,
    handler: (payload: GatewayEventMap[K]) => void
  ): () => void;
}
