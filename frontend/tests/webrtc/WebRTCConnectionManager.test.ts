import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebRTCConnectionManager } from '../../src/webrtc/WebRTCConnectionManager';

type Listener = (...args: unknown[]) => void;

class MockRtcPeerConnection {
  static instances: MockRtcPeerConnection[] = [];

  public iceConnectionState: RTCIceConnectionState = 'new';

  public remoteDescription: RTCSessionDescriptionInit | null = null;

  public localDescription: RTCSessionDescriptionInit | null = null;

  public readonly addTrack = vi.fn();

  public readonly createOffer = vi
    .fn<() => Promise<RTCSessionDescriptionInit>>()
    .mockResolvedValue({ type: 'offer', sdp: 'offer-sdp' });

  public readonly createAnswer = vi
    .fn<() => Promise<RTCSessionDescriptionInit>>()
    .mockResolvedValue({ type: 'answer', sdp: 'answer-sdp' });

  public readonly setLocalDescription = vi
    .fn<(desc: RTCSessionDescriptionInit) => Promise<void>>()
    .mockImplementation(async (desc) => {
      this.localDescription = desc;
    });

  public readonly setRemoteDescription = vi
    .fn<(desc: RTCSessionDescriptionInit) => Promise<void>>()
    .mockImplementation(async (desc) => {
      this.remoteDescription = desc;
    });

  public readonly addIceCandidate = vi
    .fn<(candidate: RTCIceCandidateInit) => Promise<void>>()
    .mockResolvedValue();

  public readonly close = vi.fn();

  private readonly listeners = new Map<string, Listener[]>();

  constructor() {
    MockRtcPeerConnection.instances.push(this);
  }

  addEventListener(event: string, listener: Listener): void {
    const queue = this.listeners.get(event) ?? [];
    queue.push(listener);
    this.listeners.set(event, queue);
  }

  emit(event: string, payload?: unknown): void {
    (this.listeners.get(event) ?? []).forEach((listener) => listener(payload));
  }
}

describe('WebRTCConnectionManager', () => {
  beforeEach(() => {
    MockRtcPeerConnection.instances = [];
    vi.restoreAllMocks();
    vi.stubGlobal('RTCPeerConnection', MockRtcPeerConnection as unknown);
  });

  it('connectTo 应创建连接并发送 offer', async () => {
    const audioService = {
      initialize: vi.fn(),
      getLocalStream: vi.fn().mockReturnValue(null),
      playRemoteStream: vi.fn(),
      stopRemoteStream: vi.fn(),
      cleanup: vi.fn()
    };
    const signalOut = {
      sendOffer: vi.fn(),
      sendAnswer: vi.fn(),
      sendCandidate: vi.fn()
    };
    const callbacks = {
      onStateChange: vi.fn(),
      onDisconnected: vi.fn()
    };

    const manager = new WebRTCConnectionManager(
      audioService,
      signalOut,
      callbacks,
      () => 's-1',
      [{ urls: 'stun:stun.l.google.com:19302' }]
    );

    const success = await manager.connectTo('s-2', 'Bob');

    expect(success).toBe(true);
    expect(signalOut.sendOffer).toHaveBeenCalledWith('s-2', {
      type: 'offer',
      sdp: 'offer-sdp'
    });
    expect(callbacks.onStateChange).toHaveBeenCalled();
  });

  it('syncConnections 应按 sessionId 规则发起并清理离场连接', async () => {
    const audioService = {
      initialize: vi.fn(),
      getLocalStream: vi.fn().mockReturnValue(null),
      playRemoteStream: vi.fn(),
      stopRemoteStream: vi.fn(),
      cleanup: vi.fn()
    };
    const signalOut = {
      sendOffer: vi.fn(),
      sendAnswer: vi.fn(),
      sendCandidate: vi.fn()
    };
    const callbacks = {
      onStateChange: vi.fn(),
      onDisconnected: vi.fn()
    };

    const manager = new WebRTCConnectionManager(
      audioService,
      signalOut,
      callbacks,
      () => 's-1',
      [{ urls: 'stun:stun.l.google.com:19302' }]
    );

    manager.syncConnections([
      {
        sessionId: 's-2',
        playerName: 'Bob',
        position: { x: 0, y: 0, z: 0 },
        dim: 0
      }
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(signalOut.sendOffer).toHaveBeenCalledWith('s-2', {
      type: 'offer',
      sdp: 'offer-sdp'
    });

    manager.syncConnections([]);
    expect(callbacks.onDisconnected).toHaveBeenCalledWith('s-2');
    expect(audioService.stopRemoteStream).toHaveBeenCalledWith('s-2');
  });

  it('handleAnswer 失败时应断开对应连接', async () => {
    const audioService = {
      initialize: vi.fn(),
      getLocalStream: vi.fn().mockReturnValue(null),
      playRemoteStream: vi.fn(),
      stopRemoteStream: vi.fn(),
      cleanup: vi.fn()
    };
    const signalOut = {
      sendOffer: vi.fn(),
      sendAnswer: vi.fn(),
      sendCandidate: vi.fn()
    };
    const callbacks = {
      onStateChange: vi.fn(),
      onDisconnected: vi.fn()
    };

    const manager = new WebRTCConnectionManager(
      audioService,
      signalOut,
      callbacks,
      () => 's-1',
      [{ urls: 'stun:stun.l.google.com:19302' }]
    );

    await manager.connectTo('s-2', 'Bob');
    const rtcPc = MockRtcPeerConnection.instances[0];
    if (!rtcPc) {
      throw new Error('mock RTCPeerConnection not found');
    }
    rtcPc.setRemoteDescription.mockRejectedValueOnce(new Error('bad answer'));

    await manager.handleAnswer({
      fromSessionId: 's-2',
      answer: { type: 'answer', sdp: 'answer-sdp' }
    });

    expect(callbacks.onDisconnected).toHaveBeenCalledWith('s-2');
  });
});
