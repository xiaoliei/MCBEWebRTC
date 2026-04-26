import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioService } from '../../src/audio/AudioService';

describe('AudioService', () => {
  let mockAudioContext: {
    createMediaElementSource: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    destination: object;
    currentTime: number;
    resume: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    state: string;
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();

    mockAudioContext = {
      createMediaElementSource: vi.fn(),
      createGain: vi.fn(),
      destination: Symbol('destination') as unknown as object,
      currentTime: 0,
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      state: 'running'
    };
    // 使用类形式 stub AudioContext，构造函数直接返回 mockAudioContext 对象，
    // 确保各测试中对 mockAudioContext 属性的修改能实时生效。
    class MockAudioContext {
      constructor() {
        // 构造函数中返回对象会覆盖 new 的默认 this
        return mockAudioContext;
      }
    }
    vi.stubGlobal('AudioContext', MockAudioContext);
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

    // 设置 Web Audio API mock
    const mockGainNode = {
      gain: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn()
    };
    const mockSourceNode = {
      connect: vi.fn(),
      disconnect: vi.fn()
    };
    mockAudioContext.createMediaElementSource = vi
      .fn()
      .mockReturnValue(mockSourceNode);
    mockAudioContext.createGain = vi.fn().mockReturnValue(mockGainNode);

    const service = new AudioService();
    const remoteStream = { getTracks: () => [] } as unknown as MediaStream;

    service.playRemoteStream('peer-1', remoteStream);

    const audio = document.querySelector(
      'audio[data-session-id="peer-1"]'
    ) as HTMLAudioElement | null;
    expect(audio).not.toBeNull();
    expect(playMock).toHaveBeenCalledTimes(1);

    service.stopRemoteStream('peer-1');
    expect(
      document.querySelector('audio[data-session-id="peer-1"]')
    ).toBeNull();
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

    // 设置 Web Audio API mock
    const mockGainNode = {
      gain: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn()
    };
    const mockSourceNode = {
      connect: vi.fn(),
      disconnect: vi.fn()
    };
    mockAudioContext.createMediaElementSource = vi
      .fn()
      .mockReturnValue(mockSourceNode);
    mockAudioContext.createGain = vi.fn().mockReturnValue(mockGainNode);

    const service = new AudioService();
    await service.initialize();
    service.playRemoteStream('peer-a', {
      getTracks: () => []
    } as unknown as MediaStream);
    service.playRemoteStream('peer-b', {
      getTracks: () => []
    } as unknown as MediaStream);

    service.cleanup();

    expect(document.querySelectorAll('audio').length).toBe(0);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).toHaveBeenCalledTimes(1);
    expect(service.getLocalStream()).toBeNull();
  });

  it('updateRemoteVolume 应更新 GainNode 的音量值', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();

    const mockGainNode = {
      gain: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn()
    };
    const mockSourceNode = {
      connect: vi.fn(),
      disconnect: vi.fn()
    };
    mockAudioContext.createMediaElementSource = vi
      .fn()
      .mockReturnValue(mockSourceNode);
    mockAudioContext.createGain = vi.fn().mockReturnValue(mockGainNode);

    const service = new AudioService();
    const remoteStream = { getTracks: () => [] } as unknown as MediaStream;
    service.playRemoteStream('peer-1', remoteStream);

    service.updateRemoteVolume('peer-1', 0.5);

    expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
  });

  it('updateRemoteVolume 对不存在的 sessionId 不报错', () => {
    const service = new AudioService();
    expect(() => service.updateRemoteVolume('non-existent', 0.5)).not.toThrow();
  });

  it('AudioContext 被暂停时 updateRemoteVolume 调用 resume', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();

    const mockGainNode = {
      gain: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn()
    };
    const mockSourceNode = {
      connect: vi.fn(),
      disconnect: vi.fn()
    };
    mockAudioContext.createMediaElementSource = vi
      .fn()
      .mockReturnValue(mockSourceNode);
    mockAudioContext.createGain = vi.fn().mockReturnValue(mockGainNode);
    mockAudioContext.state = 'suspended';

    const service = new AudioService();
    const remoteStream = { getTracks: () => [] } as unknown as MediaStream;
    service.playRemoteStream('peer-1', remoteStream);

    service.updateRemoteVolume('peer-1', 0.3);

    expect(mockAudioContext.resume).toHaveBeenCalled();
    expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.3, 0);
  });
});
