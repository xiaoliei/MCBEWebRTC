import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PeerConnection } from '../../src/webrtc/PeerConnection';

type Listener = (...args: unknown[]) => void;

class MockRtcPeerConnection {
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

  addEventListener(event: string, listener: Listener): void {
    const queue = this.listeners.get(event) ?? [];
    queue.push(listener);
    this.listeners.set(event, queue);
  }

  emit(event: string, payload?: unknown): void {
    (this.listeners.get(event) ?? []).forEach((listener) => listener(payload));
  }
}

describe('PeerConnection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('RTCPeerConnection', MockRtcPeerConnection as unknown);
  });

  it('attachLocalStream 应避免重复添加同一轨道（防止 this 引用回归）', () => {
    const peer = new PeerConnection('s-1', 'Alice');
    const track = { id: 't-1' } as MediaStreamTrack;
    const stream = {
      getTracks: () => [track]
    } as unknown as MediaStream;

    peer.attachLocalStream(stream);
    peer.attachLocalStream(stream);

    const pc = peer.pc as unknown as MockRtcPeerConnection;
    expect(pc.addTrack).toHaveBeenCalledTimes(1);
  });

  it('createOffer 应写入 localDescription 并返回 offer', async () => {
    const peer = new PeerConnection('s-1', 'Alice');

    const offer = await peer.createOffer();

    const pc = peer.pc as unknown as MockRtcPeerConnection;
    expect(offer).toEqual({ type: 'offer', sdp: 'offer-sdp' });
    expect(pc.setLocalDescription).toHaveBeenCalledWith(offer);
  });

  it('addIceCandidate 在 remoteDescription 未就绪时应暂存并在 handleAnswer 时冲刷', async () => {
    const peer = new PeerConnection('s-1', 'Alice');
    const pc = peer.pc as unknown as MockRtcPeerConnection;

    await peer.addIceCandidate({ candidate: 'c-1' });
    expect(pc.addIceCandidate).not.toHaveBeenCalled();

    await peer.handleAnswer({ type: 'answer', sdp: 'sdp-1' });
    expect(pc.addIceCandidate).toHaveBeenCalledWith({ candidate: 'c-1' });
  });

  it('iceconnectionstatechange 为 failed 时应自动关闭连接', () => {
    const peer = new PeerConnection('s-1', 'Alice');
    const pc = peer.pc as unknown as MockRtcPeerConnection;

    pc.iceConnectionState = 'failed';
    pc.emit('iceconnectionstatechange');

    expect(pc.close).toHaveBeenCalledTimes(1);
  });
});
