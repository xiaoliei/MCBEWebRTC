export type VerificationMode = "tell" | "manual";

export type VerificationSessionStatus =
  | "active"
  | "game_confirmed"
  | "frontend_confirmed"
  | "verified"
  | "superseded"
  | "expired";

export interface VerificationSessionRecord {
  playerName: string;
  mode: VerificationMode;
  code: string;
  status: VerificationSessionStatus;
  createdAt: number;
  expiresAt: number;
  gameConfirmedAt?: number;
  frontendConfirmedAt?: number;
  verifiedAt?: number;
  supersededAt?: number;
}
