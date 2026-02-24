export type PeerPhase =
  | 'idle'
  | 'offer-sent'
  | 'offer-received'
  | 'answer-sent'
  | 'connected';

export interface PeerSignalState {
  phase: PeerPhase;
  hasCandidate: boolean;
}

export function createWebRtcSignalingMachine(): {
  state: Record<string, PeerSignalState>;
  onLocalOfferSent: (targetSessionId: string) => void;
  onRemoteOffer: (fromSessionId: string) => void;
  onLocalAnswerSent: (targetSessionId: string) => void;
  onRemoteAnswer: (fromSessionId: string) => void;
  onRemoteCandidate: (fromSessionId: string) => void;
  reset: () => void;
} {
  const state: Record<string, PeerSignalState> = {};

  const ensurePeer = (sessionId: string): PeerSignalState => {
    const key = String(sessionId || '').trim();
    if (!key) {
      return { phase: 'idle', hasCandidate: false };
    }
    if (!state[key]) {
      state[key] = { phase: 'idle', hasCandidate: false };
    }
    return state[key];
  };

  return {
    state,
    onLocalOfferSent(targetSessionId) {
      ensurePeer(targetSessionId).phase = 'offer-sent';
    },
    onRemoteOffer(fromSessionId) {
      ensurePeer(fromSessionId).phase = 'offer-received';
    },
    onLocalAnswerSent(targetSessionId) {
      ensurePeer(targetSessionId).phase = 'answer-sent';
    },
    onRemoteAnswer(fromSessionId) {
      ensurePeer(fromSessionId).phase = 'connected';
    },
    onRemoteCandidate(fromSessionId) {
      const peer = ensurePeer(fromSessionId);
      peer.hasCandidate = true;
    },
    reset() {
      Object.keys(state).forEach((key) => {
        delete state[key];
      });
    }
  };
}
