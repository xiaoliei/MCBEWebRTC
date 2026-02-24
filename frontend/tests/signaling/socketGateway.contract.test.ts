import { describe, expect, it, vi } from 'vitest';
import { createSocketGateway } from '../../src/signaling/createSocketGateway';

interface MockSocket {
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, payload?: unknown) => void;
  on: (event: string, handler: (payload?: unknown) => void) => void;
  off: (event: string, handler?: (payload?: unknown) => void) => void;
  connected: boolean;
}

function createMockSocket(): MockSocket {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    connected: false
  };
}

describe('createSocketGateway', () => {
  it('应按约定发送 client:join / presence:list:req / webrtc:* 事件', () => {
    const socket = createMockSocket();
    const gateway = createSocketGateway(() => socket);

    gateway.join('Alice');
    gateway.requestPresenceList();
    gateway.sendOffer('s-2', { sdp: 'offer' });
    gateway.sendAnswer('s-2', { sdp: 'answer' });
    gateway.sendCandidate('s-2', { candidate: 'abc' });

    expect(socket.emit).toHaveBeenCalledWith('client:join', {
      playerName: 'Alice'
    });
    expect(socket.emit).toHaveBeenCalledWith('presence:list:req');
    expect(socket.emit).toHaveBeenCalledWith('webrtc:offer', {
      toSessionId: 's-2',
      data: { sdp: 'offer' }
    });
    expect(socket.emit).toHaveBeenCalledWith('webrtc:answer', {
      toSessionId: 's-2',
      data: { sdp: 'answer' }
    });
    expect(socket.emit).toHaveBeenCalledWith('webrtc:candidate', {
      toSessionId: 's-2',
      data: { candidate: 'abc' }
    });
  });

  it('应按约定订阅并取消 connected / connect:denied / presence:nearby 事件', () => {
    const socket = createMockSocket();
    const gateway = createSocketGateway(() => socket);
    const connectedHandler = vi.fn();
    const deniedHandler = vi.fn();
    const nearbyHandler = vi.fn();

    const unsubConnected = gateway.on('connected', connectedHandler);
    const unsubDenied = gateway.on('connect:denied', deniedHandler);
    const unsubNearby = gateway.on('presence:nearby', nearbyHandler);

    expect(socket.on).toHaveBeenCalledWith('connected', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith(
      'connect:denied',
      expect.any(Function)
    );
    expect(socket.on).toHaveBeenCalledWith(
      'presence:nearby',
      expect.any(Function)
    );

    unsubConnected();
    unsubDenied();
    unsubNearby();

    expect(socket.off).toHaveBeenCalledWith('connected', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith(
      'connect:denied',
      expect.any(Function)
    );
    expect(socket.off).toHaveBeenCalledWith(
      'presence:nearby',
      expect.any(Function)
    );
  });
});
