import { describe, expect, it, expectTypeOf } from 'vitest';
import type { NearbyPlayerDto, PositionDto, PresenceNearbyPayload } from '../../src/types/presence.js';

describe('presence contracts', () => {
  it('位置 DTO 必须含三轴坐标', () => {
    expectTypeOf<PositionDto>().toEqualTypeOf<{ x: number; y: number; z: number }>();
  });

  it('邻近玩家 DTO 结构稳定', () => {
    expectTypeOf<NearbyPlayerDto>().toMatchTypeOf<{
      sessionId: string;
      playerName: string;
      position: PositionDto;
      dim: number | null;
    }>();
  });

  it('presence:nearby 负载为 players 数组', () => {
    const payload: PresenceNearbyPayload = {
      players: []
    };

    expect(payload.players).toEqual([]);
  });
});