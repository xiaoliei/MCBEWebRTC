import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  fetchIceServers,
  resetIceCache
} from '../../src/network/fetchIceServers';

describe('fetchIceServers', () => {
  beforeEach(() => {
    resetIceCache();
  });

  it('应请求 /api/ice 并缓存结果', async () => {
    const fetcher = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          iceServers: [{ urls: 'stun:example.org:3478' }]
        })
      } as Response;
    });

    const first = await fetchIceServers(fetcher as unknown as typeof fetch);
    const second = await fetchIceServers(fetcher as unknown as typeof fetch);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first[0].urls).toBe('stun:example.org:3478');
  });

  it('接口失败时应回退默认 STUN', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('network down');
    });

    const servers = await fetchIceServers(fetcher as unknown as typeof fetch);

    expect(servers[0].urls).toBe('stun:stun.l.google.com:19302');
  });
});
