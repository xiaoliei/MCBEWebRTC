export interface ClientSession {
  sessionId: string;
  playerName: string;
  socketId: string;
  connectedAt: number;
}

export interface CreateSessionInput {
  sessionId: string;
  playerName: string;
  socketId: string;
  connectedAt: number;
}

export class SessionStore {
  private readonly sessionsById = new Map<string, ClientSession>();
  private readonly sessionIdByPlayerName = new Map<string, string>();

  createSession(input: CreateSessionInput): ClientSession {
    const normalizedName = input.playerName.trim();
    const session: ClientSession = {
      sessionId: input.sessionId,
      playerName: normalizedName,
      socketId: input.socketId,
      connectedAt: input.connectedAt,
    };

    // 写入双索引，后续查询可按会话或按玩家名快速定位。
    this.sessionsById.set(session.sessionId, session);
    this.sessionIdByPlayerName.set(normalizedName, session.sessionId);
    return session;
  }

  getById(sessionId: string): ClientSession | null {
    return this.sessionsById.get(sessionId) ?? null;
  }

  getByPlayerName(playerName: string): ClientSession | null {
    const sessionId = this.sessionIdByPlayerName.get(playerName.trim());
    if (!sessionId) {
      return null;
    }
    return this.sessionsById.get(sessionId) ?? null;
  }

  listOnlineSessions(): ClientSession[] {
    return Array.from(this.sessionsById.values());
  }

  removeById(sessionId: string): void {
    const session = this.sessionsById.get(sessionId);
    if (!session) {
      return;
    }

    this.sessionsById.delete(sessionId);

    const indexedSessionId = this.sessionIdByPlayerName.get(session.playerName);
    if (indexedSessionId === sessionId) {
      this.sessionIdByPlayerName.delete(session.playerName);
    }
  }
}
