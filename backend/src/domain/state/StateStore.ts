export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface GamePlayerState {
  name: string;
  position: Vector3;
  dim: number | null;
  playerId: string | null;
  lastSeenAt: number;
}

export interface UpsertPlayerInput {
  playerName: string;
  position?: Vector3;
  dim?: number | null;
  playerId?: string | null;
  now: number;
}

export class StateStore {
  private readonly playersByName = new Map<string, GamePlayerState>();

  upsertPlayer(input: UpsertPlayerInput): GamePlayerState | null {
    const playerName = input.playerName.trim();
    if (!playerName) {
      return null;
    }

    const current = this.playersByName.get(playerName) ?? {
      name: playerName,
      position: { x: 0, y: 0, z: 0 },
      dim: null,
      playerId: null,
      lastSeenAt: 0,
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

  getPlayerByName(playerName: string): GamePlayerState | null {
    return this.playersByName.get(playerName.trim()) ?? null;
  }

  listPlayers(): GamePlayerState[] {
    return Array.from(this.playersByName.values());
  }

  prunePlayers(input: { ttlMs: number; now: number }): void {
    for (const [playerName, player] of this.playersByName.entries()) {
      if (input.now - player.lastSeenAt > input.ttlMs) {
        this.playersByName.delete(playerName);
      }
    }
  }
}
