import { io, type Socket } from 'socket.io-client';
import type { BridgePositionUpdatePayload } from './types.js';
import { issueBridgeJwt } from './utils/jwt.js';

interface SignalingBridgeOptions {
  backendUrl: string;
  bridgeJwtSecret: string;
  jwtExpiresIn: string;
  debug: boolean;
}

export class SignalingBridge {
  private static readonly REFRESH_AHEAD_MS = 30 * 60 * 1000;

  private readonly backendUrl: string;

  private readonly bridgeJwtSecret: string;

  private readonly jwtExpiresIn: string;

  private readonly debug: boolean;

  private socket: Socket | null = null;

  private bridgeAuthToken = '';

  private gatewayId = '';

  private tokenExpiresAtMs = 0;

  private refreshTimer: NodeJS.Timeout | null = null;

  public constructor(options: SignalingBridgeOptions) {
    this.backendUrl = options.backendUrl;
    this.bridgeJwtSecret = options.bridgeJwtSecret;
    this.jwtExpiresIn = options.jwtExpiresIn;
    this.debug = options.debug;
  }

  public start(): void {
    this.rotateToken();
    this.scheduleTokenRefresh();

    this.socket = io(this.backendUrl, {
      path: '/socket.io',
      autoConnect: true,
      transports: ['websocket'],
      auth: {
        clientType: 'mc-bridge',
        token: this.bridgeAuthToken
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0
    });

    this.socket.on('connect', () => {
      console.log(
        `[mcwss][bridge] connected: ${this.backendUrl} gatewayId=${this.gatewayId}`
      );
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

      // 中文注释：鉴权失败时主动轮换 JWT 并快速重连，减少人工干预。
      this.reconnectWithFreshToken();
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
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

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

  private rotateToken(): void {
    const issued = issueBridgeJwt(this.bridgeJwtSecret, this.jwtExpiresIn);
    this.bridgeAuthToken = issued.token;
    this.gatewayId = issued.gatewayId;
    this.tokenExpiresAtMs = issued.expiresAtMs;

    if (this.debug) {
      console.log(
        `[mcwss][bridge] rotated jwt gatewayId=${this.gatewayId} expiresAt=${new Date(this.tokenExpiresAtMs).toISOString()}`
      );
    }
  }

  private scheduleTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    const delay = Math.max(
      5_000,
      this.tokenExpiresAtMs - Date.now() - SignalingBridge.REFRESH_AHEAD_MS
    );

    this.refreshTimer = setTimeout(() => {
      this.reconnectWithFreshToken();
    }, delay);
  }

  private reconnectWithFreshToken(): void {
    this.rotateToken();
    this.scheduleTokenRefresh();

    if (!this.socket) {
      return;
    }

    this.socket.auth = {
      clientType: 'mc-bridge',
      token: this.bridgeAuthToken
    };
    this.socket.disconnect();
    this.socket.connect();
  }
}
