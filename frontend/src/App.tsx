import { useEffect, useMemo, useState } from 'react';
import { createSocketGateway } from './signaling/createSocketGateway';
import {
  createSignalingService,
  type SignalingService
} from './signaling/createSignalingService';

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

  useEffect(() => {
    // 中文注释：订阅服务状态，组件仅负责展示，不直接操作 socket。
    return service.subscribe(setState);
  }, [service]);

  return (
    <main className="card">
      <h1>Web 前端 MVP</h1>
      <div className="row">
        <input
          aria-label="昵称"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          placeholder="输入玩家昵称"
        />
        <button
          onClick={() => service.join(playerName.trim())}
          disabled={!playerName.trim()}
        >
          加入
        </button>
        <button onClick={() => service.disconnect()}>断开</button>
      </div>

      <p data-testid="status">状态: {state.status}</p>
      <p data-testid="session">Session: {state.sessionId || '-'}</p>

      {state.denyReason === 'DUPLICATE_NAME' ? (
        <p role="alert">昵称重复，请更换后重试</p>
      ) : null}

      <h2>附近玩家</h2>
      <ul>
        {state.nearbyPlayers.map((player) => (
          <li key={player.sessionId}>{player.playerName}</li>
        ))}
      </ul>
    </main>
  );
}
