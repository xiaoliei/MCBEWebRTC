import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents } from '@mcbewebrtc/shared';
import type { SocketGateway } from './SocketGateway';

/**
 * SocketLike 接口定义了我们需要使用的 Socket.io 子集
 * 这样可以在测试中轻松 mock，而不需要完整的 Socket.io 实现
 */
interface SocketLike {
  connect(): void;
  disconnect(): void;
  on(event: string, handler: (payload?: unknown) => void): void;
  off(event: string, handler?: (payload?: unknown) => void): void;
  emit(event: string, payload?: unknown): void;
  readonly connected: boolean;
}

/**
 * 将 Socket.io Socket 对象适配为 SocketLike 接口
 */
function adaptSocketToSocketLike(socket: Socket): SocketLike {
  return {
    connect: () => socket.connect(),
    disconnect: () => socket.disconnect(),
    on: (event, handler) => socket.on(event, handler),
    off: (event, handler) => socket.off(event, handler),
    emit: (event, payload) => socket.emit(event, payload),
    get connected() {
      return socket.connected;
    }
  };
}

export function createSocketGateway(
  createClient?: () => SocketLike
): SocketGateway {
  const backendUrl = String(import.meta.env.VITE_BACKEND_URL ?? '').trim();

  const client: SocketLike =
    createClient?.() ??
    adaptSocketToSocketLike(
      io(backendUrl || undefined, {
        path: '/socket.io',
        autoConnect: false,
        transports: ['websocket']
      })
    );

  // 中文注释：保存最后一次 join 的参数，用于 forceReplace 重试
  let lastJoinParams: { playerName: string; token?: string } = {
    playerName: ''
  };

  return {
    connect() {
      client.connect();
    },
    disconnect() {
      client.disconnect();
    },
    /**
     * 加入游戏房间，支持 token 认证
     * @param playerName 玩家名称
     * @param token JWT 令牌（可选，用于令牌化加入）
     * @param forceReplace 是否强制替换已在线的连接
     */
    join(playerName: string, token?: string, forceReplace?: boolean) {
      // 中文注释：保存参数用于 forceReplace 重试
      lastJoinParams = { playerName, token };

      const payload: {
        playerName: string;
        token?: string;
        forceReplace?: boolean;
      } = { playerName };

      // 中文注释：只有当 token 存在时才添加到 payload
      if (token) {
        payload.token = token;
      }

      // 中文注释：只有明确传 forceReplace=true 时才发送
      if (forceReplace === true) {
        payload.forceReplace = true;
      }

      client.emit('client:join', payload);
    },
    /**
     * 使用 forceReplace=true 重新加入，用于处理 FORCE_REPLACE_REQUIRED 拒绝
     */
    retryWithForceReplace() {
      const { playerName, token } = lastJoinParams;
      if (!playerName) {
        return;
      }
      this.join(playerName, token, true);
    },
    requestPresenceList() {
      client.emit('presence:list:req');
    },
    sendOffer(toSessionId, data) {
      client.emit('webrtc:offer', { toSessionId, data });
    },
    sendAnswer(toSessionId, data) {
      client.emit('webrtc:answer', { toSessionId, data });
    },
    sendCandidate(toSessionId, data) {
      client.emit('webrtc:candidate', { toSessionId, data });
    },
    on(event, handler) {
      // 中文注释：统一封装事件订阅，避免组件层直接依赖 socket 实现细节。
      const wrapped = (payload?: unknown) => {
        (handler as (body: unknown) => void)(payload);
      };
      client.on(event, wrapped);
      return () => {
        client.off(event, wrapped);
      };
    }
  };
}

export type _ServerEvents = ServerToClientEvents;
