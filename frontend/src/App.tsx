import { useEffect, useMemo, useState } from 'react';
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

  // 处理断开
  const handleDisconnect = () => {
    service.disconnect();
    clearToken();
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

  return (
    <main className="card">
      <h1>Web 前端 MVP</h1>

      {/* 验证模式选择 */}
      <fieldset>
        <legend>验证方式</legend>
        <label>
          <input
            type="radio"
            name="verification-mode"
            value="tell"
            checked={authState.mode === 'tell'}
            onChange={() =>
              setAuthState((prev) => ({ ...prev, mode: 'tell', step: 'idle', error: '' }))
            }
          />
          验证码(tell)
        </label>
        <label>
          <input
            type="radio"
            name="verification-mode"
            value="manual"
            checked={authState.mode === 'manual'}
            onChange={() =>
              setAuthState((prev) => ({ ...prev, mode: 'manual', step: 'idle', error: '' }))
            }
          />
          手动(manual)
        </label>
      </fieldset>

      <div className="row">
        <input
          aria-label="昵称"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          placeholder="输入玩家昵称"
        />
      </div>

      {/* 验证步骤：idle 时显示开始按钮 */}
      {showPrimaryActions && (
        <div className="row">
          <button
            onClick={handleStartVerification}
            disabled={!playerName.trim()}
          >
            开始验证
          </button>
          {getToken() ? (
            <button onClick={handleJoin} disabled={!playerName.trim()}>
              直接加入
            </button>
          ) : (
            <button onClick={handleJoin} disabled={!playerName.trim()}>
              加入
            </button>
          )}
          <button onClick={handleDisconnect}>断开</button>
        </div>
      )}

      {/* tell 模式：验证码输入 */}
      {authState.step === 'code-entry' && (
        <div className="row">
          <input
            aria-label="验证码"
            value={authState.code}
            onChange={(event) =>
              setAuthState((prev) => ({ ...prev, code: event.target.value }))
            }
            placeholder="输入验证码"
          />
          <button onClick={handleConfirmVerification}>确认</button>
        </div>
      )}

      {/* manual 模式：等待确认 */}
      {authState.step === 'waiting-confirm' && (
        <div className="row">
          <p>请在游戏中发送 {authState.challenge}</p>
          <button onClick={handleConfirmVerification}>确认</button>
        </div>
      )}

      {/* 错误提示 */}
      {authState.error && <p role="alert">{authState.error}</p>}

      {/* 连接拒绝原因 */}
      {needsReverify && (
        <p role="alert">Token 已过期，请重新验证</p>
      )}

      {/* 强制替换按钮 */}
      {showForceReplace && (
        <div className="row">
          <p>该玩家已在线，是否强制替换？</p>
          <button onClick={handleForceReplace}>强制替换</button>
        </div>
      )}

      <p data-testid="status">状态: {state.status}</p>
      <p data-testid="session">Session: {state.sessionId || '-'}</p>
      <p data-testid="microphone">
        麦克风: {state.microphoneGranted ? '已授权' : '未授权'}
      </p>

      {state.denyReason === 'DUPLICATE_NAME' ? (
        <p role="alert">昵称重复，请更换后重试</p>
      ) : null}

      <h2>附近玩家</h2>
      <ul>
        {state.nearbyPlayers.map((player) => (
          <li key={player.sessionId}>{player.playerName}</li>
        ))}
      </ul>

      <h2>通话连接</h2>
      <ul>
        {Object.entries(state.peerStates).map(([sessionId, peer]) => (
          <li key={sessionId}>
            {peer.playerName}: {peer.phase} / {peer.iceConnectionState}{' '}
            {peer.hasRemoteTrack ? '🎧' : ''}
          </li>
        ))}
      </ul>
    </main>
  );
}
