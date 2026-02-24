import { io, type Socket } from 'socket.io-client';
import type { BridgePositionUpdatePayload } from './types.js';

interface SignalingBridgeOptions {
  backendUrl: string;
  bridgeToken: string;
  debug: boolean;
}

export class SignalingBridge {
  private readonly backendUrl: string;

  private readonly bridgeToken: string;

  private readonly debug: boolean;

  private socket: Socket | null = null;

  public constructor(options: SignalingBridgeOptions) {
    this.backendUrl = options.backendUrl;
    this.bridgeToken = options.bridgeToken;
    this.debug = options.debug;
  }

  public start(): void {
    this.socket = io(this.backendUrl, {
      path: '/socket.io',
      autoConnect: true,
      transports: ['websocket'],
      auth: {
        clientType: 'mc-bridge',
        token: this.bridgeToken
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0
    });

    this.socket.on('connect', () => {
      console.log(`[mcwss][bridge] connected: ${this.backendUrl}`);
    });

    this.socket.on('auth:accepted', () => {
      if (this.debug) {
        console.log('[mcwss][bridge] auth accepted');
      }
    });

    this.socket.on('auth:rejected', (payload: { reason?: string }) => {
      console.error(
        `[mcwss][bridge] auth rejected: ${String(payload?.reason ?? 'UNKNOWN')}`
      );
    });

    this.socket.on('disconnect', (reason) => {
      if (this.debug) {
        console.log(`[mcwss][bridge] disconnected: ${reason}`);
      }
    });

    this.socket.io.on('reconnect_attempt', (attemptCount) => {
      if (this.debug) {
        // 中文注释：socket.io 内置指数退避，这里仅输出重连尝试次数便于诊断。
        console.log(`[mcwss][bridge] reconnect attempt: #${attemptCount}`);
      }
    });

    this.socket.io.on('reconnect_error', (error) => {
      if (this.debug) {
        console.log(`[mcwss][bridge] reconnect error: ${String(error)}`);
      }
    });
  }

  public stop(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  public sendPositionUpdate(payload: BridgePositionUpdatePayload): boolean {
    const socket = this.socket;
    if (!socket?.connected) {
      return false;
    }

    socket.emit('bridge:position:update', payload);
    return true;
  }
}
