import { describe, expect, it } from 'vitest';
import { StateStore } from '../../../src/domain/state/StateStore.js';

describe('StateStore', () => {
  it('更新玩家位置并可按名称读取', () => {
    const store = new StateStore();
    store.upsertPlayer({ playerName: 'Steve', position: { x: 1, y: 64, z: 2 }, dim: 0, playerId: 'p-1', now: 100 });

    const player = store.getPlayerByName('Steve');
    expect(player?.position).toEqual({ x: 1, y: 64, z: 2 });
    expect(player?.lastSeenAt).toBe(100);
  });

  it('只清理超过 TTL 的玩家', () => {
    const store = new StateStore();
    store.upsertPlayer({ playerName: 'A', position: { x: 0, y: 0, z: 0 }, dim: 0, now: 100 });
    store.upsertPlayer({ playerName: 'B', position: { x: 1, y: 0, z: 0 }, dim: 0, now: 300 });

    store.prunePlayers({ ttlMs: 150, now: 400 });

    expect(store.getPlayerByName('A')).toBeNull();
    expect(store.getPlayerByName('B')).not.toBeNull();
  });
});