import type { NearbyPlayerDto } from '../../../shared/src/types/presence.js';
import type {
  ConnectDeniedReason,
  WebRtcSignalRelayPayload
} from '../../../shared/src/types/signaling.js';
import type { SocketGateway } from './SocketGateway';
import {
  createWebRtcSignalingMachine,
  type PeerSignalState
} from '../webrtc/createWebRtcSignalingMachine';

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
  peerStates: Record<string, PeerSignalState>;
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
  const machine = createWebRtcSignalingMachine();
  let state: SignalingState = {
    status: 'idle',
    sessionId: '',
    playerName: '',
    nearbyPlayers: [],
    denyReason: '',
    peerStates: machine.state
  };
  const listeners = new Set<(nextState: SignalingState) => void>();

  const setState = (
    updater: (prev: SignalingState) => SignalingState
  ): void => {
    state = updater(state);
    listeners.forEach((listener) => listener(state));
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
  });

  const handleRelay = (
    event: 'webrtc:offer' | 'webrtc:answer' | 'webrtc:candidate',
    payload: WebRtcSignalRelayPayload
  ): void => {
    if (event === 'webrtc:offer') {
      machine.onRemoteOffer(payload.fromSessionId);
    }
    if (event === 'webrtc:answer') {
      machine.onRemoteAnswer(payload.fromSessionId);
    }
    if (event === 'webrtc:candidate') {
      machine.onRemoteCandidate(payload.fromSessionId);
    }
    setState((prev) => ({ ...prev, peerStates: machine.state }));
  };

  gateway.on('webrtc:offer', (payload) => handleRelay('webrtc:offer', payload));
  gateway.on('webrtc:answer', (payload) =>
    handleRelay('webrtc:answer', payload)
  );
  gateway.on('webrtc:candidate', (payload) =>
    handleRelay('webrtc:candidate', payload)
  );

  gateway.on('disconnect', () => {
    machine.reset();
    setState((prev) => ({
      ...prev,
      status: 'disconnected',
      sessionId: '',
      nearbyPlayers: [],
      peerStates: machine.state
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
      setState((prev) => ({ ...prev, status: 'connecting', denyReason: '' }));
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
      machine.onLocalOfferSent(toSessionId);
      setState((prev) => ({ ...prev, peerStates: machine.state }));
      gateway.sendOffer(toSessionId, data);
    },
    sendAnswer(toSessionId, data) {
      machine.onLocalAnswerSent(toSessionId);
      setState((prev) => ({ ...prev, peerStates: machine.state }));
      gateway.sendAnswer(toSessionId, data);
    },
    sendCandidate(toSessionId, data) {
      gateway.sendCandidate(toSessionId, data);
    }
  };
}
