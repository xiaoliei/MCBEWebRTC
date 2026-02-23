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

const DEFAULT_ICE_SERVERS: IceServerDto[] = [{ urls: 'stun:stun.l.google.com:19302' }];

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
      throw new Error('ICE_SERVERS 必须是数组');
    }

    return parsed.map((item) => {
      if (typeof item !== 'object' || item === null || !('urls' in item)) {
        throw new Error('ICE_SERVERS 中的每项都必须包含 urls 字段');
      }

      const iceServer = item as IceServerDto;
      if (
        !(
          typeof iceServer.urls === 'string' ||
          (Array.isArray(iceServer.urls) && iceServer.urls.every((url) => typeof url === 'string'))
        )
      ) {
        throw new Error('ICE_SERVERS.urls 必须是字符串或字符串数组');
      }

      return iceServer;
    });
  } catch (error) {
    // 中文错误信息用于快速定位配置问题。
    throw new Error(`ICE_SERVERS 解析失败: ${(error as Error).message}`);
  }
}

export function readConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): AppConfig {
  const bridgeToken = env.BRIDGE_TOKEN?.trim() || 'replace-with-strong-token';

  return {
    port: parsePort(env.PORT),
    host: env.HOST?.trim() || '0.0.0.0',
    bridgeToken,
    iceServers: parseIceServers(env.ICE_SERVERS)
  };
}