import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { App } from '../../src/App';
import { createSignalingService } from '../../src/signaling/createSignalingService';
import type {
  GatewayEventMap,
  SocketGateway
} from '../../src/signaling/SocketGateway';

// 模拟 auth API
vi.mock('../../src/network/auth', () => ({
  startTellVerification: vi.fn(),
  finishTellVerification: vi.fn(),
  startManualVerification: vi.fn(),
  confirmManualVerification: vi.fn()
}));

vi.mock('../../src/signaling/authTokenStore', () => ({
  getToken: vi.fn(),
  setToken: vi.fn((token: string) => {
    localStorage.setItem('auth_token', token);
  }),
  clearToken: vi.fn()
}));

class FakeGateway implements SocketGateway {
  public readonly sent: Array<{ event: string; payload?: unknown }> = [];
  private handlers: Partial<
    Record<keyof GatewayEventMap, Array<(payload: unknown) => void>>
  > = {};
  // 中文注释：保存最后一次 join 的参数，用于 retryWithForceReplace
  private _lastJoinParams: { playerName: string; token?: string } = {
    playerName: ''
  };

  connect(): void {
    this.sent.push({ event: 'connect' });
  }
  disconnect(): void {
    this.sent.push({ event: 'disconnect:client' });
    this.emit('disconnect', undefined);
  }
  join(playerName: string, token?: string, forceReplace?: boolean): void {
    // 中文注释：保存参数用于 retryWithForceReplace
    this._lastJoinParams = { playerName, token };
    this.sent.push({
      event: 'client:join',
      payload: { playerName, token, forceReplace }
    });
  }
  /**
   * 使用 forceReplace=true 重新加入，用于处理 FORCE_REPLACE_REQUIRED 拒绝
   */
  retryWithForceReplace(): void {
    const { playerName, token } = this._lastJoinParams;
    if (playerName) {
      this.join(playerName, token, true);
    }
  }
  requestPresenceList(): void {
    this.sent.push({ event: 'presence:list:req' });
  }
  sendOffer(toSessionId: string, data: unknown): void {
    this.sent.push({ event: 'webrtc:offer', payload: { toSessionId, data } });
  }
  sendAnswer(toSessionId: string, data: unknown): void {
    this.sent.push({ event: 'webrtc:answer', payload: { toSessionId, data } });
  }
  sendCandidate(toSessionId: string, data: unknown): void {
    this.sent.push({
      event: 'webrtc:candidate',
      payload: { toSessionId, data }
    });
  }
  on<K extends keyof GatewayEventMap>(
    event: K,
    handler: (payload: GatewayEventMap[K]) => void
  ): () => void {
    this.handlers[event] ??= [];
    this.handlers[event]?.push(handler as (payload: unknown) => void);
    return () => {
      this.handlers[event] = (this.handlers[event] ?? []).filter(
        (item) => item !== handler
      );
    };
  }
  emit<K extends keyof GatewayEventMap>(
    event: K,
    payload: GatewayEventMap[K]
  ): void {
    (this.handlers[event] ?? []).forEach((handler) => handler(payload));
  }
}

// 中文注释：创建测试上下文的辅助函数，减少测试设置代码重复
function createTestContext() {
  const gateway = new FakeGateway();
  const service = createSignalingService(gateway);
  return { gateway, service };
}

