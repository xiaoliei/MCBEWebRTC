export interface AppConfig {
  backendUrl: string;
  bridgeToken: string;
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
 * 验证并解析 BRIDGE_TOKEN
 * 拒绝空值或常见的占位符值，防止生产环境使用不安全的 token
 */
function parseToken(rawValue: string | undefined): string {
  const token = rawValue?.trim() ?? '';
  const placeholders = [
    'change_me_in_production',
    'replace-with-strong-token',
    'your-secure-random-token-here',
    'your-token-here',
    'change-me',
    'example-token',
  ];

  if (!token) {
    throw new Error(
      'BRIDGE_TOKEN is required. Please set BRIDGE_TOKEN environment variable.'
    );
  }

  const lowerToken = token.toLowerCase();
  if (placeholders.some((p) => p === lowerToken)) {
    throw new Error(
      'BRIDGE_TOKEN appears to be a placeholder. Please set a secure token.'
    );
  }

  return token;
}

export function readConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): AppConfig {
  return {
    backendUrl: normalizeBackendUrl(env.BACKEND_URL),
    bridgeToken: parseToken(env.BRIDGE_TOKEN),
    gatewayPort: parsePort(env.GATEWAY_PORT),
    debug: parseBool(env.DEBUG)
  };
}
