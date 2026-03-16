import type {
  PlayerTokenRecord,
  PlayerTokenWhitelistStore,
} from "./PlayerTokenWhitelistStore.js";

export class InMemoryPlayerTokenWhitelistStore
  implements PlayerTokenWhitelistStore
{
  // 以 jti 作为白名单主键，确保查询与撤销都是 O(1)。
  private readonly recordsByJti = new Map<string, PlayerTokenRecord>();

  issue(playerName: string, jti: string, expiresAt: number): PlayerTokenRecord {
    const now = Date.now();
    const record: PlayerTokenRecord = {
      jti: jti.trim(),
      playerName: playerName.trim(),
      issuedAt: now,
      expiresAt,
    };

    this.recordsByJti.set(record.jti, record);

    // 懒清理：签发新 token 时清理过期记录
    this.deleteExpired();

    return record;
  }

  getByJti(jti: string): PlayerTokenRecord | null {
    const normalizedJti = jti.trim();
    const record = this.recordsByJti.get(normalizedJti);
    if (!record) {
      return null;
    }

    if (this.isExpired(record)) {
      // 惰性删除：读取时发现已过期，立刻从白名单移除，避免残留脏数据。
      this.recordsByJti.delete(normalizedJti);
      return null;
    }

    return record;
  }

  isActive(jti: string): boolean {
    const record = this.getByJti(jti);
    if (!record) {
      return false;
    }

    return record.revokedAt === undefined;
  }

  removeByJti(jti: string): boolean {
    return this.recordsByJti.delete(jti.trim());
  }

  revoke(jti: string, reason: string): PlayerTokenRecord | null {
    const record = this.getByJti(jti);
    if (!record) {
      return null;
    }

    if (record.revokedAt !== undefined) {
      return record;
    }

    record.revokedAt = Date.now();
    record.revokeReason = reason.trim();
    return record;
  }

  revokeAllForPlayerName(playerName: string): number {
    const normalizedName = playerName.trim();
    let revokedCount = 0;

    for (const [jti, record] of this.recordsByJti.entries()) {
      if (record.playerName !== normalizedName) {
        continue;
      }

      if (this.isExpired(record)) {
        this.recordsByJti.delete(jti);
        continue;
      }

      if (record.revokedAt !== undefined) {
        continue;
      }

      record.revokedAt = Date.now();
      record.revokeReason = "revoke_all";
      revokedCount += 1;
    }

    return revokedCount;
  }

  deleteExpired(): number {
    let deletedCount = 0;

    for (const [jti, record] of this.recordsByJti.entries()) {
      if (!this.isExpired(record)) {
        continue;
      }

      this.recordsByJti.delete(jti);
      deletedCount += 1;
    }

    return deletedCount;
  }

  private isExpired(record: PlayerTokenRecord): boolean {
    return Date.now() > record.expiresAt;
  }
}
