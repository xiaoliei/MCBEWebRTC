export interface EmitterLike {
  emit: (event: string, payload: unknown) => void;
}

export interface SafeEmitOptions {
  onError?: (error: Error) => void;
}

export function safeEmit(
  emitter: EmitterLike,
  event: string,
  payload: unknown,
  options: SafeEmitOptions = {},
): boolean {
  try {
    emitter.emit(event, payload);
    return true;
  } catch (error) {
    // 将异常通过注入回调上报，避免在核心流程中抛出导致连接中断。
    options.onError?.(error as Error);
    return false;
  }
}
