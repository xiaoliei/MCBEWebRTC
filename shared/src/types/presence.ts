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
}
