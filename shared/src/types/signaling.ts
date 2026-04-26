import type { NearbyPlayerDto, PositionDto } from "./presence.js";

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

export type ConnectDeniedReason =
  | "DUPLICATE_NAME"
  | "INVALID_PAYLOAD"
  | "RATE_LIMITED"
  | "BRIDGE_UNAVAILABLE"
  | "INVALID_VERIFICATION"
  // 令牌化加入语义下的拒绝原因（逐步替代旧 code 语义）。
  | "TOKEN_MISSING"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "TOKEN_PLAYER_MISMATCH"
  | "PLAYER_ALREADY_ONLINE"
  | "FORCE_REPLACE_REQUIRED"
  | "UNAUTHORIZED_REPLACEMENT";

export interface ConnectDeniedPayload {
  reason: ConnectDeniedReason;
  message?: string;
}

export interface PresenceListResponsePayload {
  players: NearbyPlayerDto[];
}

export interface ConnectedPayload {
  sessionId: string;
  playerName: string;
}

export interface PresenceNearbyEventPayload {
  players: NearbyPlayerDto[];
  /** 本玩家在游戏世界中的位置，浏览器端客户端为 null */
  myPosition: PositionDto | null;
}

export interface AuthRejectedPayload {
  reason: "UNAUTHORIZED";
}

export interface ClientToServerEvents {
  "client:join": (payload: ClientJoinPayload) => void;
  "bridge:position:update": (payload: BridgePositionUpdatePayload) => void;
  "webrtc:offer": (payload: WebRtcSignalPayload) => void;
  "webrtc:answer": (payload: WebRtcSignalPayload) => void;
  "webrtc:candidate": (payload: WebRtcSignalPayload) => void;
  "presence:list:req": () => void;
}

export interface ServerToClientEvents {
  "auth:accepted": () => void;
  "auth:rejected": (payload: AuthRejectedPayload) => void;
  connected: (payload: ConnectedPayload) => void;
  "connect:denied": (payload: ConnectDeniedPayload) => void;
  "presence:nearby": (payload: PresenceNearbyEventPayload) => void;
  "presence:list:res": (payload: PresenceListResponsePayload) => void;
  "webrtc:offer": (payload: WebRtcSignalRelayPayload) => void;
  "webrtc:answer": (payload: WebRtcSignalRelayPayload) => void;
  "webrtc:candidate": (payload: WebRtcSignalRelayPayload) => void;
}
