import type { Socket } from 'socket.io';

export interface BridgeAuthInfo {
  isBridge: boolean;
  authorized: boolean;
}

export function authBridge(socket: Socket, bridgeToken: string): BridgeAuthInfo {
  const clientType = String(socket.handshake.auth?.clientType ?? '').trim();
  const isBridge = clientType === 'mc-bridge';
  if (!isBridge) {
    return { isBridge: false, authorized: false };
  }

  const token = String(socket.handshake.auth?.token ?? '').trim();
  return {
    isBridge: true,
    authorized: token.length > 0 && token === bridgeToken
  };
}