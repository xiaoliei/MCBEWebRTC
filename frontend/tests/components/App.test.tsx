import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { createSignalingService } from '../../src/signaling/createSignalingService';
import type {
  SignalingService,
  SignalingState
} from '../../src/signaling/createSignalingService';
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
  join(playerName: string): void {
    this.lastJoinParams = { playerName };
    this.sent.push({ event: 'client:join', payload: { playerName } });
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

function createStaticService(state: SignalingState): SignalingService {
  return {
    getState() {
      return state;
    },
    subscribe() {
      return () => {};
    },
    join() {},
    retryWithForceReplace() {},
    disconnect() {},
    dispose() {},
    requestPresence() {},
    sendOffer() {},
    sendAnswer() {},
    sendCandidate() {}
  };
}

describe('App MVP flow', () => {
  it('展示验证与操作区和状态信息区标题', () => {
    const service = createStaticService({
      status: 'idle',
      sessionId: '',
      playerName: '',
      nearbyPlayers: [],
      denyReason: '',
      peerStates: {},
      audioEnabled: false,
      microphoneGranted: false
    });

    render(<App service={service} />);

    expect(
      screen.getByRole('heading', { name: '验证与操作', level: 2 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '状态信息', level: 2 })
    ).toBeInTheDocument();
  });

  it('使用文本徽章而不是 emoji 展示远端音频状态', () => {
    const service = createStaticService({
      status: 'connected',
      sessionId: 's-1',
      playerName: 'Alice',
      nearbyPlayers: [],
      denyReason: '',
      peerStates: {
        's-2': {
          phase: 'connected',
          hasCandidate: true,
          iceConnectionState: 'connected',
          hasRemoteTrack: true,
          playerName: 'Bob'
        }
      },
      audioEnabled: true,
      microphoneGranted: true
    });

    render(<App service={service} />);

    expect(screen.getByText('音频中')).toBeInTheDocument();
    expect(screen.queryByText('🎧')).not.toBeInTheDocument();
  });

  it('输入昵称并加入后展示 connected/sessionId 与 nearby 列表', async () => {
    const user = userEvent.setup();
    const gateway = new FakeGateway();
    const service = createSignalingService(gateway);

    render(<App service={service} />);

    await user.type(screen.getByLabelText('昵称'), 'Alice');
    await user.click(screen.getByRole('button', { name: '加入' }));
    gateway.emit('connected', { sessionId: 's-1', playerName: 'Alice' });
    gateway.emit('presence:nearby', {
      players: [
        {
          sessionId: 's-2',
          playerName: 'Bob',
          position: { x: 1, y: 1, z: 1 },
          dim: 0
        }
      ],
      myPosition: null
    });

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('connected');
      expect(screen.getByTestId('session')).toHaveTextContent('s-1');
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  it('收到 DUPLICATE_NAME 时显示提示并可断开清理', async () => {
    const user = userEvent.setup();
    const gateway = new FakeGateway();
    const service = createSignalingService(gateway);

    render(<App service={service} />);

    await user.type(screen.getByLabelText('昵称'), 'Alice');
    await user.click(screen.getByRole('button', { name: '加入' }));
    gateway.emit('connect:denied', {
      reason: 'DUPLICATE_NAME',
      message: '玩家名已在线，请输入验证码重连'
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('昵称重复');
    });

    await user.click(screen.getByRole('button', { name: '断开' }));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('disconnected');
      expect(screen.getByTestId('session')).toHaveTextContent('-');
    });
  });

  it.each<ConnectDeniedReason>([
    'TOKEN_INVALID',
    'TOKEN_EXPIRED',
    'TOKEN_REVOKED',
    'TOKEN_MISSING',
    'TOKEN_PLAYER_MISMATCH'
  ])('收到 %s 时应提示重新验证', async (reason) => {
    const user = userEvent.setup();
    const gateway = new FakeGateway();
    const service = createSignalingService(gateway);

    render(<App service={service} />);

    await user.type(screen.getByLabelText('昵称'), 'Alice');
    await user.click(screen.getByRole('button', { name: '加入' }));
    gateway.emit('connect:denied', { reason });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Token 已过期，请重新验证');
      expect(screen.getByTestId('status')).toHaveTextContent('denied');
    });
  });

  it('收到 FORCE_REPLACE_REQUIRED 时应展示强制替换并触发重试', async () => {
    const user = userEvent.setup();
    const gateway = new FakeGateway();
    const service = createSignalingService(gateway);

    render(<App service={service} />);

    await user.type(screen.getByLabelText('昵称'), 'Alice');
    await user.click(screen.getByRole('button', { name: '加入' }));
    gateway.emit('connect:denied', { reason: 'FORCE_REPLACE_REQUIRED' });

    await waitFor(() => {
      expect(screen.getByText('该玩家已在线，是否强制替换？')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '强制替换' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '强制替换' }));

    expect(gateway.sent).toContainEqual({
      event: 'client:join',
      payload: { playerName: 'Alice', token: undefined, forceReplace: true }
    });
  });

  it('不应依赖 INVALID_TOKEN 分支', async () => {
    const user = userEvent.setup();
    const gateway = new FakeGateway();
    const service = createSignalingService(gateway);

    render(<App service={service} />);

    await user.type(screen.getByLabelText('昵称'), 'Alice');
    await user.click(screen.getByRole('button', { name: '加入' }));
    gateway.emit('connect:denied', {
      reason: 'INVALID_TOKEN' as unknown as ConnectDeniedReason
    });

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('denied');
    });
    expect(
      screen.queryByText('Token 已过期，请重新验证')
    ).not.toBeInTheDocument();
  });
});
