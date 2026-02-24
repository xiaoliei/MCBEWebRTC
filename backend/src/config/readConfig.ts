export interface IceServerDto {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface AppConfig {
  port: number;
  host: string;
  bridgeToken: string;
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

function parseBridgeToken(rawToken: string | undefined): string {
  const token = rawToken?.trim();
  if (!token) {
    throw new Error(
      "BRIDGE_TOKEN 环境变量未设置,请设置为强随机字符串用于网关鉴权"
    );
  }

  // 检测常见占位符,避免生产环境误用不安全的默认值
  const placeholders = [
    "replace-with-strong-token",
    "your-secure-random-token-here",
    "change_me_in_production",
  ];
  const lowerToken = token.toLowerCase();
  if (placeholders.some((p) => lowerToken === p.toLowerCase())) {
    throw new Error(
      `BRIDGE_TOKEN 使用了占位符 "${token}",请设置为强随机字符串用于生产环境`
    );
  }

  return token;
}

export function readConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AppConfig {
  return {
    port: parsePort(env.PORT),
    host: env.HOST?.trim() || "0.0.0.0",
    bridgeToken: parseBridgeToken(env.BRIDGE_TOKEN),
    iceServers: parseIceServers(env.ICE_SERVERS),
  };
}
