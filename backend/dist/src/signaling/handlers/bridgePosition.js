export function handleBridgePositionUpdate(payload, deps) {
    const playerName = String(payload.playerName ?? '').trim();
    const position = payload.position;
    if (!playerName || !position) {
        return false;
    }
    deps.stateStore.upsertPlayer({
        playerName,
        position,
        dim: payload.dim,
        playerId: payload.playerId ?? null,
        now: deps.nowProvider?.() ?? Date.now()
    });
    return true;
}
