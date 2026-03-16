import { describe, expect, it, vi } from 'vitest';
import { SignalingBridge } from '../../src/signalingBridge.js';
import { issueBridgeJwt } from '../../src/utils/jwt.js';

class FakeSocket {
  public connected = true;

  public auth: Record<string, unknown> = {};

  public readonly handlers = new Map<string, (...args: unknown[]) => void>();

  public readonly emitted: Array<{ event: string; payload: unknown }> = [];

  public readonly io = {
    on: vi.fn()
  };

  public on(event: string, handler: (...args: unknown[]) => void): this {
    this.handlers.set(event, handler);
    return this;
  }

  public emit(event: string, payload?: unknown): boolean {
    this.emitted.push({ event, payload });
    return true;
  }

  public disconnect(): this {
    return this;
  }

  public connect(): this {
    return this;
  }

  public trigger(event: string, payload?: unknown): void {
    const handler = this.handlers.get(event);
    if (handler) {
      handler(payload);
    }
  }
}

const ioMock = vi.fn();

vi.mock('socket.io-client', () => {
  return {
    io: (...args: unknown[]) => ioMock(...args)
  };
});

vi.mock('../../src/utils/jwt.js', () => {
  return {
    issueBridgeJwt: vi.fn(() => ({
      token: 'mock-token',
      gatewayId: 'mock-gateway',
      expiresAtMs: Date.now() + 2 * 60 * 60 * 1000
    }))
  };
});

describe('SignalingBridge auth tell integration', () => {
  it('收到 bridge:auth:tell:send 会组装正确命令请求', () => {
    const socket = new FakeSocket();
    ioMock.mockReturnValue(socket);
    const sendTellCommand = vi.fn().mockResolvedValue(true);

    const bridge = new SignalingBridge({
      backendUrl: 'http://127.0.0.1:3000',
      bridgeJwtSecret: 'secure-secret-123456',
      jwtExpiresIn: '2h',
      debug: false,
      sendTellCommand
    } as never);

    bridge.start();
    socket.trigger('bridge:auth:tell:send', { playerName: 'Steve', code: '123456' });

    expect(sendTellCommand).toHaveBeenCalledWith({
      playerName: 'Steve',
      code: '123456'
    });
  });

  it('tell 发送成功上报 bridge:auth:tell:sent', async () => {
    const socket = new FakeSocket();
    ioMock.mockReturnValue(socket);
    const sendTellCommand = vi.fn().mockResolvedValue(true);

    const bridge = new SignalingBridge({
      backendUrl: 'http://127.0.0.1:3000',
      bridgeJwtSecret: 'secure-secret-123456',
      jwtExpiresIn: '2h',
      debug: false,
      sendTellCommand
    } as never);

    bridge.start();
    socket.trigger('bridge:auth:tell:send', { playerName: 'Steve', code: '123456' });

    await Promise.resolve();

    expect(
      socket.emitted.some((entry) => entry.event === 'bridge:auth:tell:sent')
    ).toBe(true);
  });

  it('tell 失败上报 bridge:auth:tell:failed', async () => {
    const socket = new FakeSocket();
    ioMock.mockReturnValue(socket);
    const sendTellCommand = vi.fn().mockResolvedValue(false);

    const bridge = new SignalingBridge({
      backendUrl: 'http://127.0.0.1:3000',
      bridgeJwtSecret: 'secure-secret-123456',
      jwtExpiresIn: '2h',
      debug: false,
      sendTellCommand
    } as never);

    bridge.start();
    socket.trigger('bridge:auth:tell:send', { playerName: 'Steve', code: '123456' });

    await Promise.resolve();

    expect(
      socket.emitted.some((entry) => entry.event === 'bridge:auth:tell:failed')
    ).toBe(true);
  });

  it('短 TTL 时按比例提前刷新，不会退化为 5 秒轮询', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16T00:00:00.000Z'));

    const socket = new FakeSocket();
    ioMock.mockReturnValue(socket);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    vi.mocked(issueBridgeJwt).mockReturnValue({
      token: 'short-ttl-token',
      gatewayId: 'short-ttl-gateway',
      expiresAtMs: Date.now() + 10 * 60 * 1000
    });

    const bridge = new SignalingBridge({
      backendUrl: 'http://127.0.0.1:3000',
      bridgeJwtSecret: 'secure-secret-123456',
      jwtExpiresIn: '10m',
      debug: false
    } as never);

    bridge.start();

    expect(setTimeoutSpy).toHaveBeenCalled();
    const delay = setTimeoutSpy.mock.calls[0]?.[1];
    expect(delay).toBe(9 * 60 * 1000);

    setTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });

  it('长 TTL 时刷新提前量有上限，不会等到快过期才刷新', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16T00:00:00.000Z'));

    const socket = new FakeSocket();
    ioMock.mockReturnValue(socket);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    vi.mocked(issueBridgeJwt).mockReturnValue({
      token: 'long-ttl-token',
      gatewayId: 'long-ttl-gateway',
      expiresAtMs: Date.now() + 2 * 60 * 60 * 1000
    });

    const bridge = new SignalingBridge({
      backendUrl: 'http://127.0.0.1:3000',
      bridgeJwtSecret: 'secure-secret-123456',
      jwtExpiresIn: '2h',
      debug: false
    } as never);

    bridge.start();

    expect(setTimeoutSpy).toHaveBeenCalled();
    const delay = setTimeoutSpy.mock.calls[0]?.[1];
    expect(delay).toBe(115 * 60 * 1000);

    setTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });
});
