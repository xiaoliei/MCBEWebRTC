export interface PlayerTokenRecord {
  jti: string;
  playerName: string;
  issuedAt: number;
  expiresAt: number;
  revokedAt?: number;
  revokeReason?: string;
}

export interface PlayerTokenWhitelistStore {
  issue(playerName: string, jti: string, expiresAt: number): PlayerTokenRecord;

  getByJti(jti: string): PlayerTokenRecord | null;

  isActive(jti: string): boolean;

  removeByJti(jti: string): boolean;

  revoke(jti: string, reason: string): PlayerTokenRecord | null;

  revokeAllForPlayerName(playerName: string): number;

  deleteExpired(): number;
}
