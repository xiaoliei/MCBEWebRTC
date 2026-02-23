import type { SessionStore } from '../../domain/session/SessionStore.js';
import type { WebRtcSignalPayload, WebRtcSignalRelayPayload } from '../types.js';

export interface WebRtcRelayDeps {
  fromSessionId: string;
  sessionStore: SessionStore;
  emitToSession: (
    toSessionId: string,
    event: 'webrtc:offer' | 'webrtc:answer' | 'webrtc:candidate',
    payload: WebRtcSignalRelayPayload
  ) => void;
}

export function handleWebRtcRelay(
  event: 'webrtc:offer' | 'webrtc:answer' | 'webrtc:candidate',
  payload: WebRtcSignalPayload,
  deps: WebRtcRelayDeps
): boolean {
  const toSessionId = String(payload.toSessionId ?? '').trim();
  if (!toSessionId || !deps.sessionStore.getById(toSessionId)) {
    return false;
  }

  // 服务端保持 WebRTC 负载透明转发，只附加发送方 sessionId。
  deps.emitToSession(toSessionId, event, {
    fromSessionId: deps.fromSessionId,
    data: payload.data
  });
  return true;
}