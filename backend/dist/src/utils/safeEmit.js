export function safeEmit(emitter, event, payload, options = {}) {
    try {
        emitter.emit(event, payload);
        return true;
    }
    catch (error) {
        // 将异常通过注入回调上报，避免在核心流程中抛出导致连接中断。
        options.onError?.(error);
        return false;
    }
}
