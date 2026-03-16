import { describe, expect, it, vi } from 'vitest';
import { createSignalingService } from '../../src/signaling/createSignalingService';
import type {
  GatewayEventMap,
  SocketGateway
} from '../../src/signaling/SocketGateway';

/**
 * 扩展的 FakeGateway，支持 token 和 forceReplace 参数
 */
class TokenAwareFakeGateway implements SocketGateway {
  public readonly sent: Array<{ event: string; payload?: unknown }> = [];
  private handlers: Partial<
    Record<keyof GatewayEventMap, Array<(payload: unknown) => void>>
  > = {};
  // 中文注释：保存最后一次 join 的参数，用于 retryWithForceReplace
  private _lastJoinParams: { playerName: string; token?: string } = {
    playerName: ''
  };

  connect(): void {
    this.sent.push({ event: 'connect' });
  }

  disconnect(): void {
    this.sent.push({ event: 'disconnect:client' });
    this.emit('disconnect', undefined);
  }

  /**
   * 支持 token 参数的 join 方法
   */
  join(playerName: string, token?: string, forceReplace?: boolean): void {
    // 中文注释：保存参数用于 retryWithForceReplace
    this._lastJoinParams = { playerName, token };

    const payload: {
      playerName: string;
      token?: string;
      forceReplace?: boolean;
    } = {
      playerName
    };

    // 中文注释：根据是否有 forceReplace 参数判断
    if (forceReplace !== undefined) {
      payload.token = token;
      payload.forceReplace = forceReplace;
    } else if (token) {
      // 中文注释：兼容旧 code 参数（无 token 时）
      payload.token = token;
    }

    this.sent.push({ event: 'client:join', payload });
  }

  /**
   * 使用 forceReplace=true 重新加入
   */
  retryWithForceReplace(): void {
    const { playerName, token } = this._lastJoinParams;
    if (playerName) {
      this.join(playerName, token, true);
    }
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

describe('token-join', () => {
  /**
   * 测试1: join 时应携带 token 参数
   */
  it('join 时应发送 token 参数到服务端', () => {
    const gateway = new TokenAwareFakeGateway();
    const service = createSignalingService(gateway);

    // 中文注释：传入 token 进行 join
    const mockToken = 'test-jwt-token-12345';
    service.join('Alice', mockToken);

    // 中文注释：验证发送的 payload 包含 token 字段
    const joinPayload = gateway.sent.find((s) => s.event === 'client:join')
      ?.payload as { playerName: string; token?: string };

    expect(joinPayload).toBeDefined();
    expect(joinPayload.playerName).toBe('Alice');
    expect(joinPayload.token).toBe(mockToken);
  });

  /**
   * 测试2: FORCE_REPLACE_REQUIRED 时可二次传 forceReplace=true
   */
  it('收到 FORCE_REPLACE_REQUIRED 时可使用 forceReplace 重新加入', () => {
    const gateway = new TokenAwareFakeGateway();
    const service = createSignalingService(gateway);

    const mockToken = 'test-jwt-token';

    // 中文注释：第一次 join 收到冲突拒绝
    service.join('Alice', mockToken);
    gateway.emit('connect:denied', {
      reason: 'FORCE_REPLACE_REQUIRED',
      message: '当前玩家已在线，是否强制替换'
    });

    expect(service.getState().status).toBe('denied');
    expect(service.getState().denyReason).toBe('FORCE_REPLACE_REQUIRED');

    // 中文注释：调用重试替换方法，使用上次相同的 token
    service.retryWithForceReplace?.();

    // 中文注释：验证重试时发送了 forceReplace=true
    const joinPayloads = gateway.sent.filter((s) => s.event === 'client:join');

    // 最后一个 join payload 应该有 forceReplace=true
    const lastPayload = joinPayloads[joinPayloads.length - 1].payload as {
      playerName: string;
      token?: string;
      forceReplace?: boolean;
    };

    expect(lastPayload.forceReplace).toBe(true);
    expect(lastPayload.token).toBe(mockToken);
  });

  /**
   * 测试3: TOKEN_EXPIRED 时触发重新验证路径
   */
  it('收到 TOKEN_EXPIRED 时应触发重新验证回调', () => {
    const gateway = new TokenAwareFakeGateway();
    const onTokenExpired = vi.fn();

    // 中文注释：创建带有 onTokenExpired 回调的服务
    const service = createSignalingService(gateway, {
      onTokenExpired
    });

    // 中文注释：使用 token 加入
    service.join('Alice', 'expired-token');

    // 中文注释：服务端返回 TOKEN_EXPIRED
    gateway.emit('connect:denied', {
      reason: 'TOKEN_EXPIRED',
      message: '令牌已过期，请重新登录'
    });

    // 中文注释：验证触发了重新验证回调
    expect(service.getState().denyReason).toBe('TOKEN_EXPIRED');
    expect(onTokenExpired).toHaveBeenCalled();
  });
});
