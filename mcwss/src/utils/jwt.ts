import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";

export interface BridgeJwtPayload {
  role: "mc-bridge";
  gatewayId: string;
  iat: number;
  exp: number;
}

export interface IssuedBridgeJwt {
  token: string;
  gatewayId: string;
  expiresAtMs: number;
}

function parseExpiresInToMs(expiresIn: SignOptions["expiresIn"]): number {
  if (typeof expiresIn === "number") {
    return expiresIn * 1000;
  }

  const rawValue = String(expiresIn ?? "2h").trim();
  const match = rawValue.match(/^(\d+)([smhd])$/i);
  if (!match) {
    throw new Error(`JWT_EXPIRES_IN 格式无效: ${rawValue}`);
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return value * multipliers[unit];
}

export function issueBridgeJwt(
  bridgeJwtSecret: string,
  expiresIn: SignOptions["expiresIn"] = "2h",
): IssuedBridgeJwt {
  const gatewayId = randomUUID();

  // 中文注释：只把稳定业务字段放入 payload，iat/exp 由 jsonwebtoken 自动注入。
  const token = jwt.sign({ role: "mc-bridge", gatewayId }, bridgeJwtSecret, {
    algorithm: "HS256",
    expiresIn,
  });

  return {
    token,
    gatewayId,
    expiresAtMs: Date.now() + parseExpiresInToMs(expiresIn),
  };
}

export function extractGatewayIdFromToken(token: string): string | null {
  const decoded = jwt.decode(token);
  if (typeof decoded !== "object" || decoded === null) {
    return null;
  }

  const payload = decoded as Partial<BridgeJwtPayload>;
  return typeof payload.gatewayId === "string" ? payload.gatewayId : null;
}