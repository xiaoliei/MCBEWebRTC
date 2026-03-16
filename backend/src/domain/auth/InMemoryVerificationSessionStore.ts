import type { VerificationSessionStore } from "./VerificationSessionStore.js";
import type {
  VerificationMode,
  VerificationSessionRecord,
} from "./types.js";

export class InMemoryVerificationSessionStore
  implements VerificationSessionStore
{
  private readonly sessionByPlayerName = new Map<string, VerificationSessionRecord>();

  createOrReplace(
    playerName: string,
    mode: VerificationMode,
    code: string,
    expiresAt: number,
  ): VerificationSessionRecord {
    const normalizedName = playerName.trim();
    const now = Date.now();

    const current = this.sessionByPlayerName.get(normalizedName);
    if (current && current.status !== "verified") {
      this.applySuperseded(current, now);
    }

    // 已 verified 会话不复用：每次创建都写入新记录，避免历史已完成状态污染新验证流程。
    const next: VerificationSessionRecord = {
      playerName: normalizedName,
      mode,
      code: code.trim(),
      status: "active",
      createdAt: now,
      expiresAt,
    };

    this.sessionByPlayerName.set(normalizedName, next);

    // 懒清理：创建新会话时清理其他玩家的过期会话（所有状态）
    this.deleteExpired(normalizedName);

    return next;
  }

  getActiveByPlayerName(playerName: string): VerificationSessionRecord | null {
    const record = this.sessionByPlayerName.get(playerName.trim());
    if (!record || record.status !== "active") {
      return null;
    }
    return record;
  }

  markGameConfirmed(playerName: string): VerificationSessionRecord | null {
    const record = this.sessionByPlayerName.get(playerName.trim());
    if (!record || record.status !== "active") {
      return null;
    }

    record.status = "game_confirmed";
    record.gameConfirmedAt = Date.now();
    return record;
  }

  markFrontendConfirmed(playerName: string): VerificationSessionRecord | null {
    const record = this.sessionByPlayerName.get(playerName.trim());
    if (!record) {
      return null;
    }

    record.status = "frontend_confirmed";
    record.frontendConfirmedAt = Date.now();
    return record;
  }

  markVerified(playerName: string): VerificationSessionRecord | null {
    const record = this.sessionByPlayerName.get(playerName.trim());
    if (!record) {
      return null;
    }

    record.status = "verified";
    record.verifiedAt = Date.now();
    return record;
  }

  markSuperseded(playerName: string): VerificationSessionRecord | null {
    const record = this.sessionByPlayerName.get(playerName.trim());
    if (!record) {
      return null;
    }

    this.applySuperseded(record, Date.now());
    return record;
  }

  deleteExpired(skipPlayerName?: string): void {
    const now = Date.now();
    for (const [key, record] of this.sessionByPlayerName.entries()) {
      // 跳过指定的玩家（如刚创建的会话）
      if (skipPlayerName && key === skipPlayerName) {
        continue;
      }
      // 清理所有过期会话，避免非 active 状态长期滞留。
      if (now > record.expiresAt) {
        this.sessionByPlayerName.delete(key);
      }
    }
  }

  private applySuperseded(record: VerificationSessionRecord, at: number): void {
    record.status = "superseded";
    record.supersededAt = at;
  }
}
