import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioService } from '../../src/audio/AudioService';

describe('AudioService', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('initialize 应缓存本地流并只请求一次麦克风', async () => {
    const trackStop = vi.fn();
    const localStream = {
      getTracks: () => [{ stop: trackStop }]
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(localStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    });

    const service = new AudioService();
    await service.initialize();
    await service.initialize();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(service.getLocalStream()).toBe(localStream);
  });

  it('initialize 在权限拒绝时返回中文错误信息', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    });

    const service = new AudioService();
    await expect(service.initialize()).rejects.toThrow('麦克风权限被拒绝');
  });

  it('playRemoteStream/stopRemoteStream 应创建并移除隐藏音频元素', () => {
    const playMock = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue();

    const service = new AudioService();
    const remoteStream = { getTracks: () => [] } as unknown as MediaStream;

    service.playRemoteStream('peer-1', remoteStream);

    const audio = document.querySelector(
      'audio[data-session-id="peer-1"]'
    ) as HTMLAudioElement | null;
    expect(audio).not.toBeNull();
    expect(playMock).toHaveBeenCalledTimes(1);

    service.stopRemoteStream('peer-1');
    expect(document.querySelector('audio[data-session-id="peer-1"]')).toBeNull();
  });

  it('cleanup 应清理所有远端音频并停止本地轨道', async () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    const localStream = {
      getTracks: () => [{ stop: stopA }, { stop: stopB }]
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(localStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();

    const service = new AudioService();
    await service.initialize();
    service.playRemoteStream(
      'peer-a',
      { getTracks: () => [] } as unknown as MediaStream
    );
    service.playRemoteStream(
      'peer-b',
      { getTracks: () => [] } as unknown as MediaStream
    );

    service.cleanup();

    expect(document.querySelectorAll('audio').length).toBe(0);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).toHaveBeenCalledTimes(1);
    expect(service.getLocalStream()).toBeNull();
  });
});
