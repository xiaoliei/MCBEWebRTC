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

export interface PresenceNearbyPayload {
  players: NearbyPlayerDto[];
  /** 本玩家在游戏世界中的位置，浏览器端客户端为 null */
  myPosition: PositionDto | null;
}
