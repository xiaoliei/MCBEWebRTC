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
  emitNearby: (sessionId: string, nearbyPlayers: NearbyPlayerItem[]) => void;
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
  const lastSentKeyBySessionId = new Map<string, string>();
  const nowProvider = options.nowProvider ?? (() => Date.now());

  const timer = setInterval(() => {
    const now = nowProvider();
    options.stateStore.prunePlayers({ ttlMs: options.gamePlayerTtlMs, now });

    const sessions = options.sessionStore.listOnlineSessions();
    for (const session of sessions) {
      const nearbyPlayers = collectNearbyPlayers({
        session,
        sessions,
        stateStore: options.stateStore,
        radiusSquared,
      });

      const nextKey = nearbyPlayers.map((item) => item.sessionId).join(",");
      if (lastSentKeyBySessionId.get(session.sessionId) === nextKey) {
        continue;
      }

      // 仅在邻近列表变化时推送，避免高频无效消息。
      lastSentKeyBySessionId.set(session.sessionId, nextKey);
      options.emitNearby(session.sessionId, nearbyPlayers);
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
