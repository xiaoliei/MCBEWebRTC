import type { NearbyPlayerDto } from '../../../shared/src/types/presence.js';
import type {
  ConnectDeniedReason,
  WebRtcSignalRelayPayload
} from '../../../shared/src/types/signaling.js';
import type { SocketGateway } from './SocketGateway';
import { fetchIceServers } from '../network/fetchIceServers';
import { AudioService } from '../audio/AudioService';
import {
  WebRTCConnectionManager,
  type ConnectionState
} from '../webrtc/WebRTCConnectionManager';

export type PeerPhase =
  | 'idle'
  | 'offer-sent'
  | 'offer-received'
  | 'answer-sent'
  | 'connected'
  | 'failed';

export interface PeerState {
  phase: PeerPhase;
  hasCandidate: boolean;
  iceConnectionState: RTCIceConnectionState | 'unknown';
  hasRemoteTrack: boolean;
  playerName: string;
}

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'denied'
  | 'disconnected';

export interface SignalingState {
  status: ConnectionStatus;
  sessionId: string;
  playerName: string;
  nearbyPlayers: NearbyPlayerDto[];
  denyReason: ConnectDeniedReason | '';
  peerStates: Record<string, PeerState>;
  audioEnabled: boolean;
  microphoneGranted: boolean;
}

export interface SignalingService {
  getState(): SignalingState;
  subscribe(listener: (state: SignalingState) => void): () => void;
  join(playerName: string, code?: string): void;
  disconnect(): void;
  requestPresence(): void;
  sendOffer(toSessionId: string, data: unknown): void;
  sendAnswer(toSessionId: string, data: unknown): void;
  sendCandidate(toSessionId: string, data: unknown): void;
}

