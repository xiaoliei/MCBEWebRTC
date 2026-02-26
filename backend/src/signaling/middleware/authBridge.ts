import type { Socket } from "socket.io";
import {
  verifyBridgeJwtToken,
  type BridgeJwtPayload,
  type VerifyBridgeJwtFailureReason,
} from "../../utils/jwt.js";

export interface BridgeAuthInfo {
  isBridge: boolean;
  authorized: boolean;
  gatewayId?: string;
  payload?: BridgeJwtPayload;
  rejectReason?: VerifyBridgeJwtFailureReason;
}

export function authBridge(
  socket: Socket,
  bridgeJwtSecret: string,
): BridgeAuthInfo {
  const clientType = String(socket.handshake.auth?.clientType ?? "").trim();
  const isBridge = clientType === "mc-bridge";
  if (!isBridge) {
    return { isBridge: false, authorized: false };
  }

  const token = String(socket.handshake.auth?.token ?? "").trim();
  const verified = verifyBridgeJwtToken(token, bridgeJwtSecret);
  if (!verified.ok) {
    return {
      isBridge: true,
      authorized: false,
      rejectReason: verified.reason,
    };
  }

  return {
    isBridge: true,
    authorized: true,
    gatewayId: verified.payload.gatewayId,
    payload: verified.payload,
  };
}
