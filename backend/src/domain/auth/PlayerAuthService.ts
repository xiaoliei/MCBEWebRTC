import { issuePlayerJwtToken, verifyPlayerJwtToken } from "../../utils/jwt.js";
import type { PlayerTokenWhitelistStore } from "./PlayerTokenWhitelistStore.js";
import type { VerificationSessionStore } from "./VerificationSessionStore.js";
import type { VerificationSessionRecord } from "./types.js";
import type { AuthRateLimiter } from "./AuthRateLimiter.js";

interface PlayerAuthServiceConfig {
  authTell: {
    codeTtlMs: number;
  };
  authManual: {
    codeTtlMs: number;
    messagePrefix: string;
  };
  playerJwt: {
    secret: string;
    // 使用 string 类型，由调用方保证格式正确（如 "2h", "30m"）
    expiresIn: string;
  };
}

interface BridgeCommandSender {
  sendTellVerificationCode(playerName: string, code: string): Promise<boolean>;
}

export interface BridgeAuthCoordinator {
  startManualWatch?(playerName: string, challenge: string): Promise<boolean>;
  stopManualWatch(playerName: string): void;
}

interface PlayerAuthServiceDeps {
  config: PlayerAuthServiceConfig;
  verificationSessionStore: VerificationSessionStore;
  whitelistStore: PlayerTokenWhitelistStore;
  tellRateLimiter: AuthRateLimiter;
  manualRateLimiter: AuthRateLimiter;
  bridgeCommandSender: BridgeCommandSender;
  bridgeAuthCoordinator?: BridgeAuthCoordinator;
  now: () => number;
  createVerificationCode: () => string;
}

interface ServiceError {
  code:
    | "RATE_LIMITED"
    | "BRIDGE_UNAVAILABLE"
    | "INVALID_VERIFICATION"
    | "TOKEN_INVALID"
    | "TOKEN_MISSING"
    | "TOKEN_EXPIRED"
    | "TOKEN_REVOKED";
  message: string;
}

type ServiceFailure = {
  ok: false;
  error: ServiceError;
};

type StartTellSuccess = {
  ok: true;
  ttlMs: number;
  expiresAt: number;
};

type StartManualSuccess = {
  ok: true;
  code: string;
  challenge: string;
  ttlMs: number;
  expiresAt: number;
};

type IssueTokenSuccess = {
  ok: true;
  token: string;
};

type ManualGameMatchedSuccess = {
  ok: true;
};

type ValidateTokenSuccess = {
  ok: true;
  playerName: string;
  jti: string;
};

export type StartTellVerificationResult = StartTellSuccess | ServiceFailure;
export type StartManualVerificationResult = StartManualSuccess | ServiceFailure;
export type FinishTellVerificationResult = IssueTokenSuccess | ServiceFailure;
export type ConfirmManualVerificationResult = IssueTokenSuccess | ServiceFailure;
export type HandleManualGameMatchedResult = ManualGameMatchedSuccess | ServiceFailure;
export type ValidatePlayerTokenResult = ValidateTokenSuccess | ServiceFailure;

export class PlayerAuthService {
  // 保存当前服务实例内最新会话引用，便于读取 active 之外的状态（如 game_confirmed）。
  private readonly currentSessionByPlayer = new Map<string, VerificationSessionRecord>();

  constructor(private readonly deps: PlayerAuthServiceDeps) {}

  async startTellVerification(playerName: string): Promise<StartTellVerificationResult> {
    const normalizedName = this.normalizePlayerName(playerName);
    const rateLimit = this.deps.tellRateLimiter.check(normalizedName);
    if (!rateLimit.allowed) {
      return this.fail("RATE_LIMITED", "请求过于频繁，请稍后再试");
    }

    // 通过注入 now/createVerificationCode 解耦系统时间与随机数，保证测试可控并避免在业务逻辑中混用全局 Date/Math。
    const code = this.deps.createVerificationCode();
    const bridgeOk = await this.deps.bridgeCommandSender.sendTellVerificationCode(
      normalizedName,
      code,
    );
    if (!bridgeOk) {
      return this.fail("BRIDGE_UNAVAILABLE", "mcwss 不可用，无法下发 /tell 指令");
    }

    const expiresAt = this.deps.now() + this.deps.config.authTell.codeTtlMs;
    const record = this.deps.verificationSessionStore.createOrReplace(
      normalizedName,
      "tell",
      code,
      expiresAt,
    );
    this.currentSessionByPlayer.set(normalizedName, record);

    return {
      ok: true,
      ttlMs: this.deps.config.authTell.codeTtlMs,
      expiresAt,
    };
  }

  async finishTellVerification(
    playerName: string,
    code: string,
  ): Promise<FinishTellVerificationResult> {
    const normalizedName = this.normalizePlayerName(playerName);
    const active = this.deps.verificationSessionStore.getActiveByPlayerName(normalizedName);

    if (
      !active ||
      active.mode !== "tell" ||
      active.code !== code.trim() ||
      this.isExpired(active)
    ) {
      return this.fail("INVALID_VERIFICATION", "校验码错误或会话不存在");
    }

    this.deps.verificationSessionStore.markVerified(normalizedName);
    return this.issuePlayerToken(normalizedName);
  }

