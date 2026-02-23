import { randomUUID } from 'node:crypto';
function deny(deps, payload) {
    deps.emitSelf('connect:denied', payload);
    return null;
}
export function handleClientJoin(input, deps) {
    const playerName = String(input.playerName ?? '').trim();
    if (!playerName) {
        return deny(deps, { reason: 'INVALID_PAYLOAD', message: 'playerName 不能为空' });
    }
    const existing = deps.sessionStore.getByPlayerName(playerName);
    if (existing) {
        const code = input.code?.trim();
        if (!code) {
            // 同名重连时先签发验证码，客户端需携带 code 二次加入。
            const now = deps.nowProvider?.() ?? Date.now();
            const reconnectCode = deps.generateReconnectCode?.() ?? '000000';
            const ttlMs = deps.reconnectCodeTtlMs ?? 120_000;
            deps.reconnectCodeStore.setCode({
                playerName,
                code: reconnectCode,
                expiresAt: now + ttlMs
            });
            return deny(deps, { reason: 'DUPLICATE_NAME', message: '玩家名已在线，请输入验证码重连' });
        }
        const now = deps.nowProvider?.() ?? Date.now();
        const canReconnect = deps.reconnectCodeStore.consumeCode({ playerName, code, now });
        if (!canReconnect) {
            return deny(deps, { reason: 'INVALID_CODE', message: '验证码无效或已过期' });
        }
        deps.sessionStore.removeById(existing.sessionId);
    }
    const sessionId = deps.createSessionId?.() ?? randomUUID();
    const session = deps.sessionStore.createSession({
        sessionId,
        playerName,
        socketId: deps.socketId,
        connectedAt: deps.nowProvider?.() ?? Date.now()
    });
    deps.emitSelf('connected', { sessionId, playerName });
    return session;
}
