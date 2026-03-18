import { useEffect, useMemo, useState } from 'react';
import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
import { Panel } from './components/ui/Panel';
import { RadioGroup } from './components/ui/RadioGroup';
import { Section } from './components/ui/Section';
import { StatusChip } from './components/ui/StatusChip';
import { createSocketGateway } from './signaling/createSocketGateway';
import {
  createSignalingService,
  type SignalingService
} from './signaling/createSignalingService';
import { getToken, setToken, clearToken } from './signaling/authTokenStore';
import {
  startTellVerification,
  finishTellVerification,
  startManualVerification,
  confirmManualVerification
} from './network/auth';

type VerificationMode = 'tell' | 'manual';

interface AuthState {
  mode: VerificationMode;
  step: 'idle' | 'started' | 'code-entry' | 'waiting-confirm' | 'verified';
  code: string;
  challenge: string;
  error: string;
}

const connectionToneMap = {
  idle: 'neutral',
  connecting: 'info',
  connected: 'success',
  denied: 'danger',
  disconnected: 'warning'
} as const;

const authStepLabelMap = {
  idle: '待验证',
  started: '请求中',
  'code-entry': '输入验证码',
  'waiting-confirm': '等待确认',
  verified: '已验证'
} as const;

const authToneMap = {
  idle: 'neutral',
  started: 'info',
  'code-entry': 'warning',
  'waiting-confirm': 'warning',
  verified: 'success'
} as const;

function useService(injected?: SignalingService): SignalingService {
  return useMemo(
    () => injected ?? createSignalingService(createSocketGateway()),
    [injected]
  );
}

