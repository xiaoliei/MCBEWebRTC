import type { NearbyPlayerDto, PositionDto } from './presence.js';
export interface ClientJoinPayload {
    playerName: string;
    code?: string;
}
export interface BridgePositionUpdatePayload {
    playerName: string;
    playerId?: string | null;
    position: PositionDto;
    dim: number | null;
}
export interface WebRtcSignalPayload {
    toSessionId: string;
    data: unknown;
}
export interface WebRtcSignalRelayPayload {
    fromSessionId: string;
    data: unknown;
}
export type ConnectDeniedReason = 'DUPLICATE_NAME' | 'INVALID_CODE' | 'INVALID_PAYLOAD';
export interface ConnectDeniedPayload {
    reason: ConnectDeniedReason;
    message?: string;
}
export interface PresenceListResponsePayload {
    players: NearbyPlayerDto[];
}
export interface AuthRejectedPayload {
    reason: 'UNAUTHORIZED';
}
export interface ClientToServerEvents {
    'client:join': (payload: ClientJoinPayload) => void;
    'bridge:position:update': (payload: BridgePositionUpdatePayload) => void;
    'webrtc:offer': (payload: WebRtcSignalPayload) => void;
    'webrtc:answer': (payload: WebRtcSignalPayload) => void;
    'webrtc:candidate': (payload: WebRtcSignalPayload) => void;
    'presence:list:req': () => void;
}
export interface ServerToClientEvents {
    'auth:accepted': () => void;
    'auth:rejected': (payload: AuthRejectedPayload) => void;
    connected: (payload: {
        sessionId: string;
        playerName: string;
    }) => void;
    'connect:denied': (payload: ConnectDeniedPayload) => void;
    'presence:nearby': (payload: {
        players: NearbyPlayerDto[];
    }) => void;
    'presence:list:res': (payload: PresenceListResponsePayload) => void;
    'webrtc:offer': (payload: WebRtcSignalRelayPayload) => void;
    'webrtc:answer': (payload: WebRtcSignalRelayPayload) => void;
    'webrtc:candidate': (payload: WebRtcSignalRelayPayload) => void;
}
//# sourceMappingURL=signaling.d.ts.map