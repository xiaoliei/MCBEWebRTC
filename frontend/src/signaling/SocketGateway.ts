import type { NearbyPlayerDto } from '../../../shared/src/types/presence.js';
import type {
  ConnectDeniedPayload,
  WebRtcSignalRelayPayload
} from '../../../shared/src/types/signaling.js';

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
  join(playerName: string, code?: string): void;
  requestPresenceList(): void;
  sendOffer(toSessionId: string, data: unknown): void;
  sendAnswer(toSessionId: string, data: unknown): void;
  sendCandidate(toSessionId: string, data: unknown): void;
  on<K extends keyof GatewayEventMap>(
    event: K,
    handler: (payload: GatewayEventMap[K]) => void
  ): () => void;
}
