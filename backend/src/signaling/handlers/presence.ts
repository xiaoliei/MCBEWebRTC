import type { SessionStore } from '../../domain/session/SessionStore.js';
import type { StateStore } from '../../domain/state/StateStore.js';
import type { NearbyPlayerDto, PresenceListResponsePayload } from '../types.js';

export interface PresenceListReqDeps {
  requestSessionId: string;
  sessionStore: SessionStore;
  stateStore: StateStore;
  emitSelf: (event: 'presence:list:res', payload: PresenceListResponsePayload) => void;
}

export function handlePresenceListReq(deps: PresenceListReqDeps): void {
  const requester = deps.sessionStore.getById(deps.requestSessionId);
  if (!requester) {
    deps.emitSelf('presence:list:res', { players: [] });
    return;
  }

  const requesterPlayer = deps.stateStore.getPlayerByName(requester.playerName);
  if (!requesterPlayer) {
    deps.emitSelf('presence:list:res', { players: [] });
    return;
  }

  const players: NearbyPlayerDto[] = [];
  for (const session of deps.sessionStore.listOnlineSessions()) {
    if (session.sessionId === requester.sessionId) {
      continue;
    }

    const player = deps.stateStore.getPlayerByName(session.playerName);
    if (!player) {
      continue;
    }

    if (requesterPlayer.dim !== null && player.dim !== null && requesterPlayer.dim !== player.dim) {
      continue;
    }

    players.push({
      sessionId: session.sessionId,
      playerName: session.playerName,
      position: player.position,
      dim: player.dim
    });
  }

  // 统一排序保证返回稳定，便于客户端做差量比较。
  players.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  deps.emitSelf('presence:list:res', { players });
}