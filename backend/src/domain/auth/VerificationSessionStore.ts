import type {
  VerificationMode,
  VerificationSessionRecord,
} from "./types.js";

export interface VerificationSessionStore {
  createOrReplace(
    playerName: string,
    mode: VerificationMode,
    code: string,
    expiresAt: number,
  ): VerificationSessionRecord;

  getActiveByPlayerName(playerName: string): VerificationSessionRecord | null;

  markGameConfirmed(playerName: string): VerificationSessionRecord | null;

  markFrontendConfirmed(playerName: string): VerificationSessionRecord | null;

  markVerified(playerName: string): VerificationSessionRecord | null;

  markSuperseded(playerName: string): VerificationSessionRecord | null;

  deleteExpired(): void;
}