  async startManualVerification(playerName: string): Promise<StartManualVerificationResult> {
    const normalizedName = this.normalizePlayerName(playerName);
    const rateLimit = this.deps.manualRateLimiter.check(normalizedName);
    if (!rateLimit.allowed) {
      return this.fail("RATE_LIMITED", "请求过于频繁，请稍后再试");
    }

    // 通过注入 now/createVerificationCode 解耦系统时间与随机数，保证测试可控并避免在业务逻辑中混用全局 Date/Math。
    const code = this.deps.createVerificationCode();
    const challenge = `${this.deps.config.authManual.messagePrefix}${code}`;
    const startManualWatch = this.deps.bridgeAuthCoordinator?.startManualWatch;
    if (startManualWatch) {
      const watchStarted = await startManualWatch(normalizedName, challenge);
      if (!watchStarted) {
        return this.fail("BRIDGE_UNAVAILABLE", "mcwss 不可用，无法启动 manual watch");
      }
    }

    const expiresAt = this.deps.now() + this.deps.config.authManual.codeTtlMs;
    const record = this.deps.verificationSessionStore.createOrReplace(
      normalizedName,
      "manual",
      code,
      expiresAt,
    );
    this.currentSessionByPlayer.set(normalizedName, record);

    return {
      ok: true,
      code,
      challenge,
      ttlMs: this.deps.config.authManual.codeTtlMs,
      expiresAt,
    };
  }

  handleManualGameMatched(playerName: string, code: string): HandleManualGameMatchedResult {
    const normalizedName = this.normalizePlayerName(playerName);
    const active = this.deps.verificationSessionStore.getActiveByPlayerName(normalizedName);

    if (!active || active.mode !== "manual" || active.code !== code.trim()) {
      return this.fail("INVALID_VERIFICATION", "校验码错误或会话不存在");
    }

    if (this.isExpired(active)) {
      this.deps.bridgeAuthCoordinator?.stopManualWatch(normalizedName);
      return this.fail("INVALID_VERIFICATION", "校验码错误或会话不存在");
    }

    const updated = this.deps.verificationSessionStore.markGameConfirmed(normalizedName);
    if (!updated) {
      return this.fail("INVALID_VERIFICATION", "校验码错误或会话不存在");
    }

    this.currentSessionByPlayer.set(normalizedName, updated);
    return { ok: true };
  }

  async confirmManualVerification(
    playerName: string,
    code: string,
  ): Promise<ConfirmManualVerificationResult> {
    const normalizedName = this.normalizePlayerName(playerName);
    const session = this.currentSessionByPlayer.get(normalizedName);

    if (!session || session.mode !== "manual") {
      return this.fail("INVALID_VERIFICATION", "校验码错误或会话不存在");
    }

    if (session.code !== code.trim()) {
      return this.fail("INVALID_VERIFICATION", "校验码错误或会话不存在");
    }

    if (this.isExpired(session)) {
      this.deps.bridgeAuthCoordinator?.stopManualWatch(normalizedName);
      return this.fail("INVALID_VERIFICATION", "校验码错误或会话不存在");
    }

    if (session.status !== "game_confirmed") {
      return this.fail("INVALID_VERIFICATION", "manual 验证尚未完成游戏内确认");
    }

    this.deps.verificationSessionStore.markFrontendConfirmed(normalizedName);
    this.deps.verificationSessionStore.markVerified(normalizedName);

    return this.issuePlayerToken(normalizedName);
  }

  validatePlayerToken(token: string): ValidatePlayerTokenResult {
    const verifyResult = verifyPlayerJwtToken(token, this.deps.config.playerJwt.secret);
    if (!verifyResult.ok) {
      // 将 jwt 层的失败原因透传到服务层
      const reason = verifyResult.reason;
      if (reason === "TOKEN_MISSING") {
        return this.fail("TOKEN_MISSING", "缺少玩家 token");
      }
      if (reason === "TOKEN_EXPIRED") {
        return this.fail("TOKEN_EXPIRED", "token 已过期");
      }
      return this.fail("TOKEN_INVALID", "token 无效或已过期");
    }

    const { jti, playerName } = verifyResult.payload;
    if (!this.deps.whitelistStore.isActive(jti)) {
      return this.fail("TOKEN_REVOKED", "token 未在白名单中生效");
    }

    return {
      ok: true,
      jti,
      playerName,
    };
  }

  private issuePlayerToken(playerName: string): IssueTokenSuccess {
    const token = issuePlayerJwtToken(
      this.deps.config.playerJwt.secret,
      this.deps.config.playerJwt.expiresIn as Parameters<typeof issuePlayerJwtToken>[1],
      playerName,
    );

    const verified = verifyPlayerJwtToken(token, this.deps.config.playerJwt.secret);
    if (verified.ok) {
      // 将签发 token 的 jti 写入白名单，实现“验签 + 白名单”双重校验。
      this.deps.whitelistStore.issue(playerName, verified.payload.jti, verified.payload.exp * 1000);
    }

    return { ok: true, token };
  }

  private normalizePlayerName(playerName: string): string {
    return playerName.trim();
  }

  private isExpired(record: VerificationSessionRecord): boolean {
    return this.deps.now() > record.expiresAt;
  }

  private fail(code: ServiceError["code"], message: string): ServiceFailure {
    return {
      ok: false,
      error: {
        code,
        message,
      },
    };
  }
}