describe('auth flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 清理 localStorage 模拟
    localStorage.clear();
  });

  it('tell 流程：开始验证后展示验证码输入框，验证成功后保存 token 并自动加入', async () => {
    const user = userEvent.setup();
    const { gateway, service } = createTestContext();
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { startTellVerification, finishTellVerification } =
      await import('../../src/network/auth');
    const { getToken, setToken } =
      await import('../../src/signaling/authTokenStore');

    // Mock: tell/start 成功返回元信息（不返回验证码）
    vi.mocked(startTellVerification).mockResolvedValue({
      ok: true,
      ttlMs: 60000,
      expiresAt: Date.now() + 60000
    });

    // Mock: tell/finish 成功返回 token
    vi.mocked(finishTellVerification).mockResolvedValue({
      ok: true,
      token: 'jwt-token-123'
    });

    vi.mocked(getToken).mockReturnValue(null);

    render(<App service={service} />);

    // 选择 tell 验证模式
    await user.click(screen.getByRole('radio', { name: '验证码(tell)' }));

    // 输入玩家名
    await user.type(screen.getByLabelText('昵称'), 'Steve');

    // 点击开始验证
    await user.click(screen.getByRole('button', { name: '开始验证' }));

    // 展示验证码输入框
    await waitFor(() => {
      expect(screen.getByLabelText('验证码')).toBeInTheDocument();
    });

    // 输入验证码
    await user.type(screen.getByLabelText('验证码'), '123456');

    // 点击确认
    await user.click(screen.getByRole('button', { name: '确认' }));

    // 验证完成后会持久化 token，并自动加入
    await waitFor(() => {
      // 直接断言 token 已保存到 localStorage
      expect(localStorage.getItem('auth_token')).toBe('jwt-token-123');
      // 同时验证 setToken 也被调用
      expect(setToken).toHaveBeenCalledWith('jwt-token-123');
      expect(gateway.sent).toContainEqual({
        event: 'client:join',
        payload: { playerName: 'Steve', token: 'jwt-token-123' }
      });
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('manual 流程：开始验证后展示等待态，点击确认后加入', async () => {
    const user = userEvent.setup();
    const { gateway, service } = createTestContext();

    const { startManualVerification, confirmManualVerification } =
      await import('../../src/network/auth');
    const { getToken } = await import('../../src/signaling/authTokenStore');

    // Mock: manual/start 返回 challenge
    vi.mocked(startManualVerification).mockResolvedValue({
      ok: true,
      code: '654321',
      challenge: '#654321',
      ttlMs: 120000,
      expiresAt: Date.now() + 120000
    });

    // Mock: confirm 返回 token
    vi.mocked(confirmManualVerification).mockResolvedValue({
      ok: true,
      token: 'jwt-token-manual'
    });

    vi.mocked(getToken).mockReturnValue(null);

    render(<App service={service} />);

    // 选择 manual 验证模式
    await user.click(screen.getByRole('radio', { name: '手动(manual)' }));

    // 输入玩家名
    await user.type(screen.getByLabelText('昵称'), 'Alex');

    // 点击开始验证
    await user.click(screen.getByRole('button', { name: '开始验证' }));

    // 展示等待态（等待游戏中输入 #验证码）
    await waitFor(() => {
      expect(screen.getByText('请在游戏中发送 #654321')).toBeInTheDocument();
    });

    // 点击确认（假设已在游戏中发送）
    await user.click(screen.getByRole('button', { name: '确认' }));

    // 确认后自动加入
    await waitFor(() => {
      expect(confirmManualVerification).toHaveBeenCalledWith('Alex', '654321');
      expect(gateway.sent).toContainEqual({
        event: 'client:join',
        payload: { playerName: 'Alex', token: 'jwt-token-manual' }
      });
    });
  });

  it('token 过期或 join 被拒绝时提示重新验证', async () => {
    const user = userEvent.setup();
    const { gateway, service } = createTestContext();

    const { getToken } = await import('../../src/signaling/authTokenStore');

    // Mock: 有存储的 token
    vi.mocked(getToken).mockReturnValue('expired-token');

    render(<App service={service} />);

    // 输入玩家名
    await user.type(screen.getByLabelText('昵称'), 'Steve');

    // 点击直接加入（使用已保存 token）
    await user.click(screen.getByRole('button', { name: '直接加入' }));

    // 场景一：TOKEN_EXPIRED
    gateway.emit('connect:denied', {
      reason: 'TOKEN_EXPIRED',
      message: 'Token 已过期，请重新验证'
    });

    await waitFor(() => {
      expect(screen.getByText(/Token 已过期，请重新验证/)).toBeInTheDocument();
    });

    // 场景二：TOKEN_INVALID 也显示重新验证提示
    gateway.emit('connect:denied', {
      reason: 'TOKEN_INVALID',
      message: 'Token 无效，请重新验证'
    });

    await waitFor(() => {
      // 实现使用通用消息显示所有 token 相关拒绝
      expect(screen.getByText(/Token 已过期，请重新验证/)).toBeInTheDocument();
    });

    // 场景三：TOKEN_REVOKED 也显示重新验证提示
    gateway.emit('connect:denied', {
      reason: 'TOKEN_REVOKED',
      message: 'Token 已吊销，请重新验证'
    });

    await waitFor(() => {
      expect(screen.getByText(/Token 已过期，请重新验证/)).toBeInTheDocument();
    });

    // 场景四：TOKEN_PLAYER_MISMATCH 也显示重新验证提示
    gateway.emit('connect:denied', {
      reason: 'TOKEN_PLAYER_MISMATCH',
      message: 'Token 对应玩家与当前昵称不一致'
    });

    await waitFor(() => {
      expect(screen.getByText(/Token 已过期，请重新验证/)).toBeInTheDocument();
    });

    // 场景五：TOKEN_MISSING 也显示重新验证提示
    gateway.emit('connect:denied', {
      reason: 'TOKEN_MISSING',
      message: '请先获取 Token'
    });

    await waitFor(() => {
      expect(screen.getByText(/Token 已过期，请重新验证/)).toBeInTheDocument();
    });
  });

  it('forceReplace 冲突时显示可继续操作的 UI', async () => {
    const user = userEvent.setup();
    const { gateway, service } = createTestContext();

    const { getToken } = await import('../../src/signaling/authTokenStore');

    // Mock: 有有效 token
    vi.mocked(getToken).mockReturnValue('valid-token');

    render(<App service={service} />);

    // 输入玩家名
    await user.type(screen.getByLabelText('昵称'), 'Steve');

    // 点击直接加入
    await user.click(screen.getByRole('button', { name: '直接加入' }));

    // 收到 FORCE_REPLACE_REQUIRED
    gateway.emit('connect:denied', {
      reason: 'FORCE_REPLACE_REQUIRED',
      message: '该玩家已在线，是否强制替换？'
    });

    // 显示强制替换按钮
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '强制替换' })
      ).toBeInTheDocument();
    });

    // 点击强制替换
    await user.click(screen.getByRole('button', { name: '强制替换' }));

    // 发送带 forceReplace 的 join
    await waitFor(() => {
      expect(gateway.sent).toContainEqual({
        event: 'client:join',
        payload: {
          playerName: 'Steve',
          token: 'valid-token',
          forceReplace: true
        }
      });
    });
  });

  it('tell 流程：startTellVerification 返回错误时显示错误提示', async () => {
    const user = userEvent.setup();
    const { service } = createTestContext();

    const { startTellVerification } = await import('../../src/network/auth');
    const { getToken } = await import('../../src/signaling/authTokenStore');

    // Mock: tell/start 返回错误
    vi.mocked(startTellVerification).mockResolvedValue({
      ok: false,
      error: {
        code: 'PLAYER_NOT_FOUND',
        message: '玩家不存在，请检查昵称'
      }
    });

    vi.mocked(getToken).mockReturnValue(null);

    render(<App service={service} />);

    // 选择 tell 验证模式
    await user.click(screen.getByRole('radio', { name: '验证码(tell)' }));

    // 输入玩家名
    await user.type(screen.getByLabelText('昵称'), 'Steve');

    // 点击开始验证
    await user.click(screen.getByRole('button', { name: '开始验证' }));

    // 显示错误提示
    await waitFor(() => {
      expect(screen.getByText('玩家不存在，请检查昵称')).toBeInTheDocument();
    });

    // 回到 idle 状态，可以重新开始
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '开始验证' })
      ).toBeInTheDocument();
    });
  });

  it('tell 流程：finishTellVerification 返回错误时显示错误提示', async () => {
    const user = userEvent.setup();
    const { service } = createTestContext();

    const { startTellVerification, finishTellVerification } =
      await import('../../src/network/auth');
    const { getToken } = await import('../../src/signaling/authTokenStore');

    // Mock: tell/start 成功（不返回验证码）
    vi.mocked(startTellVerification).mockResolvedValue({
      ok: true,
      ttlMs: 60000,
      expiresAt: Date.now() + 60000
    });

    // Mock: tell/finish 返回错误
    vi.mocked(finishTellVerification).mockResolvedValue({
      ok: false,
      error: {
        code: 'CODE_EXPIRED',
        message: '验证码已过期，请重新获取'
      }
    });

    vi.mocked(getToken).mockReturnValue(null);

    render(<App service={service} />);

    // 选择 tell 验证模式
    await user.click(screen.getByRole('radio', { name: '验证码(tell)' }));

    // 输入玩家名
    await user.type(screen.getByLabelText('昵称'), 'Steve');

    // 点击开始验证
    await user.click(screen.getByRole('button', { name: '开始验证' }));

    // 展示验证码输入框
    await waitFor(() => {
      expect(screen.getByLabelText('验证码')).toBeInTheDocument();
    });

    // 输入验证码
    await user.type(screen.getByLabelText('验证码'), '123456');

    // 点击确认
    await user.click(screen.getByRole('button', { name: '确认' }));

    // 显示错误提示
    await waitFor(() => {
      expect(screen.getByText('验证码已过期，请重新获取')).toBeInTheDocument();
    });

    // 保持在 code-entry 状态，验证码输入框仍然存在
    await waitFor(() => {
      expect(screen.getByLabelText('验证码')).toBeInTheDocument();
    });
  });

  it('tell 流程：网络错误时显示错误提示', async () => {
    const user = userEvent.setup();
    const { service } = createTestContext();

    const { startTellVerification } = await import('../../src/network/auth');
    const { getToken } = await import('../../src/signaling/authTokenStore');

    // Mock: tell/start 抛出网络错误（返回 NETWORK_ERROR）
    vi.mocked(startTellVerification).mockResolvedValue({
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: '鉴权请求失败，请稍后重试'
      }
    });

    vi.mocked(getToken).mockReturnValue(null);

    render(<App service={service} />);

    // 选择 tell 验证模式
    await user.click(screen.getByRole('radio', { name: '验证码(tell)' }));

    // 输入玩家名
    await user.type(screen.getByLabelText('昵称'), 'Steve');

    // 点击开始验证
    await user.click(screen.getByRole('button', { name: '开始验证' }));

    // 显示网络错误提示
    await waitFor(() => {
      expect(screen.getByText('鉴权请求失败，请稍后重试')).toBeInTheDocument();
    });
  });

  it('切换验证方式时重置验证状态', async () => {
    const user = userEvent.setup();
    const { service } = createTestContext();

    const { startTellVerification } = await import('../../src/network/auth');
    const { getToken } = await import('../../src/signaling/authTokenStore');

    // Mock: tell/start 成功（不返回验证码）
    vi.mocked(startTellVerification).mockResolvedValue({
      ok: true,
      ttlMs: 60000,
      expiresAt: Date.now() + 60000
    });

    vi.mocked(getToken).mockReturnValue(null);

    render(<App service={service} />);

    // 选择 tell 验证模式
    await user.click(screen.getByRole('radio', { name: '验证码(tell)' }));

    // 输入玩家名
    await user.type(screen.getByLabelText('昵称'), 'Steve');

    // 点击开始验证
    await user.click(screen.getByRole('button', { name: '开始验证' }));

    // 展示验证码输入框
    await waitFor(() => {
      expect(screen.getByLabelText('验证码')).toBeInTheDocument();
    });

    // 切换到 manual 模式，这会中断当前的 tell 验证流程
    await user.click(screen.getByRole('radio', { name: '手动(manual)' }));

    // 验证状态已重置，验证码输入框消失
    await waitFor(() => {
      expect(screen.queryByLabelText('验证码')).not.toBeInTheDocument();
    });

    // 错误提示也被清除
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('idle 状态下点击断开按钮重置状态', async () => {
    const user = userEvent.setup();
    const { gateway, service } = createTestContext();

    const { getToken, clearToken } =
      await import('../../src/signaling/authTokenStore');

    // Mock: 有存储的 token
    vi.mocked(getToken).mockReturnValue('some-token');

    render(<App service={service} />);

    // 确认初始状态有 token 相关的"直接加入"按钮
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '直接加入' })
      ).toBeInTheDocument();
    });

    // 点击断开按钮
    await user.click(screen.getByRole('button', { name: '断开' }));

    // 验证断开被调用
    await waitFor(() => {
      expect(gateway.sent).toContainEqual({ event: 'disconnect:client' });
    });

    // 验证 clearToken 被调用
    await waitFor(() => {
      expect(clearToken).toHaveBeenCalled();
    });

    // 验证 authState 已重置：验证方式回到 tell，步骤回到 idle
    // 通过验证"开始验证"按钮存在来确认 authState step 为 idle
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '开始验证' })
      ).toBeInTheDocument();
    });
  });

  it('tell success keeps the primary actions visible', async () => {
    const user = userEvent.setup();
    const { service } = createTestContext();

    const { startTellVerification, finishTellVerification } =
      await import('../../src/network/auth');
    const { getToken } = await import('../../src/signaling/authTokenStore');

    vi.mocked(startTellVerification).mockResolvedValue({
      ok: true,
      ttlMs: 60000,
      expiresAt: Date.now() + 60000
    });
    vi.mocked(finishTellVerification).mockResolvedValue({
      ok: true,
      token: 'jwt-token-verified'
    });
    vi.mocked(getToken).mockReturnValue('jwt-token-verified');

    render(<App service={service} />);

    await user.type(screen.getByLabelText('昵称'), 'Steve');
    await user.click(screen.getByRole('button', { name: '开始验证' }));

    await waitFor(() => {
      expect(screen.getByLabelText('验证码')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('验证码'), '123456');
    await user.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '直接加入' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '断开' })).toBeInTheDocument();
    });
  });
});
