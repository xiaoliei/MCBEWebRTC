export interface IceServerDto {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface AppConfig {
  port: number;
  host: string;
  bridgeJwtSecret: string;
  jwtExpiresIn: string;
  iceServers: IceServerDto[];
}

const DEFAULT_ICE_SERVERS: IceServerDto[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

function parsePort(rawPort: string | undefined): number {
  const parsed = Number(rawPort);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
    return parsed;
  }
  return 3000;
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
    // 中文错误信息用于快速定位配置问题。
    throw new Error(`ICE_SERVERS 解析失败: ${(error as Error).message}`);
  }
}

function parseBridgeJwtSecret(rawSecret: string | undefined): string {
  const secret = rawSecret?.trim();
  if (!secret) {
    throw new Error(
      "BRIDGE_JWT_SECRET 环境变量未设置,请设置为强随机字符串用于网关鉴权"
    );
  }

  // 检测常见占位符,避免生产环境误用不安全的默认值
  const placeholders = [
    "replace-with-strong-token",
    "your-secure-random-token-here",
    "change_me_in_production",
  ];
  const lowerSecret = secret.toLowerCase();
  if (placeholders.some((p) => lowerSecret === p.toLowerCase())) {
    throw new Error(
      `BRIDGE_JWT_SECRET 使用了占位符 "${secret}",请设置为强随机字符串用于生产环境`
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

export function readConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AppConfig {
  return {
    port: parsePort(env.PORT),
    host: env.HOST?.trim() || "0.0.0.0",
    bridgeJwtSecret: parseBridgeJwtSecret(env.BRIDGE_JWT_SECRET),
    jwtExpiresIn: parseJwtExpiresIn(env.JWT_EXPIRES_IN),
    iceServers: parseIceServers(env.ICE_SERVERS),
  };
}
