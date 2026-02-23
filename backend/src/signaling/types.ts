export interface PositionDto {
  x: number;
  y: number;
  z: number;
}

export interface NearbyPlayerDto {
  sessionId: string;
  playerName: string;
  position: PositionDto;
  dim: number | null;
}

export interface PresenceListResponsePayload {
  players: NearbyPlayerDto[];
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