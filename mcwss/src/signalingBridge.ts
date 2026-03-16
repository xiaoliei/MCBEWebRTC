import { io, type Socket } from 'socket.io-client';
import { McGateway } from './mcGateway.js';
import type { BridgePositionUpdatePayload } from './types.js';
import {
  createManualAuthWatcher,
  type ManualAuthWatcher
} from './services/command/manualAuthWatcher.js';
import {
  createSendTellCommand,
  type SendTellCommand
} from './services/command/sendTellCommand.js';
import { issueBridgeJwt } from './utils/jwt.js';

interface SignalingBridgeOptions {
  backendUrl: string;
  bridgeJwtSecret: string;
  jwtExpiresIn: string;
  debug: boolean;
  sendTellCommand?: SendTellCommand;
}

interface BridgeTellSendPayload {
  playerName?: string;
  code?: string;
}

interface BridgeManualWatchStartPayload {
  playerName?: string;
  challenge?: string;
}

interface BridgeManualWatchStopPayload {
  playerName?: string;
}

export class SignalingBridge {
  private static readonly MIN_REFRESH_DELAY_MS = 5_000;

  private static readonly MIN_REFRESH_AHEAD_MS = 30_000;

  private static readonly MAX_REFRESH_AHEAD_MS = 5 * 60 * 1000;

  private readonly backendUrl: string;

  private readonly bridgeJwtSecret: string;

  private readonly jwtExpiresIn: string;

  private readonly debug: boolean;

  private readonly sendTellCommand: SendTellCommand;

  private socket: Socket | null = null;

  private bridgeAuthToken = '';

  private gatewayId = '';

  private tokenExpiresAtMs = 0;

  private refreshTimer: NodeJS.Timeout | null = null;

  private manualAuthWatcher: ManualAuthWatcher | null = null;

  private readonly onGatewayPlayerMessage = (payload: {
    playerName: string;
    message: string;
  }): void => {
    if (this.debug) {
      console.log(`[MCWSS Debug] PlayerMessage received from "${payload.playerName}": ${payload.message}`);
    }
    this.manualAuthWatcher?.handlePlayerMessage(payload);
  };

  public constructor(options: SignalingBridgeOptions) {
    this.backendUrl = options.backendUrl;
    this.bridgeJwtSecret = options.bridgeJwtSecret;
    this.jwtExpiresIn = options.jwtExpiresIn;
    this.debug = options.debug;

    this.sendTellCommand =
      options.sendTellCommand ??
      createSendTellCommand({
        sendCommand: async ({ commandLine, originType }) => {
          const gateway = McGateway.getActiveGateway();
          if (!gateway) {
            return false;
          }
          return gateway.sendCommand({ commandLine, originType });
        }
      });
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

    this.manualAuthWatcher = createManualAuthWatcher({
      onMatched: ({ playerName, challenge }) => {
        this.socket?.emit('bridge:auth:manual:matched', {
          playerName,
          challenge
        });
      }
    });

    McGateway.addPlayerMessageListener(this.onGatewayPlayerMessage);

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

    this.socket.on('bridge:auth:tell:send', (payload: BridgeTellSendPayload) => {
      void this.handleTellSend(payload);
    });

    this.socket.on(
      'bridge:auth:manual:watch:start',
      (payload: BridgeManualWatchStartPayload) => {
        const playerName = String(payload?.playerName ?? '').trim();
        const challenge = String(payload?.challenge ?? '').trim();
        if (!playerName || !challenge) {
          return;
        }

        this.manualAuthWatcher?.startWatch({ playerName, challenge });
      }
    );

    this.socket.on(
      'bridge:auth:manual:watch:stop',
      (payload: BridgeManualWatchStopPayload) => {
        const playerName = String(payload?.playerName ?? '').trim();
        if (!playerName) {
          return;
        }

        this.manualAuthWatcher?.stopWatch(playerName);
      }
    );

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

    McGateway.removePlayerMessageListener(this.onGatewayPlayerMessage);
    this.manualAuthWatcher = null;

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

  private async handleTellSend(payload: BridgeTellSendPayload): Promise<void> {
    const playerName = String(payload?.playerName ?? '').trim();
    const code = String(payload?.code ?? '').trim();
    if (!playerName || !code) {
      return;
    }

    const sent = await this.sendTellCommand({ playerName, code });
    if (sent) {
      this.socket?.emit('bridge:auth:tell:sent', { playerName, code });
      return;
    }

    this.socket?.emit('bridge:auth:tell:failed', { playerName, code });
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

    const delay = this.computeRefreshDelay(Date.now(), this.tokenExpiresAtMs);

    this.refreshTimer = setTimeout(() => {
      this.reconnectWithFreshToken();
    }, delay);
  }

  private computeRefreshDelay(now: number, expiresAtMs: number): number {
    const remainingMs = Math.max(0, expiresAtMs - now);
    const proportionalAheadMs = Math.floor(remainingMs * 0.1);
    const refreshAheadMs = Math.min(
      SignalingBridge.MAX_REFRESH_AHEAD_MS,
      Math.max(SignalingBridge.MIN_REFRESH_AHEAD_MS, proportionalAheadMs)
    );

    return Math.max(
      SignalingBridge.MIN_REFRESH_DELAY_MS,
      remainingMs - refreshAheadMs
    );
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
