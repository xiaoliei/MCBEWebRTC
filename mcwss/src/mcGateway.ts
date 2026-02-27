import { WebSocketServer, type WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { BridgePositionUpdatePayload } from './types.js';

interface McGatewayOptions {
  port: number;
  debug: boolean;
  onPlayerTransform: (payload: BridgePositionUpdatePayload) => void;
}

interface MinecraftTransformMessage {
  header?: {
    eventName?: string;
  };
  body?: {
    player?: {
      name?: string;
      uniqueId?: string;
      id?: string;
      runtimeId?: string;
      position?: {
        x?: number;
        y?: number;
        z?: number;
      };
      dimension?: number;
    };
  };
}

export class McGateway {
  private readonly port: number;

  private readonly debug: boolean;

  private readonly onPlayerTransform: (
    payload: BridgePositionUpdatePayload
  ) => void;

  private wss: WebSocketServer | null = null;

  private mcSocket: WebSocket | null = null;

  public constructor(options: McGatewayOptions) {
    this.port = options.port;
    this.debug = options.debug;
    this.onPlayerTransform = options.onPlayerTransform;
  }

  public start(): void {
    try {
      this.wss = new WebSocketServer({ port: this.port });
      console.log(`[mcwss][gateway] listening on ws://0.0.0.0:${this.port}`);
    } catch (error) {
      console.error(
        `[mcwss][gateway] Failed to start WebSocket server on port ${this.port}:`,
        error
      );
      throw error;
    }

    this.wss.on('connection', (socket) => {
      if (this.mcSocket && this.mcSocket !== socket) {
        try {
          this.mcSocket.close(4000, 'replaced');
        } catch (error) {
          // 旧连接关闭失败不影响新连接接管，但记录日志便于调试
          console.error('[mcwss][gateway] failed to close old connection:', error);
        }
      }

      this.mcSocket = socket;
      if (this.debug) {
        console.log('[mcwss][gateway] connected');
      }

      this.subscribePlayerTransform(socket);

      socket.on('message', (rawMessage) => {
        const payload = this.tryParseTransform(rawMessage.toString());
        if (!payload) {
          return;
        }
        // 记录玩家移动事件日志
        if (this.debug) {
          console.log(
            `[mcwss][gateway] 玩家移动事件: ${payload.playerName} -> ` +
              `(${payload.position.x.toFixed(2)}, ${payload.position.y.toFixed(2)}, ${payload.position.z.toFixed(2)}) ` +
              `维度: ${payload.dim ?? '未知'}`
          );
        }
        this.onPlayerTransform(payload);
      });

      socket.on('close', () => {
        if (this.mcSocket === socket) {
          this.mcSocket = null;
        }
        if (this.debug) {
          console.log('[mcwss][gateway] disconnected');
        }
      });

      socket.on('error', (error) => {
        // 网关层吞掉底层 socket 错误，避免异常冒泡导致进程退出
        console.error('[mcwss][gateway] socket error:', error);
      });
    });
  }

  public stop(): void {
    try {
      this.wss?.close();
    } catch (error) {
      // 停止阶段忽略关闭异常，保证进程可继续退出，但记录日志
      console.error('[mcwss][gateway] failed to close WebSocket server:', error);
    }
    this.wss = null;
    this.mcSocket = null;
  }

  // TODO: 本期未实现 mc.command 接收,保留接口供后续使用
  public sendCommand({
    commandLine,
    originType = 'player'
  }: {
    commandLine: string;
    originType?: string;
  }): boolean {
    const socket = this.mcSocket;
    if (!socket) {
      return false;
    }

    try {
      socket.send(
        JSON.stringify({
          body: {
            origin: { type: originType },
            commandLine,
            version: 1
          },
          header: {
            requestId: uuidv4(),
            messagePurpose: 'commandRequest',
            version: 1,
            messageType: 'commandRequest'
          }
        })
      );
      return true;
    } catch (error) {
      console.error('[mcwss][gateway] failed to send command:', error);
      return false;
    }
  }

  // 订阅玩家移动事件
  private subscribePlayerTransform(socket: WebSocket): void {
    socket.send(
      JSON.stringify({
        header: {
          version: 1,
          requestId: uuidv4(),
          messageType: 'commandRequest',
          messagePurpose: 'subscribe'
        },
        body: {
          eventName: 'PlayerTravelled'
        }
      })
    );
    if (this.debug) {
      console.log('[mcwss][gateway] 已订阅 PlayerTravelled 事件');
    }
  }

  private tryParseTransform(
    rawMessage: string
  ): BridgePositionUpdatePayload | null {
    let message: MinecraftTransformMessage;
    try {
      message = JSON.parse(rawMessage) as MinecraftTransformMessage;
    } catch (error) {
      if (this.debug) {
        console.error('[mcwss][gateway] failed to parse message:', error);
      }
      return null;
    }

    // 验证是否为玩家移动事件
    if (message.header?.eventName !== 'PlayerTravelled') {
      return null;
    }

    const player = message.body?.player;
    const playerName = player?.name;
    const position = player?.position;
    const dimension = player?.dimension;

    // 验证必需字段和坐标有效性
    if (
      !playerName ||
      !position ||
      typeof position.x !== 'number' ||
      typeof position.y !== 'number' ||
      typeof position.z !== 'number' ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      return null;
    }

    // 验证维度有效性 (Minecraft 基岩版维度 ID 范围: 0-2)
    if (
      typeof dimension === 'number' &&
      (!Number.isFinite(dimension) || dimension < 0 || dimension > 2)
    ) {
      if (this.debug) {
        console.error(
          `[mcwss][gateway] Invalid dimension value: ${dimension}, must be between 0 and 2`
        );
      }
      return null;
    }

    return {
      playerName,
      playerId: player?.uniqueId ?? player?.id ?? player?.runtimeId ?? null,
      position: {
        x: position.x,
        y: position.y,
        z: position.z
      },
      dim: typeof dimension === 'number' ? dimension : null
    };
  }
}
