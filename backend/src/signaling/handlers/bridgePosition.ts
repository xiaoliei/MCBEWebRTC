import type { StateStore } from '../../domain/state/StateStore.js';
import type { BridgePositionUpdatePayload } from '../types.js';

export interface BridgePositionDeps {
  stateStore: StateStore;
  nowProvider?: () => number;
}

export function handleBridgePositionUpdate(payload: BridgePositionUpdatePayload, deps: BridgePositionDeps): boolean {
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