export function App({
  service: injectedService
}: {
  service?: SignalingService;
}) {
  const service = useService(injectedService);
  const [playerName, setPlayerName] = useState('');
  const [state, setState] = useState(service.getState());

  // 中文注释：鉴权状态管理，区分验证流程各阶段。
  const [authState, setAuthState] = useState<AuthState>({
    mode: 'tell',
    step: 'idle',
    code: '',
    challenge: '',
    error: ''
  });
  const [manualCopyState, setManualCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle'
  );

  useEffect(() => {
    // 中文注释：订阅服务状态，组件仅负责展示，不直接操作 socket。
    return service.subscribe(setState);
  }, [service]);

  // 处理验证开始
  const handleStartVerification = async () => {
    const trimmedName = playerName.trim();
    if (!trimmedName) {
      return;
    }
    setManualCopyState('idle');

    setAuthState((prev) => ({
      ...prev,
      step: 'started',
      error: ''
    }));

    try {
      if (authState.mode === 'tell') {
        const result = await startTellVerification(trimmedName);
        if (result.ok) {
          setAuthState((prev) => ({
            ...prev,
            step: 'code-entry',
            // 中文注释：/tell/start 不返回验证码，输入框保持受控空字符串，等待用户手动输入。
            code: ''
          }));
        } else {
          setAuthState((prev) => ({
            ...prev,
            step: 'idle',
            error: result.error.message
          }));
        }
      } else {
        const result = await startManualVerification(trimmedName);
        if (result.ok) {
          setAuthState((prev) => ({
            ...prev,
            step: 'waiting-confirm',
            code: result.code,
            challenge: result.challenge
          }));
        } else {
          setAuthState((prev) => ({
            ...prev,
            step: 'idle',
            error: result.error.message
          }));
        }
      }
    } catch {
      setAuthState((prev) => ({
        ...prev,
        step: 'idle',
        error: '网络请求失败'
      }));
    }
  };

  // 处理验证确认
  const handleConfirmVerification = async () => {
    const trimmedName = playerName.trim();
    if (!trimmedName) {
      return;
    }

    try {
      if (authState.mode === 'tell') {
        const result = await finishTellVerification(trimmedName, authState.code);
        if (result.ok) {
          setToken(result.token);
          setAuthState((prev) => ({
            ...prev,
            step: 'verified',
            error: ''
          }));
          // 验证成功后自动加入
          service.join(trimmedName, result.token);
        } else {
          setAuthState((prev) => ({
            ...prev,
            error: result.error.message
          }));
        }
      } else {
        const result = await confirmManualVerification(trimmedName, authState.code);
        if (result.ok) {
          setToken(result.token);
          setAuthState((prev) => ({
            ...prev,
            step: 'verified',
            error: ''
          }));
          // 验证成功后自动加入
          service.join(trimmedName, result.token);
        } else {
          setAuthState((prev) => ({
            ...prev,
            error: result.error.message
          }));
        }
      }
    } catch {
      setAuthState((prev) => ({
        ...prev,
        error: '网络请求失败'
      }));
    }
  };

  // 处理直接加入（使用已有 token）
  const handleJoin = () => {
    const trimmedName = playerName.trim();
    if (!trimmedName) {
      return;
    }
    const token = getToken();
    // 中文注释：将 null 归一化为 undefined，避免传入 null
    service.join(trimmedName, token ?? undefined);
  };

  // 处理强制替换
  const handleForceReplace = () => {
    // 中文注释：使用 retryWithForceReplace 方法复用上次 join 的参数并强制替换
    service.retryWithForceReplace();
  };

  const handleCopyManualCode = async () => {
    const text = authState.challenge || authState.code;
    if (!text) {
      return;
    }
    const command = `/tell @s ${text}`;

    if (!navigator.clipboard?.writeText) {
      setManualCopyState('error');
      return;
    }

    try {
      await navigator.clipboard.writeText(command);
      setManualCopyState('copied');
    } catch {
      setManualCopyState('error');
    }
  };
  // 处理断开
  const handleDisconnect = () => {
    service.disconnect();
    clearToken();
    setManualCopyState('idle');
    setAuthState({
      mode: 'tell',
      step: 'idle',
      code: '',
      challenge: '',
      error: ''
    });
  };

  // 判断是否需要重新验证
  const needsReverify =
    state.status === 'denied' &&
    (state.denyReason === 'TOKEN_EXPIRED' ||
      state.denyReason === 'TOKEN_INVALID' ||
      state.denyReason === 'TOKEN_REVOKED' ||
      state.denyReason === 'TOKEN_MISSING' ||
      state.denyReason === 'TOKEN_PLAYER_MISMATCH');

  // 判断是否显示强制替换按钮
  const showForceReplace =
    state.status === 'denied' && state.denyReason === 'FORCE_REPLACE_REQUIRED';
  const showPrimaryActions =
    authState.step === 'idle' || authState.step === 'verified';
  const storedToken = getToken();

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-header__copy">
          <p className="app-eyebrow">MCBE WebRTC</p>
          <h1>MCBE距离通话</h1>
          <p className="app-header__description">
            欢迎使用 MCBE 距离通话控制台！请在下方输入您的昵称并完成验证后加入游戏，系统将自动连接附近的玩家进行语音通话。您可以在状态信息中查看当前连接状态和会话详情，确保麦克风权限已授权以获得最佳体验。
          </p>
        </div>
        <div className="app-header__chips" aria-label="状态摘要">
          <StatusChip tone={connectionToneMap[state.status]}>
            连接 {state.status}
          </StatusChip>
          <StatusChip tone={authToneMap[authState.step]}>
            验证 {authStepLabelMap[authState.step]}
          </StatusChip>
          <StatusChip tone={state.microphoneGranted ? 'success' : 'warning'}>
            麦克风 {state.microphoneGranted ? '已授权' : '未授权'}
          </StatusChip>
        </div>
      </header>

      <div className="app-main-grid">
        <Section
          title="验证与操作"
          description="先完成昵称与验证，再按现有流程进入连接。"
        >
          <RadioGroup
            legend="验证方式"
            name="verification-mode"
            onChange={(value) => {
              setManualCopyState('idle');
              setAuthState((prev) => ({
                ...prev,
                mode: value,
                step: 'idle',
                error: ''
              }));
            }}
            options={[
              { value: 'tell', label: '验证码(tell)' },
              { value: 'manual', label: '手动(manual)' }
            ]}
            value={authState.mode}
          />

          <Input
            aria-label="昵称"
            id="player-name"
            label="昵称"
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="输入玩家昵称"
            value={playerName}
          />

          {showPrimaryActions ? (
            <div className="app-action-row">
              <Button
                disabled={!playerName.trim()}
                onClick={handleStartVerification}
              >
                开始验证
              </Button>
              <Button
                disabled={!playerName.trim()}
                onClick={handleJoin}
                variant="secondary"
              >
                {storedToken ? '直接加入' : '加入'}
              </Button>
              <Button onClick={handleDisconnect} variant="ghost">
                断开
              </Button>
            </div>
          ) : null}

          {authState.step === 'code-entry' ? (
            <div className="app-inline-form">
              <Input
                aria-label="验证码"
                id="verification-code"
                label="验证码"
                onChange={(event) =>
                  setAuthState((prev) => ({ ...prev, code: event.target.value }))
                }
                placeholder="输入验证码"
                value={authState.code}
              />
              <Button onClick={handleConfirmVerification}>确认</Button>
            </div>
          ) : null}

          {authState.step === 'waiting-confirm' ? (
            <Panel className="app-callout app-callout--manual" variant="accent">
              <p>{`请在游戏中发送以下指令`}</p>
              <div className="app-manual-copy__row">
                <code className="app-manual-copy__code">/tell @s {authState.challenge}</code>
                <Button
                  aria-label="copy-manual-code"
                  onClick={handleCopyManualCode}
                  variant="secondary"
                >
                  复制指令
                </Button>
              </div>
              {manualCopyState !== 'idle' ? (
                <p
                  className={`app-manual-copy__feedback ${
                    manualCopyState === 'error'
                      ? 'app-manual-copy__feedback--error'
                      : ''
                  }`}
                  role="status"
                >
                  {manualCopyState === 'copied'
                    ? '已复制到剪贴板'
                    : '复制失败，请手动复制'}
                </p>
              ) : null}
              <Button onClick={handleConfirmVerification}>确认</Button>
            </Panel>
          ) : null}

          {authState.error ? (
            <Panel className="app-alert app-alert--danger" variant="subtle">
              <p role="alert">{authState.error}</p>
            </Panel>
          ) : null}

          {showForceReplace ? (
            <Panel className="app-alert app-alert--warning" variant="subtle">
              <p>该玩家已在线，是否强制替换？</p>
              <Button onClick={handleForceReplace} variant="danger">
                强制替换
              </Button>
            </Panel>
          ) : null}
        </Section>

        <Section
          title="状态信息"
          description="连接状态、会话信息和异常提示都会在这里汇总。"
        >
          <div className="app-status-stack">
            <Panel className="app-status-panel" variant="subtle">
              <p data-testid="status">状态: {state.status}</p>
              <p data-testid="session">Session: {state.sessionId || '-'}</p>
              <p data-testid="microphone">
                麦克风: {state.microphoneGranted ? '已授权' : '未授权'}
              </p>
            </Panel>

            {needsReverify ? (
              <Panel className="app-alert app-alert--danger" variant="subtle">
                <p role="alert">Token 已过期，请重新验证</p>
              </Panel>
            ) : null}

            {state.denyReason === 'DUPLICATE_NAME' ? (
              <Panel className="app-alert app-alert--warning" variant="subtle">
                <p role="alert">昵称重复，请更换后重试</p>
              </Panel>
            ) : null}
          </div>
        </Section>
      </div>

      <div className="app-bottom-grid">
        <Section
          title="附近玩家"
          description="用于确认周围玩家和连接目标是否已经出现。"
        >
          <ul className="app-list">
            {state.nearbyPlayers.length > 0 ? (
              state.nearbyPlayers.map((player) => (
                <li className="app-list__item" key={player.sessionId}>
                  <span>{player.playerName}</span>
                  <StatusChip tone="info">待连接</StatusChip>
                </li>
              ))
            ) : (
              <li className="app-list__empty">暂无附近玩家</li>
            )}
          </ul>
        </Section>

        <Section
          title="通话连接"
          description="展示当前 Peer 状态，以及远端音频是否已经建立。"
        >
          <ul className="app-list">
            {Object.entries(state.peerStates).length > 0 ? (
              Object.entries(state.peerStates).map(([sessionId, peer]) => (
                <li className="app-list__item app-list__item--stacked" key={sessionId}>
                  <div className="app-peer-row">
                    <strong>{peer.playerName}</strong>
                    {peer.hasRemoteTrack ? (
                      <StatusChip tone="success">音频中</StatusChip>
                    ) : (
                      <StatusChip tone="neutral">等待音频</StatusChip>
                    )}
                  </div>
                  <span>{`${peer.phase} / ${peer.iceConnectionState}`}</span>
                </li>
              ))
            ) : (
              <li className="app-list__empty">暂无通话连接</li>
            )}
          </ul>
        </Section>
      </div>
    </main>
  );
}
