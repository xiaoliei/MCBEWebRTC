import { describe, expect, it, vi } from 'vitest';
import { createSignalingService } from '../../src/signaling/createSignalingService';
import type { ConnectDeniedReason } from '@mcbewebrtc/shared';
import type {
  GatewayEventMap,
  SocketGateway
} from '../../src/signaling/SocketGateway';

class FakeGateway implements SocketGateway {
  public readonly sent: Array<{ event: string; payload?: unknown }> = [];
  private handlers: Partial<
    Record<keyof GatewayEventMap, Array<(payload: unknown) => void>>
  > = {};
  // 用于保存上次 join 的参数
  private lastJoinParams: { playerName: string; token?: string } = { playerName: '' };

  connect(): void {
    this.sent.push({ event: 'connect' });
  }

  disconnect(): void {
    this.sent.push({ event: 'disconnect:client' });
    this.emit('disconnect', undefined);
  }

  join(playerName: string, code?: string): void {
    this.lastJoinParams = { playerName, token: code };
    this.sent.push({ event: 'client:join', payload: { playerName, code } });
  }

  // 用于测试 retryWithForceReplace 方法
  retryWithForceReplace(): void {
    const { playerName, token } = this.lastJoinParams;
    this.sent.push({
      event: 'client:join',
      payload: { playerName, token, forceReplace: true }
    });
  }

  requestPresenceList(): void {
    this.sent.push({ event: 'presence:list:req' });
  }

  sendOffer(toSessionId: string, data: unknown): void {
    this.sent.push({ event: 'webrtc:offer', payload: { toSessionId, data } });
  }

  sendAnswer(toSessionId: string, data: unknown): void {
    this.sent.push({ event: 'webrtc:answer', payload: { toSessionId, data } });
  }

  sendCandidate(toSessionId: string, data: unknown): void {
    this.sent.push({
      event: 'webrtc:candidate',
      payload: { toSessionId, data }
    });
  }

  on<K extends keyof GatewayEventMap>(
    event: K,
    handler: (payload: GatewayEventMap[K]) => void
  ): () => void {
    this.handlers[event] ??= [];
    this.handlers[event]?.push(handler as (payload: unknown) => void);
    return () => {
      this.handlers[event] = (this.handlers[event] ?? []).filter(
        (item) => item !== handler
      );
    };
  }

  emit<K extends keyof GatewayEventMap>(
    event: K,
    payload: GatewayEventMap[K]
  ): void {
    (this.handlers[event] ?? []).forEach((handler) => handler(payload));
  }
}

