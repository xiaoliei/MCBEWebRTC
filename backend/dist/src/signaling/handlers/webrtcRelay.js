export function handleWebRtcRelay(event, payload, deps) {
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
