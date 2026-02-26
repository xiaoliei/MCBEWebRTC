export interface AppConfig {
  backendUrl: string;
  bridgeJwtSecret: string;
  jwtExpiresIn: string;
  gatewayPort: number;
  debug: boolean;
}

function parsePort(rawPort: string | undefined): number {
  const parsed = Number(rawPort);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
    return parsed;
  }
  return 8000;
}

function parseBool(rawValue: string | undefined): boolean {
  const normalized = String(rawValue ?? '')
    .trim()
    .toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function normalizeBackendUrl(rawUrl: string | undefined): string {
  const fallback = 'http://127.0.0.1:3000';
  const normalized = String(rawUrl ?? fallback).trim();
  return normalized.replace(/\/+$/, '');
}

/**
 * 验证并解析 BRIDGE_JWT_SECRET
 * 拒绝空值或常见的占位符值，防止生产环境使用不安全的密钥
 */
function parseBridgeJwtSecret(rawValue: string | undefined): string {
  const secret = rawValue?.trim() ?? '';
  const placeholders = [
    'change_me_in_production',
    'replace-with-strong-token',
    'your-secure-random-token-here',
    'your-token-here',
    'change-me',
    'example-token',
  ];

  if (!secret) {
    throw new Error(
      'BRIDGE_JWT_SECRET is required. Please set BRIDGE_JWT_SECRET environment variable.'
    );
  }

  const lowerSecret = secret.toLowerCase();
  if (placeholders.some((p) => p === lowerSecret)) {
    throw new Error(
      'BRIDGE_JWT_SECRET appears to be a placeholder. Please set a secure secret.'
    );
  }

  if (secret.length < 16) {
    throw new Error('BRIDGE_JWT_SECRET must be at least 16 characters long.');
  }

  return secret;
}

function parseJwtExpiresIn(rawValue: string | undefined): string {
  const expiresIn = String(rawValue ?? '2h').trim();
  if (!/^\d+[smhd]$/i.test(expiresIn)) {
    throw new Error(
      'JWT_EXPIRES_IN format is invalid. Examples: 30m, 2h, 1d.'
    );
  }
  return expiresIn;
}

export function readConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): AppConfig {
  return {
    backendUrl: normalizeBackendUrl(env.BACKEND_URL),
    bridgeJwtSecret: parseBridgeJwtSecret(env.BRIDGE_JWT_SECRET),
    jwtExpiresIn: parseJwtExpiresIn(env.JWT_EXPIRES_IN),
    gatewayPort: parsePort(env.GATEWAY_PORT),
    debug: parseBool(env.DEBUG)
  };
}
