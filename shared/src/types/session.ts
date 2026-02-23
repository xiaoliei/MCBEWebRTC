export type SessionId = string;

export interface ClientSessionDto {
  sessionId: SessionId;
  playerName: string;
  connectedAt: number;
}