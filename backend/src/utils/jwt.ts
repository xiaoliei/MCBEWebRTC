import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

export interface BridgeJwtPayload {
  role: "mc-bridge";
  gatewayId: string;
  iat: number;
  exp: number;
}

export type VerifyBridgeJwtFailureReason =
  | "TOKEN_MISSING"
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALID"
  | "INVALID_ROLE";

export type VerifyBridgeJwtResult =
  | { ok: true; payload: BridgeJwtPayload }
  | { ok: false; reason: VerifyBridgeJwtFailureReason };

export interface PlayerJwtPayload {
  role: "player";
  jti: string;
  playerName: string;
  iat: number;
  exp: number;
}

export type VerifyPlayerJwtFailureReason =
  | "TOKEN_MISSING"
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALID";

export type VerifyPlayerJwtResult =
  | { ok: true; payload: PlayerJwtPayload }
  | { ok: false; reason: VerifyPlayerJwtFailureReason };

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

function isPlayerJwtPayload(value: unknown): value is PlayerJwtPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<PlayerJwtPayload>;
  return (
    payload.role === "player" &&
    typeof payload.jti === "string" &&
    payload.jti.trim().length > 0 &&
    typeof payload.playerName === "string" &&
    payload.playerName.trim().length > 0 &&
    typeof payload.iat === "number" &&
    typeof payload.exp === "number"
  );
}

export function verifyBridgeJwtToken(
  token: string,
  bridgeJwtSecret: string,
): VerifyBridgeJwtResult {
  if (!token.trim()) {
    return { ok: false, reason: "TOKEN_MISSING" };
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
    return { ok: false, reason: "TOKEN_INVALID" };
  }
}

export function issuePlayerJwtToken(
  secret: string,
  expiresIn: jwt.SignOptions["expiresIn"],
  playerName: string,
): string {
  // player token 用于玩家身份，显式写入 role 与 jti，避免与 bridge token 混用。
  return jwt.sign(
    {
      role: "player",
      jti: randomUUID(),
      playerName,
    },
    secret,
    {
      algorithm: "HS256",
      expiresIn,
    },
  );
}

export function verifyPlayerJwtToken(
  token: string,
  secret: string,
): VerifyPlayerJwtResult {
  if (!token.trim()) {
    return { ok: false, reason: "TOKEN_MISSING" };
  }

  try {
    // player token 校验只验证签名和 payload 结构，业务侧可继续校验 playerName 是否匹配目标玩家。
    const decoded = jwt.verify(token, secret);
    if (!isPlayerJwtPayload(decoded)) {
      return { ok: false, reason: "TOKEN_INVALID" };
    }
    return { ok: true, payload: decoded };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return { ok: false, reason: "TOKEN_EXPIRED" };
    }
    return { ok: false, reason: "TOKEN_INVALID" };
  }
}
