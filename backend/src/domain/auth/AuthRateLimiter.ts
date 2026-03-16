export interface AuthRateLimiterCheckResult {
  allowed: boolean;
  remaining?: number;
  resetAt?: number;
}

/**
 * 简单内存滑动窗口限流器。
 *
 * 设计意图：
 * - 不依赖外部存储，便于单元测试与本地开发；
 * - 以 identifier（如 playerName）为粒度独立计数；
 * - 返回 remaining/resetAt，方便上层在需要时透出限流元信息。
 */
export class AuthRateLimiter {
  private readonly requestsByIdentifier = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number,
  ) {}

  check(identifier: string): AuthRateLimiterCheckResult {
    const key = identifier.trim();
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const history = this.requestsByIdentifier.get(key) ?? [];

    // 滑动窗口核心逻辑：仅保留窗口内的请求时间戳。
    const activeTimestamps = history.filter((timestamp) => timestamp > windowStart);

    if (activeTimestamps.length >= this.maxRequests) {
      const oldestInWindow = activeTimestamps[0];
      return {
        allowed: false,
        remaining: 0,
        resetAt: oldestInWindow + this.windowMs,
      };
    }

    activeTimestamps.push(now);
    this.requestsByIdentifier.set(key, activeTimestamps);

    return {
      allowed: true,
      remaining: this.maxRequests - activeTimestamps.length,
      resetAt: now + this.windowMs,
    };
  }
}
