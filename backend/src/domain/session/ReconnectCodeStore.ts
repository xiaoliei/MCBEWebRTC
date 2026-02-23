export interface ReconnectCodeRecord {
  code: string;
  expiresAt: number;
}

export interface SetReconnectCodeInput {
  playerName: string;
  code: string;
  expiresAt: number;
}

export interface ConsumeReconnectCodeInput {
  playerName: string;
  code: string;
  now: number;
}

export class ReconnectCodeStore {
  private readonly codeByPlayerName = new Map<string, ReconnectCodeRecord>();

  setCode(input: SetReconnectCodeInput): void {
    const playerName = input.playerName.trim();
    if (!playerName) {
      return;
    }

    this.codeByPlayerName.set(playerName, {
      code: input.code.trim(),
      expiresAt: input.expiresAt
    });
  }

  getCode(playerName: string): ReconnectCodeRecord | null {
    return this.codeByPlayerName.get(playerName.trim()) ?? null;
  }

  consumeCode(input: ConsumeReconnectCodeInput): boolean {
    const playerName = input.playerName.trim();
    const record = this.codeByPlayerName.get(playerName);
    if (!record) {
      return false;
    }

    // 过期即清理，避免陈旧验证码长期驻留。
    if (input.now > record.expiresAt) {
      this.codeByPlayerName.delete(playerName);
      return false;
    }

    if (record.code !== input.code.trim()) {
      return false;
    }

    this.codeByPlayerName.delete(playerName);
    return true;
  }
}