describe('createSignalingService', () => {
  it('应处理连接与附近玩家状态', () => {
    const gateway = new FakeGateway();
    const service = createSignalingService(gateway);

    service.join('Alice');
    gateway.emit('connected', { sessionId: 's-1', playerName: 'Alice' });
    gateway.emit('presence:nearby', {
      players: [
        {
          sessionId: 's-2',
          playerName: 'Bob',
          position: { x: 1, y: 2, z: 3 },
          dim: 0
        }
      ],
      myPosition: null
    });

    expect(service.getState().status).toBe('connected');
    expect(service.getState().sessionId).toBe('s-1');
    expect(service.getState().nearbyPlayers).toHaveLength(1);
    expect(gateway.sent.map((item) => item.event)).toContain(
      'presence:list:req'
    );
  });

  it('应将 DUPLICATE_NAME 映射为 denied 状态', () => {
    const gateway = new FakeGateway();
    const service = createSignalingService(gateway);

    service.join('Alice');
    gateway.emit('connect:denied', {
      reason: 'DUPLICATE_NAME',
      message: '玩家名已在线，请输入验证码重连'
    });

    expect(service.getState().status).toBe('denied');
    expect(service.getState().denyReason).toBe('DUPLICATE_NAME');
  });

  it.each<ConnectDeniedReason>([
    'TOKEN_INVALID',
    'TOKEN_EXPIRED',
    'TOKEN_REVOKED',
    'TOKEN_MISSING',
    'TOKEN_PLAYER_MISMATCH',
    'FORCE_REPLACE_REQUIRED'
  ])('应消费 shared 契约中的 token deny reason: %s', (reason) => {
    const gateway = new FakeGateway();
    const service = createSignalingService(gateway);

    service.join('Alice');
    gateway.emit('connect:denied', { reason });

    expect(service.getState().status).toBe('denied');
    expect(service.getState().denyReason).toBe(reason);
  });

  it('应仅在 TOKEN_EXPIRED 时触发 onTokenExpired，不依赖 INVALID_TOKEN', () => {
    const gateway = new FakeGateway();
    const onTokenExpired = vi.fn();
    createSignalingService(gateway, { onTokenExpired });

    const reasons: Array<ConnectDeniedReason> = [
      'TOKEN_INVALID',
      'TOKEN_REVOKED',
      'TOKEN_MISSING',
      'TOKEN_PLAYER_MISMATCH'
    ];

    reasons.forEach((reason) => {
      gateway.emit('connect:denied', { reason });
    });
    // 中文注释：INVALID_TOKEN 不在 shared 契约里，运行时即使收到也不应触发回调。
    gateway.emit('connect:denied', {
      reason: 'INVALID_TOKEN' as unknown as ConnectDeniedReason
    });
    expect(onTokenExpired).toHaveBeenCalledTimes(0);

    gateway.emit('connect:denied', { reason: 'TOKEN_EXPIRED' });
    expect(onTokenExpired).toHaveBeenCalledTimes(1);
  });

  it('应支持 webrtc 信令出入站与状态机更新', () => {
    const gateway = new FakeGateway();
    const service = createSignalingService(gateway);

    service.sendOffer('s-2', { sdp: 'o1' });
    gateway.emit('webrtc:answer', {
      fromSessionId: 's-2',
      data: { sdp: 'a1' }
    });
    gateway.emit('webrtc:candidate', {
      fromSessionId: 's-2',
      data: { candidate: 'c1' }
    });

    expect(gateway.sent).toContainEqual({
      event: 'webrtc:offer',
      payload: { toSessionId: 's-2', data: { sdp: 'o1' } }
    });
    expect(service.getState().peerStates['s-2'].phase).toBe('connected');
    expect(service.getState().peerStates['s-2'].hasCandidate).toBe(true);
  });

  it('断开后应清理会话与 nearby 状态', () => {
    const gateway = new FakeGateway();
    const service = createSignalingService(gateway);

    service.join('Alice');
    gateway.emit('connected', { sessionId: 's-1', playerName: 'Alice' });
    gateway.emit('presence:nearby', {
      players: [
        {
          sessionId: 's-2',
          playerName: 'Bob',
          position: { x: 1, y: 2, z: 3 },
          dim: 0
        }
      ],
      myPosition: null
    });

    service.disconnect();

    expect(service.getState().status).toBe('disconnected');
    expect(service.getState().sessionId).toBe('');
    expect(service.getState().nearbyPlayers).toHaveLength(0);
  });

  it('subscribe 应推送状态变化', () => {
    const gateway = new FakeGateway();
    const service = createSignalingService(gateway);
    const listener = vi.fn();

    const unsub = service.subscribe(listener);
    service.join('Alice');
    gateway.emit('connected', { sessionId: 's-1', playerName: 'Alice' });
    unsub();
    gateway.emit('presence:nearby', { players: [], myPosition: null });

    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('重复 join 时应重置状态并重新连接', () => {
    const gateway = new FakeGateway();
    const service = createSignalingService(gateway);

    // 中文注释：第一次连接成功
    service.join('Alice');
    gateway.emit('connected', { sessionId: 's-1', playerName: 'Alice' });
    gateway.emit('presence:nearby', {
      players: [
        {
          sessionId: 's-2',
          playerName: 'Bob',
          position: { x: 1, y: 2, z: 3 },
          dim: 0
        }
      ],
      myPosition: null
    });

    expect(service.getState().sessionId).toBe('s-1');
    expect(service.getState().nearbyPlayers).toHaveLength(1);

    // 中文注释：断开后重新 join，状态应重置为 connecting
    service.disconnect();
    service.join('Bob');
    gateway.emit('connected', { sessionId: 's-3', playerName: 'Bob' });

    expect(service.getState().sessionId).toBe('s-3');
    expect(service.getState().nearbyPlayers).toHaveLength(0);
  });

  it('向不存在的 sessionId 发送信令不应报错', () => {
    const gateway = new FakeGateway();
    const service = createSignalingService(gateway);

    // 中文注释：向不存在的会话发送 offer，应正常完成不抛出异常
    expect(() => {
      service.sendOffer('non-existent-session', { sdp: 'test-offer' });
      service.sendAnswer('non-existent-session', { sdp: 'test-answer' });
      service.sendCandidate('non-existent-session', { candidate: 'test' });
    }).not.toThrow();

    // 中文注释：验证消息已发送到网关
    expect(gateway.sent).toHaveLength(3);
  });

  it('Socket 重连后应复位 peer 状态', () => {
    const gateway = new FakeGateway();
    const service = createSignalingService(gateway);

    // 中文注释：建立 WebRTC 连接
    service.sendOffer('s-2', { sdp: 'offer' });
    gateway.emit('webrtc:answer', {
      fromSessionId: 's-2',
      data: { sdp: 'answer' }
    });
    gateway.emit('webrtc:candidate', {
      fromSessionId: 's-2',
      data: { candidate: 'candidate' }
    });

    expect(service.getState().peerStates['s-2'].phase).toBe('connected');

    // 中文注释：断开连接应清理 peer 状态
    gateway.emit('disconnect', undefined);

    expect(service.getState().peerStates).toEqual({});
  });
});
