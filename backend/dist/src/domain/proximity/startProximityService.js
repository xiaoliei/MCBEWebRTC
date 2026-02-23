function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
}
function canConnect(selfPlayer, otherPlayer, radiusSquared) {
    if (selfPlayer.dim !== null && otherPlayer.dim !== null && selfPlayer.dim !== otherPlayer.dim) {
        return false;
    }
    return distanceSquared(selfPlayer.position, otherPlayer.position) <= radiusSquared;
}
export function startProximityService(options) {
    const radiusSquared = options.callRadius * options.callRadius;
    const lastSentKeyBySessionId = new Map();
    const nowProvider = options.nowProvider ?? (() => Date.now());
    const timer = setInterval(() => {
        const now = nowProvider();
        options.stateStore.prunePlayers({ ttlMs: options.gamePlayerTtlMs, now });
        const sessions = options.sessionStore.listOnlineSessions();
        for (const session of sessions) {
            const nearbyPlayers = collectNearbyPlayers({
                session,
                sessions,
                stateStore: options.stateStore,
                radiusSquared
            });
            const nextKey = nearbyPlayers.map((item) => item.sessionId).join(',');
            if (lastSentKeyBySessionId.get(session.sessionId) === nextKey) {
                continue;
            }
            // 仅在邻近列表变化时推送，避免高频无效消息。
            lastSentKeyBySessionId.set(session.sessionId, nextKey);
            options.emitNearby(session.sessionId, nearbyPlayers);
        }
    }, options.tickMs);
    return () => clearInterval(timer);
}
function collectNearbyPlayers(input) {
    const selfPlayer = input.stateStore.getPlayerByName(input.session.playerName);
    if (!selfPlayer) {
        return [];
    }
    const nearbyPlayers = [];
    for (const otherSession of input.sessions) {
        if (otherSession.sessionId === input.session.sessionId) {
            continue;
        }
        const otherPlayer = input.stateStore.getPlayerByName(otherSession.playerName);
        if (!otherPlayer || !canConnect(selfPlayer, otherPlayer, input.radiusSquared)) {
            continue;
        }
        nearbyPlayers.push({
            sessionId: otherSession.sessionId,
            playerName: otherSession.playerName,
            position: otherPlayer.position,
            dim: otherPlayer.dim
        });
    }
    nearbyPlayers.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
    return nearbyPlayers;
}
