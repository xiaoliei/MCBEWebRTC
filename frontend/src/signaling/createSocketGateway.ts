import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents
} from '../../../shared/src/types/signaling.js';
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

  return {
    connect() {
      client.connect();
    },
    disconnect() {
      client.disconnect();
    },
    join(playerName, code) {
      const payload: ClientToServerEvents['client:join'] extends (
        arg: infer T
      ) => void
        ? T
        : never = {
        playerName,
        ...(code ? { code } : {})
      };
      client.emit('client:join', payload);
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
