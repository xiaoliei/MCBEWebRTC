import jwt from "jsonwebtoken";

export interface BridgeJwtPayload {
  role: "mc-bridge";
  gatewayId: string;
  iat: number;
  exp: number;
}

export type VerifyBridgeJwtFailureReason =
  | "MISSING_TOKEN"
  | "TOKEN_EXPIRED"
  | "INVALID_TOKEN"
  | "INVALID_ROLE";

export type VerifyBridgeJwtResult =
  | { ok: true; payload: BridgeJwtPayload }
  | { ok: false; reason: VerifyBridgeJwtFailureReason };

function isBridgeJwtPayload(value: unknown): value is BridgeJwtPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<BridgeJwtPayload>;
  return (
    payload.role === "mc-bridge" &&
    typeof payload.gatewayId === "string" &&
    payload.gatewayId.trim().length > 0 &&
    typeof payload.iat === "number" &&
    typeof payload.exp === "number"
  );
}

export function verifyBridgeJwtToken(
  token: string,
  bridgeJwtSecret: string,
): VerifyBridgeJwtResult {
  if (!token.trim()) {
    return { ok: false, reason: "MISSING_TOKEN" };
  }

  try {
    const decoded = jwt.verify(token, bridgeJwtSecret);
    if (!isBridgeJwtPayload(decoded)) {
      return { ok: false, reason: "INVALID_ROLE" };
    }
    return { ok: true, payload: decoded };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return { ok: false, reason: "TOKEN_EXPIRED" };
    }
    return { ok: false, reason: "INVALID_TOKEN" };
  }
}