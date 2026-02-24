import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { createSignalingService } from '../../src/signaling/createSignalingService';
import type {
  GatewayEventMap,
  SocketGateway
} from '../../src/signaling/SocketGateway';

class FakeGateway implements SocketGateway {
  public readonly sent: Array<{ event: string; payload?: unknown }> = [];
  private handlers: Partial<
    Record<keyof GatewayEventMap, Array<(payload: unknown) => void>>
  > = {};

  connect(): void {
    this.sent.push({ event: 'connect' });
  }
  disconnect(): void {
    this.sent.push({ event: 'disconnect:client' });
    this.emit('disconnect', undefined);
  }
  join(playerName: string): void {
    this.sent.push({ event: 'client:join', payload: { playerName } });
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

describe('App MVP flow', () => {
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
      ]
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
});
