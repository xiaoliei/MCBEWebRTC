export interface IceServerDto {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface PlayerJwtConfig {
  secret: string;
  expiresIn: string;
  tokenRefreshStrategy: "none";
}

export interface AuthTellConfig {
  enabled: boolean;
  codeTtlMs: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
}

export interface AuthManualConfig {
  enabled: boolean;
  codeTtlMs: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  messagePrefix: string;
}

export interface AuthCleanupConfig {
  tokenCleanupIntervalMs: number;
  verifySessionCleanupIntervalMs: number;
}

export interface AppConfig {
  port: number;
  host: string;
  bridgeJwtSecret: string;
  jwtExpiresIn: string;
  iceServers: IceServerDto[];
  callRadius: number;
  authVerificationEnabled: boolean;
  playerJwt: PlayerJwtConfig;
  authTell: AuthTellConfig;
  authManual: AuthManualConfig;
  authCleanup: AuthCleanupConfig;
}

const DEFAULT_ICE_SERVERS: IceServerDto[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

const DEFAULT_DISABLED_PLAYER_JWT_SECRET = "player-auth-disabled-placeholder";
const DEFAULT_DISABLED_PLAYER_JWT_EXPIRES_IN = "24h";
const DEFAULT_CALL_RADIUS = 16;
const DEFAULT_AUTH_TELL_CODE_TTL_MS = 120_000;
const DEFAULT_AUTH_TELL_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_AUTH_TELL_RATE_LIMIT_MAX = 3;
const DEFAULT_AUTH_MANUAL_CODE_TTL_MS = 300_000;
const DEFAULT_AUTH_MANUAL_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_AUTH_MANUAL_RATE_LIMIT_MAX = 3;
const DEFAULT_AUTH_TOKEN_CLEANUP_INTERVAL_MS = 60_000;
const DEFAULT_AUTH_VERIFY_SESSION_CLEANUP_INTERVAL_MS = 60_000;

function parsePort(rawPort: string | undefined): number {
  const parsed = Number(rawPort);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
    return parsed;
  }
  return 3000;
}

function parseBoolean(
  rawValue: string | undefined,
  defaultValue: boolean,
  name: string,
): boolean {
  if (rawValue === undefined) {
    return defaultValue;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  throw new Error(`${name} 必须是 boolean string true 或 false`);
}

function parsePositiveInt(rawValue: string | undefined, name: string): number {
  const value = rawValue?.trim();
  if (!value) {
    throw new Error(`${name} 环境变量未设置`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} 必须是正整数`);
  }

  return parsed;
}

function parsePositiveNumberWithDefault(
  rawValue: string | undefined,
  defaultValue: number,
  name: string,
): number {
  const value = rawValue?.trim();
  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }

  return parsed;
}

function parseIceServers(rawIceServers: string | undefined): IceServerDto[] {
  if (!rawIceServers) {
    return DEFAULT_ICE_SERVERS;
  }

  try {
    const parsed = JSON.parse(rawIceServers) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("ICE_SERVERS 必须是数组");
    }

    return parsed.map((item) => {
      if (typeof item !== "object" || item === null || !("urls" in item)) {
        throw new Error("ICE_SERVERS 中的每项都必须包含 urls 字段");
      }

      const iceServer = item as IceServerDto;
      if (
        !(
          typeof iceServer.urls === "string" ||
          (Array.isArray(iceServer.urls) &&
            iceServer.urls.every((url) => typeof url === "string"))
        )
      ) {
        throw new Error("ICE_SERVERS.urls 必须是字符串或字符串数组");
      }

      return iceServer;
    });
  } catch (error) {
    throw new Error(`ICE_SERVERS 解析失败: ${(error as Error).message}`);
  }
}

function parseBridgeJwtSecret(rawSecret: string | undefined): string {
  const secret = rawSecret?.trim();
  if (!secret) {
    throw new Error(
      "BRIDGE_JWT_SECRET 环境变量未设置,请设置为强随机字符串用于网关鉴权",
    );
  }

  const placeholders = [
    "replace-with-strong-token",
    "your-secure-random-token-here",
    "change_me_in_production",
  ];
  const lowerSecret = secret.toLowerCase();
  if (placeholders.some((p) => lowerSecret === p.toLowerCase())) {
    throw new Error(
      `BRIDGE_JWT_SECRET 使用了占位符 "${secret}",请设置为强随机字符串用于生产环境`,
    );
  }

  if (secret.length < 16) {
    throw new Error("BRIDGE_JWT_SECRET 长度至少需要 16 个字符");
  }

  return secret;
}

function parseJwtExpiresIn(rawValue: string | undefined): string {
  const value = String(rawValue ?? "2h").trim();
  if (!/^\d+[smhd]$/i.test(value)) {
    throw new Error("JWT_EXPIRES_IN 格式无效,支持格式示例: 30m / 2h / 1d");
  }
  return value;
}

function parsePlayerJwtSecret(rawSecret: string | undefined): string {
  const secret = rawSecret?.trim();
  if (!secret) {
    throw new Error("PLAYER_JWT_SECRET 环境变量未设置,请设置为玩家鉴权密钥");
  }
  return secret;
}

function parsePlayerJwtExpiresIn(rawValue: string | undefined): string {
  const value = rawValue?.trim();
  if (!value) {
    throw new Error("PLAYER_JWT_EXPIRES_IN 环境变量未设置");
  }
  if (!/^\d+[smhd]$/i.test(value)) {
    throw new Error("PLAYER_JWT_EXPIRES_IN 格式无效,支持格式示例: 30m / 2h / 1d");
  }
  return value;
}

function parsePlayerTokenRefreshStrategy(rawValue: string | undefined): "none" {
  const value = rawValue?.trim() || "none";
  if (value !== "none") {
    throw new Error("PLAYER_TOKEN_REFRESH_STRATEGY 仅支持 none");
  }
  return "none";
}

function parseManualMessagePrefix(rawValue: string | undefined): string {
  const value = rawValue?.trim();
  return value || "#";
}

export function readConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AppConfig {
  const authVerificationEnabled = parseBoolean(
    env.AUTH_VERIFICATION_ENABLED,
    true,
    "AUTH_VERIFICATION_ENABLED",
  );
  const authTellEnabled = parseBoolean(env.AUTH_TELL_ENABLED, true, "AUTH_TELL_ENABLED");
  const authManualEnabled = parseBoolean(
    env.AUTH_MANUAL_ENABLED,
    true,
    "AUTH_MANUAL_ENABLED",
  );

  return {
    port: parsePort(env.PORT),
    host: env.HOST?.trim() || "0.0.0.0",
    bridgeJwtSecret: parseBridgeJwtSecret(env.BRIDGE_JWT_SECRET),
    jwtExpiresIn: parseJwtExpiresIn(env.JWT_EXPIRES_IN),
    iceServers: parseIceServers(env.ICE_SERVERS),
    callRadius: parsePositiveNumberWithDefault(
      env.CALL_RADIUS,
      DEFAULT_CALL_RADIUS,
      "CALL_RADIUS",
    ),
    authVerificationEnabled,
    playerJwt: {
      secret: authVerificationEnabled
        ? parsePlayerJwtSecret(env.PLAYER_JWT_SECRET)
        : DEFAULT_DISABLED_PLAYER_JWT_SECRET,
      expiresIn: authVerificationEnabled
        ? parsePlayerJwtExpiresIn(env.PLAYER_JWT_EXPIRES_IN)
        : DEFAULT_DISABLED_PLAYER_JWT_EXPIRES_IN,
      tokenRefreshStrategy: parsePlayerTokenRefreshStrategy(
        env.PLAYER_TOKEN_REFRESH_STRATEGY,
      ),
    },
    authTell: {
      enabled: authTellEnabled,
      codeTtlMs:
        authVerificationEnabled && authTellEnabled
          ? parsePositiveInt(env.AUTH_TELL_CODE_TTL_MS, "AUTH_TELL_CODE_TTL_MS")
          : DEFAULT_AUTH_TELL_CODE_TTL_MS,
      rateLimitWindowMs:
        authVerificationEnabled && authTellEnabled
          ? parsePositiveInt(
              env.AUTH_TELL_RATE_LIMIT_WINDOW_MS,
              "AUTH_TELL_RATE_LIMIT_WINDOW_MS",
            )
          : DEFAULT_AUTH_TELL_RATE_LIMIT_WINDOW_MS,
      rateLimitMax:
        authVerificationEnabled && authTellEnabled
          ? parsePositiveInt(env.AUTH_TELL_RATE_LIMIT_MAX, "AUTH_TELL_RATE_LIMIT_MAX")
          : DEFAULT_AUTH_TELL_RATE_LIMIT_MAX,
    },
    authManual: {
      enabled: authManualEnabled,
      codeTtlMs:
        authVerificationEnabled && authManualEnabled
          ? parsePositiveInt(
              env.AUTH_MANUAL_CODE_TTL_MS,
              "AUTH_MANUAL_CODE_TTL_MS",
            )
          : DEFAULT_AUTH_MANUAL_CODE_TTL_MS,
      rateLimitWindowMs:
        authVerificationEnabled && authManualEnabled
          ? parsePositiveInt(
              env.AUTH_MANUAL_RATE_LIMIT_WINDOW_MS,
              "AUTH_MANUAL_RATE_LIMIT_WINDOW_MS",
            )
          : DEFAULT_AUTH_MANUAL_RATE_LIMIT_WINDOW_MS,
      rateLimitMax:
        authVerificationEnabled && authManualEnabled
          ? parsePositiveInt(
              env.AUTH_MANUAL_RATE_LIMIT_MAX,
              "AUTH_MANUAL_RATE_LIMIT_MAX",
            )
          : DEFAULT_AUTH_MANUAL_RATE_LIMIT_MAX,
      messagePrefix: parseManualMessagePrefix(env.AUTH_MANUAL_MESSAGE_PREFIX),
    },
    authCleanup: {
      tokenCleanupIntervalMs: authVerificationEnabled
        ? parsePositiveInt(
            env.AUTH_TOKEN_CLEANUP_INTERVAL_MS,
            "AUTH_TOKEN_CLEANUP_INTERVAL_MS",
          )
        : DEFAULT_AUTH_TOKEN_CLEANUP_INTERVAL_MS,
      verifySessionCleanupIntervalMs: authVerificationEnabled
        ? parsePositiveInt(
            env.AUTH_VERIFY_SESSION_CLEANUP_INTERVAL_MS,
            "AUTH_VERIFY_SESSION_CLEANUP_INTERVAL_MS",
          )
        : DEFAULT_AUTH_VERIFY_SESSION_CLEANUP_INTERVAL_MS,
    },
  };
}
