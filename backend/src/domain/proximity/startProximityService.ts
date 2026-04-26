import type { ClientSession, SessionStore } from "../session/SessionStore.js";
import type {
  GamePlayerState,
  StateStore,
  Vector3,
} from "../state/StateStore.js";

export interface NearbyPlayerItem {
  sessionId: string;
  playerName: string;
  position: Vector3;
  dim: number | null;
}

export interface StartProximityServiceOptions {
  stateStore: StateStore;
  sessionStore: SessionStore;
  callRadius: number;
  tickMs: number;
  gamePlayerTtlMs: number;
  emitNearby: (
    sessionId: string,
    nearbyPlayers: NearbyPlayerItem[],
    myPosition: Vector3 | null,
  ) => void;
  nowProvider?: () => number;
}

function distanceSquared(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function canConnect(
  selfPlayer: GamePlayerState,
  otherPlayer: GamePlayerState,
  radiusSquared: number,
): boolean {
  if (
    selfPlayer.dim !== null &&
    otherPlayer.dim !== null &&
    selfPlayer.dim !== otherPlayer.dim
  ) {
    return false;
  }

  return (
    distanceSquared(selfPlayer.position, otherPlayer.position) <= radiusSquared
  );
}

export function startProximityService(
  options: StartProximityServiceOptions,
): () => void {
  const radiusSquared = options.callRadius * options.callRadius;
  const nowProvider = options.nowProvider ?? (() => Date.now());

  const timer = setInterval(() => {
    const now = nowProvider();
    options.stateStore.prunePlayers({ ttlMs: options.gamePlayerTtlMs, now });

    const sessions = options.sessionStore.listOnlineSessions();
    for (const session of sessions) {
      // 获取本玩家位置，用于前端距离衰减计算
      const selfPlayer = options.stateStore.getPlayerByName(session.playerName);
      const myPosition = selfPlayer?.position ?? null;

      const nearbyPlayers = collectNearbyPlayers({
        session,
        sessions,
        stateStore: options.stateStore,
        radiusSquared,
      });

      // 每次 tick 都推送，包含本玩家位置，供前端计算音量衰减
      options.emitNearby(session.sessionId, nearbyPlayers, myPosition);
    }
  }, options.tickMs);

  return () => clearInterval(timer);
}

function collectNearbyPlayers(input: {
  session: ClientSession;
  sessions: ClientSession[];
  stateStore: StateStore;
  radiusSquared: number;
}): NearbyPlayerItem[] {
  const selfPlayer = input.stateStore.getPlayerByName(input.session.playerName);
  if (!selfPlayer) {
    return [];
  }

  const nearbyPlayers: NearbyPlayerItem[] = [];
  for (const otherSession of input.sessions) {
    if (otherSession.sessionId === input.session.sessionId) {
      continue;
    }

    const otherPlayer = input.stateStore.getPlayerByName(
      otherSession.playerName,
    );
    if (
      !otherPlayer ||
      !canConnect(selfPlayer, otherPlayer, input.radiusSquared)
    ) {
      continue;
    }

    nearbyPlayers.push({
      sessionId: otherSession.sessionId,
      playerName: otherSession.playerName,
      position: otherPlayer.position,
      dim: otherPlayer.dim,
    });
  }

  nearbyPlayers.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  return nearbyPlayers;
}
