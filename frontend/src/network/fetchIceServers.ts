export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

let cachedIceServers: IceServer[] | null = null;

const FALLBACK_STUN: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export async function fetchIceServers(
  fetcher: typeof fetch = fetch
): Promise<IceServer[]> {
  if (cachedIceServers) {
    return cachedIceServers;
  }

  try {
    const backendUrl = String(import.meta.env.VITE_BACKEND_URL ?? '').trim();
    // 中文注释：未配置后端地址时走相对路径，配合 Vite 代理进行本地联调。
    const requestUrl = backendUrl ? `${backendUrl}/api/ice` : '/api/ice';

    const response = await fetcher(requestUrl);
    if (!response.ok) {
      throw new Error(`ICE 拉取失败: ${response.status}`);
    }
    const payload = (await response.json()) as { iceServers?: IceServer[] };
    const servers = Array.isArray(payload.iceServers)
      ? payload.iceServers
      : FALLBACK_STUN;
    cachedIceServers = servers;
    return servers;
  } catch {
    // 中文注释：MVP 阶段网络异常时直接回退默认 STUN，避免阻塞后续信令流程。
    cachedIceServers = FALLBACK_STUN;
    return FALLBACK_STUN;
  }
}

export function resetIceCache(): void {
  cachedIceServers = null;
}
