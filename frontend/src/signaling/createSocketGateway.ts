import { io } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents
} from '../../../shared/src/types/signaling.js';
import type { SocketGateway } from './SocketGateway';

interface SocketLike {
  connect(): void;
  disconnect(): void;
  on(event: string, handler: (payload?: unknown) => void): void;
  off(event: string, handler: (payload?: unknown) => void): void;
  emit(event: string, payload?: unknown): void;
}

export function createSocketGateway(
  createClient?: () => SocketLike
): SocketGateway {
  const client: SocketLike =
    createClient?.() ??
    (io({
      autoConnect: false,
      transports: ['websocket']
    }) as unknown as SocketLike);

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
