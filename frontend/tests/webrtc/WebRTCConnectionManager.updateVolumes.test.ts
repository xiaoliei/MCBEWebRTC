import { describe, expect, it, vi } from 'vitest';
import { WebRTCConnectionManager } from '../../src/webrtc/WebRTCConnectionManager';
import type { NearbyPlayerDto } from '@mcbewebrtc/shared';

function createMockAudioService() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    getLocalStream: vi.fn().mockReturnValue(null),
    playRemoteStream: vi.fn(),
    stopRemoteStream: vi.fn(),
    updateRemoteVolume: vi.fn(),
    cleanup: vi.fn(),
  };
}

function createMockSignalOut() {
  return {
    sendOffer: vi.fn(),
    sendAnswer: vi.fn(),
    sendCandidate: vi.fn(),
  };
}

function createMockCallbacks() {
  return {
    onStateChange: vi.fn(),
    onDisconnected: vi.fn(),
  };
}

describe('WebRTCConnectionManager.updateVolumes', () => {
  it('存在活跃连接时按距离计算并更新音量', () => {
    const audioService = createMockAudioService();
    const manager = new WebRTCConnectionManager(
      audioService,
      createMockSignalOut(),
      createMockCallbacks(),
      () => 'self-id',
      [],
    );

    // 通过注入连接 map 模拟已建立的远端连接。
    const internals = manager as unknown as {
      connections: Map<string, unknown>;
    };
    internals.connections.set('peer-1', {});

    const players: NearbyPlayerDto[] = [
      {
        sessionId: 'peer-1',
        playerName: 'B',
        position: { x: 4, y: 0, z: 0 },
        dim: 0,
      },
    ];

    manager.updateVolumes({ x: 0, y: 0, z: 0 }, players);

    // 距离 4，默认 referenceDistance=2，音量应为 0.5。
    expect(audioService.updateRemoteVolume).toHaveBeenCalledWith('peer-1', 0.5);
  });

  it('myPosition 为 null 时对不存在的连接不调用 updateRemoteVolume', () => {
    const audioService = createMockAudioService();
    const manager = new WebRTCConnectionManager(
      audioService,
      createMockSignalOut(),
      createMockCallbacks(),
      () => 'self-id',
      [],
    );

    const players: NearbyPlayerDto[] = [
      {
        sessionId: 'peer-1',
        playerName: 'B',
        position: { x: 4, y: 0, z: 0 },
        dim: 0,
      },
    ];

    // 没有活跃连接，不应调用 updateRemoteVolume
    manager.updateVolumes(null, players);
    expect(audioService.updateRemoteVolume).not.toHaveBeenCalled();
  });

  it('myPosition 非 null 时对不存在的连接不调用 updateRemoteVolume', () => {
    const audioService = createMockAudioService();
    const manager = new WebRTCConnectionManager(
      audioService,
      createMockSignalOut(),
      createMockCallbacks(),
      () => 'self-id',
      [],
    );

    const players: NearbyPlayerDto[] = [
      {
        sessionId: 'peer-1',
        playerName: 'B',
        position: { x: 4, y: 0, z: 0 },
        dim: 0,
      },
    ];

    manager.updateVolumes({ x: 0, y: 0, z: 0 }, players);
    expect(audioService.updateRemoteVolume).not.toHaveBeenCalled();
  });

  it('空的 players 列表时不会报错', () => {
    const audioService = createMockAudioService();
    const manager = new WebRTCConnectionManager(
      audioService,
      createMockSignalOut(),
      createMockCallbacks(),
      () => 'self-id',
      [],
    );

    // 不应抛出异常
    expect(() => manager.updateVolumes({ x: 0, y: 0, z: 0 }, [])).not.toThrow();
    expect(audioService.updateRemoteVolume).not.toHaveBeenCalled();
  });

  it('calculateVolume 的引用正确（距离 4 = 音量 0.5）', async () => {
    // 通过直接调用 calculateVolume 验证公式一致性
    const { calculateVolume } = await import('../../src/audio/calculateVolume');
    expect(calculateVolume(4, 2)).toBe(0.5);
    expect(calculateVolume(0, 2)).toBe(1.0);
  });
});
