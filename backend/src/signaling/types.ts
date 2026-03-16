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

export interface ClientJoinPayload {
  playerName: string;
  // 令牌化加入语义：使用 token + forceReplace 替代旧 code 重连流程。
  token?: string;
  forceReplace?: boolean;
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

import type { ConnectDeniedReason } from '@mcbewebrtc/shared';

export type { ConnectDeniedReason } from '@mcbewebrtc/shared';

export interface ConnectDeniedPayload {
  reason: ConnectDeniedReason;
  message?: string;
}
