export class ReconnectCodeStore {
    codeByPlayerName = new Map();
    setCode(input) {
        const playerName = input.playerName.trim();
        if (!playerName) {
            return;
        }
        this.codeByPlayerName.set(playerName, {
            code: input.code.trim(),
            expiresAt: input.expiresAt
        });
    }
    getCode(playerName) {
        return this.codeByPlayerName.get(playerName.trim()) ?? null;
    }
    consumeCode(input) {
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
