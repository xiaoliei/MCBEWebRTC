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

interface MinecraftPlayerMessageEvent {
  header?: {
    messagePurpose?: string;
    eventName?: string; // 某些版本在这里
  };
  body?: {
    eventName?: string; // 某些版本在这里
    properties?: {
      Message?: string;
      Sender?: string;
    };
    // 某些版本直接在 body 下
    message?: string;
    sender?: string;
  };
}

interface MinecraftCommandResponseMessage {
  header?: {
    messagePurpose?: string;
    requestId?: string;
  };
  body?: {
    statusCode?: number;
  };
}

export class McGateway {
  private static activeGateway: McGateway | null = null;

  private static readonly playerMessageListeners = new Set<
    (payload: { playerName: string; message: string }) => void
  >();

  private readonly port: number;

  private readonly debug: boolean;

  private readonly onPlayerTransform: (
    payload: BridgePositionUpdatePayload
  ) => void;

  private wss: WebSocketServer | null = null;

  private mcSocket: WebSocket | null = null;

  private readonly pendingCommandByRequestId = new Map<
    string,
    (success: boolean) => void
  >();

  public constructor(options: McGatewayOptions) {
    this.port = options.port;
    this.debug = options.debug;
    this.onPlayerTransform = options.onPlayerTransform;
  }

  public static getActiveGateway(): McGateway | null {
    return McGateway.activeGateway;
  }

  public static addPlayerMessageListener(
    listener: (payload: { playerName: string; message: string }) => void
  ): void {
    McGateway.playerMessageListeners.add(listener);
  }

  public static removePlayerMessageListener(
    listener: (payload: { playerName: string; message: string }) => void
  ): void {
    McGateway.playerMessageListeners.delete(listener);
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

    McGateway.activeGateway = this;

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
      this.subscribePlayerMessage(socket);

      socket.on('message', (rawMessage) => {
        const raw = rawMessage.toString();

        if (this.debug) {
          console.log('[mcwss][gateway] received raw message:', raw);
        }

        this.tryHandleCommandResponse(raw);
        this.tryHandlePlayerMessage(raw);

        const payload = this.tryParseTransform(raw);
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

        // 中文注释：连接断开时将所有挂起命令标记失败，避免上游 Promise 永久悬挂。
        this.resolveAllPendingCommands(false);

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
    this.resolveAllPendingCommands(false);

    if (McGateway.activeGateway === this) {
      McGateway.activeGateway = null;
    }
  }

  public sendCommand({
    commandLine,
    originType = 'player'
  }: {
    commandLine: string;
    originType?: string;
  }): Promise<boolean> {
    const socket = this.mcSocket;
    if (!socket) {
      return Promise.resolve(false);
    }

    const requestId = uuidv4();

    return new Promise<boolean>((resolve) => {
      this.pendingCommandByRequestId.set(requestId, resolve);

      try {
        socket.send(
          JSON.stringify({
            body: {
              origin: { type: originType },
              commandLine,
              version: 1
            },
            header: {
              requestId,
              messagePurpose: 'commandRequest',
              version: 1,
              messageType: 'commandRequest'
            }
          })
        );
      } catch (error) {
        this.pendingCommandByRequestId.delete(requestId);
        console.error('[mcwss][gateway] failed to send command:', error);
        resolve(false);
      }
    });
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
          eventName: 'PlayerTransform'
        }
      })
    );
    if (this.debug) {
      console.log('[mcwss][gateway] 已订阅 PlayerTransform 事件');
    }
  }

  // 中文注释：手动鉴权依赖玩家聊天消息，网关在连接建立后订阅 PlayerMessage。
  private subscribePlayerMessage(socket: WebSocket): void {
    socket.send(
      JSON.stringify({
        header: {
          version: 1,
          requestId: uuidv4(),
          messageType: 'commandRequest',
          messagePurpose: 'subscribe'
        },
        body: {
          eventName: 'PlayerMessage',
          version: 1
        }
      })
    );

    if (this.debug) {
      console.log('[mcwss][gateway] 已订阅 PlayerMessage 事件');
    }
  }

  private tryHandlePlayerMessage(rawMessage: string): void {
    let message: MinecraftPlayerMessageEvent;
    try {
      message = JSON.parse(rawMessage) as MinecraftPlayerMessageEvent;
    } catch {
      return;
    }

    if (message.header?.messagePurpose !== 'event') {
      return;
    }

    // 处理某些版本 EventName 可能在 header 或 body 中的情况
    const eventName = message.header?.eventName ?? message.body?.eventName;
    if (eventName !== 'PlayerMessage') {
      return;
    }

    const { body } = message;
    if (!body) {
      return;
    }

    // 优先从 properties 取，备选方案直接从 body 取
    const playerName = (body.properties?.Sender ?? body.sender ?? '').trim();
    const text = (body.properties?.Message ?? body.message ?? '').trim();

    if (this.debug) {
      console.log(
        `[mcwss][gateway] 尝试转发消息: playerName="${playerName}", text="${text}"`
      );
    }

    if (!playerName || !text) {
      return;
    }

    for (const listener of McGateway.playerMessageListeners) {
      listener({ playerName, message: text });
    }
  }

  private tryHandleCommandResponse(rawMessage: string): void {
    let message: MinecraftCommandResponseMessage;
    try {
      message = JSON.parse(rawMessage) as MinecraftCommandResponseMessage;
    } catch {
      return;
    }

    if (message.header?.messagePurpose !== 'commandResponse') {
      return;
    }

    const requestId = String(message.header.requestId ?? '').trim();
    if (!requestId) {
      return;
    }

    const resolver = this.pendingCommandByRequestId.get(requestId);
    if (!resolver) {
      return;
    }

    this.pendingCommandByRequestId.delete(requestId);
    resolver(message.body?.statusCode === 0);
  }

  private resolveAllPendingCommands(success: boolean): void {
    for (const resolve of this.pendingCommandByRequestId.values()) {
      resolve(success);
    }
    this.pendingCommandByRequestId.clear();
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
    if (message.header?.eventName !== 'PlayerTransform') {
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