export function createSignalingService(
  gateway: SocketGateway
): SignalingService {
  const audioService = new AudioService();
  let manager: WebRTCConnectionManager | null = null;

  let state: SignalingState = {
    status: 'idle',
    sessionId: '',
    playerName: '',
    nearbyPlayers: [],
    denyReason: '',
    peerStates: {},
    audioEnabled: false,
    microphoneGranted: false
  };
  const listeners = new Set<(nextState: SignalingState) => void>();

  const setState = (
    updater: (prev: SignalingState) => SignalingState
  ): void => {
    state = updater(state);
    listeners.forEach((listener) => listener(state));
  };

  const resolvePeerName = (sessionId: string): string => {
    return (
      state.nearbyPlayers.find((player) => player.sessionId === sessionId)
        ?.playerName ?? `Peer-${sessionId.slice(0, 6)}`
    );
  };

  const ensurePeerState = (sessionId: string, playerName: string): PeerState => {
    return (
      state.peerStates[sessionId] ?? {
        phase: 'idle',
        hasCandidate: false,
        iceConnectionState: 'unknown',
        hasRemoteTrack: false,
        playerName
      }
    );
  };

  const mergeConnectionState = (
    prev: PeerState,
    next: ConnectionState
  ): PeerState => {
    const phase: PeerPhase =
      next.iceConnectionState === 'connected'
        ? 'connected'
        : next.iceConnectionState === 'failed' ||
            next.iceConnectionState === 'disconnected' ||
            next.iceConnectionState === 'closed'
          ? 'failed'
          : prev.phase;

    return {
      ...prev,
      phase,
      playerName: next.playerName,
      iceConnectionState:
        next.iceConnectionState === 'unknown'
          ? 'unknown'
          : next.iceConnectionState,
      hasRemoteTrack: next.hasRemoteTrack
    };
  };

  const isRtcSessionDescription = (
    payload: unknown
  ): payload is RTCSessionDescriptionInit => {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    const desc = payload as Record<string, unknown>;
    const type = desc.type;
    const sdp = desc.sdp;

    const hasValidType =
      type === 'offer' ||
      type === 'answer' ||
      type === 'pranswer' ||
      type === 'rollback';

    if (type !== undefined && !hasValidType) {
      return false;
    }
    if (sdp !== undefined && typeof sdp !== 'string') {
      return false;
    }

    return hasValidType || typeof sdp === 'string';
  };

  const isRtcIceCandidate = (payload: unknown): payload is RTCIceCandidateInit => {
    return Boolean(payload) && typeof payload === 'object';
  };

  const syncPeerStatesFromManager = (): void => {
    if (!manager) {
      return;
    }
    const snapshot = manager.getConnections();
    setState((prev) => {
      const nextPeerStates = { ...prev.peerStates };
      snapshot.forEach((conn, sessionId) => {
        const current = ensurePeerState(sessionId, conn.playerName);
        nextPeerStates[sessionId] = mergeConnectionState(current, conn);
      });
      return { ...prev, peerStates: nextPeerStates };
    });
  };

  const setupWebRtc = async (): Promise<void> => {
    if (manager) {
      return;
    }

    const iceServers = await fetchIceServers();
    await audioService.initialize();

    manager = new WebRTCConnectionManager(
      audioService,
      {
        sendOffer(toSessionId, data) {
          gateway.sendOffer(toSessionId, data);
          setState((prev) => {
            const peer = ensurePeerState(
              toSessionId,
              resolvePeerName(toSessionId)
            );
            return {
              ...prev,
              peerStates: {
                ...prev.peerStates,
                [toSessionId]: { ...peer, phase: 'offer-sent' }
              }
            };
          });
        },
        sendAnswer(toSessionId, data) {
          gateway.sendAnswer(toSessionId, data);
          setState((prev) => {
            const peer = ensurePeerState(
              toSessionId,
              resolvePeerName(toSessionId)
            );
            return {
              ...prev,
              peerStates: {
                ...prev.peerStates,
                [toSessionId]: { ...peer, phase: 'answer-sent' }
              }
            };
          });
        },
        sendCandidate(toSessionId, data) {
          gateway.sendCandidate(toSessionId, data);
          setState((prev) => {
            const peer = ensurePeerState(
              toSessionId,
              resolvePeerName(toSessionId)
            );
            return {
              ...prev,
              peerStates: {
                ...prev.peerStates,
                [toSessionId]: { ...peer, hasCandidate: true }
              }
            };
          });
        }
      },
      {
        onStateChange(sessionId, next) {
          setState((prev) => {
            const current = ensurePeerState(sessionId, next.playerName);
            return {
              ...prev,
              peerStates: {
                ...prev.peerStates,
                [sessionId]: mergeConnectionState(current, next)
              }
            };
          });
        },
        onDisconnected(sessionId) {
          setState((prev) => {
            const next = { ...prev.peerStates };
            delete next[sessionId];
            return { ...prev, peerStates: next };
          });
        }
      },
      () => state.sessionId,
      iceServers
    );

    setState((prev) => ({
      ...prev,
      audioEnabled: true,
      microphoneGranted: true
    }));
  };

  const handleNearbyPlayersUpdate = (players: NearbyPlayerDto[]): void => {
    if (!manager) {
      return;
    }

    // 中文注释：连接同步策略与 demo 保持一致，仅由较小 sessionId 一方发起呼叫。
    manager.syncConnections(players);
    syncPeerStatesFromManager();
  };

  gateway.on('connected', (payload) => {
    setState((prev) => ({
      ...prev,
      status: 'connected',
      sessionId: payload.sessionId,
      playerName: payload.playerName,
      denyReason: ''
    }));
    gateway.requestPresenceList();
    void setupWebRtc().catch((error) => {
      // 中文注释：初始化失败时保留信令可用，仅关闭语音能力并标记权限状态。
      console.warn('[SignalingService] setupWebRtc failed', error);
      setState((prev) => ({
        ...prev,
        audioEnabled: false,
        microphoneGranted: false
      }));
    });
  });

  gateway.on('connect:denied', (payload) => {
    setState((prev) => ({
      ...prev,
      status: 'denied',
      denyReason: payload.reason,
      sessionId: ''
    }));
  });

  gateway.on('presence:nearby', (payload) => {
    setState((prev) => ({
      ...prev,
      nearbyPlayers: payload.players
    }));
    handleNearbyPlayersUpdate(payload.players);
  });

  gateway.on('webrtc:offer', (payload: WebRtcSignalRelayPayload) => {
    if (!isRtcSessionDescription(payload.data)) {
      return;
    }
    const playerName = resolvePeerName(payload.fromSessionId);
    setState((prev) => ({
      ...prev,
      peerStates: {
        ...prev.peerStates,
        [payload.fromSessionId]: {
          ...ensurePeerState(payload.fromSessionId, playerName),
          playerName,
          phase: 'offer-received'
        }
      }
    }));
    if (!manager) {
      return;
    }
    void manager.handleOffer({
      fromSessionId: payload.fromSessionId,
      playerName,
      offer: payload.data
    });
  });

  gateway.on('webrtc:answer', (payload: WebRtcSignalRelayPayload) => {
    if (!isRtcSessionDescription(payload.data)) {
      return;
    }
    setState((prev) => {
      const peer = ensurePeerState(
        payload.fromSessionId,
        resolvePeerName(payload.fromSessionId)
      );
      return {
        ...prev,
        peerStates: {
          ...prev.peerStates,
          [payload.fromSessionId]: { ...peer, phase: 'connected' }
        }
      };
    });
    if (!manager) {
      return;
    }
    void manager.handleAnswer({
      fromSessionId: payload.fromSessionId,
      answer: payload.data
    });
  });

  gateway.on('webrtc:candidate', (payload: WebRtcSignalRelayPayload) => {
    if (!isRtcIceCandidate(payload.data)) {
      return;
    }
    setState((prev) => {
      const peer = ensurePeerState(
        payload.fromSessionId,
        resolvePeerName(payload.fromSessionId)
      );
      return {
        ...prev,
        peerStates: {
          ...prev.peerStates,
          [payload.fromSessionId]: { ...peer, hasCandidate: true }
        }
      };
    });
    if (!manager) {
      return;
    }
    void manager.handleCandidate({
      fromSessionId: payload.fromSessionId,
      candidate: payload.data
    });
  });

  gateway.on('disconnect', () => {
    manager?.disconnectAll();
    manager = null;
    audioService.cleanup();
    setState((prev) => ({
      ...prev,
      status: 'disconnected',
      sessionId: '',
      nearbyPlayers: [],
      peerStates: {},
      audioEnabled: false,
      microphoneGranted: false
    }));
  });

  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    join(playerName, code) {
      // 中文注释：join 入口统一设置连接中状态，便于 UI 可观测。
      manager?.disconnectAll();
      audioService.cleanup();
      manager = null;
      setState((prev) => ({
        ...prev,
        status: 'connecting',
        denyReason: '',
        nearbyPlayers: [],
        peerStates: {},
        audioEnabled: false,
        microphoneGranted: false
      }));
      gateway.connect();
      gateway.join(playerName, code);
    },
    disconnect() {
      gateway.disconnect();
    },
    requestPresence() {
      gateway.requestPresenceList();
    },
    sendOffer(toSessionId, data) {
      setState((prev) => {
        const peer = ensurePeerState(toSessionId, resolvePeerName(toSessionId));
        return {
          ...prev,
          peerStates: {
            ...prev.peerStates,
            [toSessionId]: { ...peer, phase: 'offer-sent' }
          }
        };
      });
      gateway.sendOffer(toSessionId, data);
    },
    sendAnswer(toSessionId, data) {
      setState((prev) => {
        const peer = ensurePeerState(toSessionId, resolvePeerName(toSessionId));
        return {
          ...prev,
          peerStates: {
            ...prev.peerStates,
            [toSessionId]: { ...peer, phase: 'answer-sent' }
          }
        };
      });
      gateway.sendAnswer(toSessionId, data);
    },
    sendCandidate(toSessionId, data) {
      setState((prev) => {
        const peer = ensurePeerState(toSessionId, resolvePeerName(toSessionId));
        return {
          ...prev,
          peerStates: {
            ...prev.peerStates,
            [toSessionId]: { ...peer, hasCandidate: true }
          }
        };
      });
      gateway.sendCandidate(toSessionId, data);
    }
  };
}
