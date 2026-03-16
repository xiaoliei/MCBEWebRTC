import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  startTellVerification,
  finishTellVerification,
  startManualVerification,
  confirmManualVerification
} from '../../src/network/auth';

describe('auth API', () => {
  const mockPlayerName = 'TestPlayer';
  const mockCode = '123456';
  const mockToken = 'jwt.token.here';
  const mockChallenge = 'challenge-string';
  const mockTtlMs = 60000;
  const mockExpiresAt = Date.now() + mockTtlMs;

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // 默认未配置 VITE_BACKEND_URL，使用相对路径。
    vi.stubEnv('VITE_BACKEND_URL', '');
  });

  describe('startTellVerification', () => {
    it('应请求 /api/auth/verify/tell/start 并返回 ttlMs/expiresAt（不包含 code）', async () => {
      fetchMock = vi.fn(async () => {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            ttlMs: mockTtlMs,
            expiresAt: mockExpiresAt
          })
        } as Response;
      });

      const result = await startTellVerification(
        mockPlayerName,
        fetchMock as unknown as typeof fetch
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/verify/tell/start',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerName: mockPlayerName })
        })
      );
      expect(result).toEqual({
        ok: true,
        ttlMs: mockTtlMs,
        expiresAt: mockExpiresAt
      });
    });

    it('应解析失败响应为 ok=false 格式', async () => {
      fetchMock = vi.fn(async () => {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            ok: false,
            error: { code: 'INVALID_PLAYER', message: '玩家不存在' }
          })
        } as Response;
      });

      const result = await startTellVerification(
        mockPlayerName,
        fetchMock as unknown as typeof fetch
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'INVALID_PLAYER', message: '玩家不存在' }
      });
    });

    it('网络异常时应返回统一错误结构', async () => {
      fetchMock = vi.fn(async () => {
        throw new Error('network down');
      });

      const result = await startTellVerification(
        mockPlayerName,
        fetchMock as unknown as typeof fetch
      );

      expect(result).toEqual({
        ok: false,
        error: {
          code: 'NETWORK_ERROR',
          message: '鉴权请求失败，请稍后重试'
        }
      });
    });

    it('后端返回非 JSON 响应时应返回统一错误结构', async () => {
      fetchMock = vi.fn(async () => {
        return {
          ok: false,
          status: 502,
          json: async () => {
            throw new Error('invalid json');
          }
        } as unknown as Response;
      });

      const result = await startTellVerification(
        mockPlayerName,
        fetchMock as unknown as typeof fetch
      );

      expect(result).toEqual({
        ok: false,
        error: {
          code: 'NETWORK_ERROR',
          message: '鉴权请求失败，请稍后重试'
        }
      });
    });

    it('VITE_BACKEND_URL 存在时应请求完整 URL', async () => {
      vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:3000');

      fetchMock = vi.fn(async () => {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            ttlMs: mockTtlMs,
            expiresAt: mockExpiresAt
          })
        } as Response;
      });

      await startTellVerification(
        mockPlayerName,
        fetchMock as unknown as typeof fetch
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/verify/tell/start',
        expect.any(Object)
      );
    });
  });

  describe('finishTellVerification', () => {
    it('应请求 /api/auth/verify/tell/finish 并返回 token', async () => {
      fetchMock = vi.fn(async () => {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            token: mockToken
          })
        } as Response;
      });

      const result = await finishTellVerification(
        mockPlayerName,
        mockCode,
        fetchMock as unknown as typeof fetch
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/verify/tell/finish',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerName: mockPlayerName, code: mockCode })
        })
      );
      expect(result).toEqual({ ok: true, token: mockToken });
    });

    it('应解析失败响应为 ok=false 格式', async () => {
      fetchMock = vi.fn(async () => {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            ok: false,
            error: { code: 'INVALID_VERIFICATION', message: '验证码错误' }
          })
        } as Response;
      });

      const result = await finishTellVerification(
        mockPlayerName,
        mockCode,
        fetchMock as unknown as typeof fetch
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'INVALID_VERIFICATION', message: '验证码错误' }
      });
    });
  });

  describe('startManualVerification', () => {
    it('应请求 /api/auth/verify/manual/start 并返回 code/challenge/ttlMs/expiresAt', async () => {
      fetchMock = vi.fn(async () => {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            code: mockCode,
            challenge: mockChallenge,
            ttlMs: mockTtlMs,
            expiresAt: mockExpiresAt
          })
        } as Response;
      });

      const result = await startManualVerification(
        mockPlayerName,
        fetchMock as unknown as typeof fetch
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/verify/manual/start',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerName: mockPlayerName })
        })
      );
      expect(result).toEqual({
        ok: true,
        code: mockCode,
        challenge: mockChallenge,
        ttlMs: mockTtlMs,
        expiresAt: mockExpiresAt
      });
    });

    it('VITE_BACKEND_URL 存在时应请求完整 URL', async () => {
      vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:3000');

      fetchMock = vi.fn(async () => {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            code: mockCode,
            challenge: mockChallenge,
            ttlMs: mockTtlMs,
            expiresAt: mockExpiresAt
          })
        } as Response;
      });

      await startManualVerification(
        mockPlayerName,
        fetchMock as unknown as typeof fetch
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/verify/manual/start',
        expect.any(Object)
      );
    });
  });

  describe('confirmManualVerification', () => {
    it('应请求 /api/auth/verify/manual/confirm 并返回 token', async () => {
      fetchMock = vi.fn(async () => {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            token: mockToken
          })
        } as Response;
      });

      const result = await confirmManualVerification(
        mockPlayerName,
        mockCode,
        fetchMock as unknown as typeof fetch
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/verify/manual/confirm',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerName: mockPlayerName, code: mockCode })
        })
      );
      expect(result).toEqual({ ok: true, token: mockToken });
    });

    it('应解析失败响应为 ok=false 格式', async () => {
      fetchMock = vi.fn(async () => {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            ok: false,
            error: { code: 'TIMEOUT', message: '验证超时' }
          })
        } as Response;
      });

      const result = await confirmManualVerification(
        mockPlayerName,
        mockCode,
        fetchMock as unknown as typeof fetch
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'TIMEOUT', message: '验证超时' }
      });
    });
  });
});
