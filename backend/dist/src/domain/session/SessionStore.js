export class SessionStore {
    sessionsById = new Map();
    sessionIdByPlayerName = new Map();
    createSession(input) {
        const normalizedName = input.playerName.trim();
        const session = {
            sessionId: input.sessionId,
            playerName: normalizedName,
            socketId: input.socketId,
            connectedAt: input.connectedAt
        };
        // 写入双索引，后续查询可按会话或按玩家名快速定位。
        this.sessionsById.set(session.sessionId, session);
        this.sessionIdByPlayerName.set(normalizedName, session.sessionId);
        return session;
    }
    getById(sessionId) {
        return this.sessionsById.get(sessionId) ?? null;
    }
    getByPlayerName(playerName) {
        const sessionId = this.sessionIdByPlayerName.get(playerName.trim());
        if (!sessionId) {
            return null;
        }
        return this.sessionsById.get(sessionId) ?? null;
    }
    listOnlineSessions() {
        return Array.from(this.sessionsById.values());
    }
    removeById(sessionId) {
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
