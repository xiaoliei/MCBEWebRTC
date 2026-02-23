export class StateStore {
    playersByName = new Map();
    upsertPlayer(input) {
        const playerName = input.playerName.trim();
        if (!playerName) {
            return null;
        }
        const current = this.playersByName.get(playerName) ?? {
            name: playerName,
            position: { x: 0, y: 0, z: 0 },
            dim: null,
            playerId: null,
            lastSeenAt: 0
        };
        // 仅覆盖传入字段，避免旧数据被无意义重置。
        if (input.position) {
            current.position = input.position;
        }
        if (input.dim !== undefined) {
            current.dim = input.dim;
        }
        if (input.playerId !== undefined) {
            current.playerId = input.playerId;
        }
        current.lastSeenAt = input.now;
        this.playersByName.set(playerName, current);
        return current;
    }
    getPlayerByName(playerName) {
        return this.playersByName.get(playerName.trim()) ?? null;
    }
    listPlayers() {
        return Array.from(this.playersByName.values());
    }
    prunePlayers(input) {
        for (const [playerName, player] of this.playersByName.entries()) {
            if (input.now - player.lastSeenAt > input.ttlMs) {
                this.playersByName.delete(playerName);
            }
        }
    }
}
