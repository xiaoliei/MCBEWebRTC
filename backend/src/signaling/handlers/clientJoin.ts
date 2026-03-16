import { randomUUID } from "node:crypto";
import type {
  ClientSession,
  SessionStore,
} from "../../domain/session/SessionStore.js";
import type { ConnectDeniedPayload } from "../types.js";

interface ValidatePlayerTokenSuccess {
  ok: true;
  playerName: string;
  jti: string;
}

interface ValidatePlayerTokenFailure {
  ok: false;
  error: {
    code: "RATE_LIMITED" | "BRIDGE_UNAVAILABLE" | "INVALID_VERIFICATION" | "TOKEN_INVALID" | "TOKEN_MISSING" | "TOKEN_EXPIRED" | "TOKEN_REVOKED";
    message: string;
  };
}

type ValidatePlayerTokenResult = ValidatePlayerTokenSuccess | ValidatePlayerTokenFailure;

type PlayerAuthServiceLike = {
  validatePlayerToken: (token: string) => ValidatePlayerTokenResult;
};

export interface ClientJoinInput {
  playerName: string;
  token?: string;
  forceReplace?: boolean;
}

export interface ClientJoinResult extends ClientSession {
  replacedSession: ClientSession | null;
}

export interface ClientJoinDeps {
  socketId: string;
  sessionStore: SessionStore;
  emitSelf: (event: "connected" | "connect:denied", payload: unknown) => void;
  createSessionId?: () => string;
  nowProvider?: () => number;
  requirePlayerTokenAuth?: boolean;
  playerAuthService?: PlayerAuthServiceLike;
}

function deny(deps: ClientJoinDeps, payload: ConnectDeniedPayload): null {
  deps.emitSelf("connect:denied", payload);
  return null;
}

export function handleClientJoin(
  input: ClientJoinInput,
  deps: ClientJoinDeps,
): ClientJoinResult | null {
  const playerName = String(input.playerName ?? "").trim();
  if (!playerName) {
    return deny(deps, {
      reason: "INVALID_PAYLOAD",
      message: "playerName 不能为空",
    });
  }

  if (deps.requirePlayerTokenAuth) {
    const token = input.token?.trim();
    if (!token) {
      return deny(deps, {
        reason: "TOKEN_MISSING",
        message: "缺少玩家 token",
      });
    }

    const authService = deps.playerAuthService;
    if (!authService) {
      return deny(deps, {
        reason: "TOKEN_INVALID",
        message: "服务端鉴权服务未就绪",
      });
    }

    const validateResult = authService.validatePlayerToken(token);
    if (!validateResult.ok) {
      return deny(deps, {
        reason: validateResult.error.code,
        message: validateResult.error.message,
      });
    }

    if (validateResult.playerName !== playerName) {
      return deny(deps, {
        reason: "TOKEN_PLAYER_MISMATCH",
        message: "token 与 playerName 不匹配",
      });
    }
  }

  let replacedSession: ClientSession | null = null;
  const existing = deps.sessionStore.getByPlayerName(playerName);
  if (existing) {
    // 显式 forceReplace 才能接管旧连接；开启鉴权时，token 校验已在前面完成。
    if (input.forceReplace !== true) {
      return deny(deps, {
        reason: "FORCE_REPLACE_REQUIRED",
        message: "玩家已在线，需携带 forceReplace=true 才可替换旧连接",
      });
    }

    replacedSession = existing;
    deps.sessionStore.removeById(existing.sessionId);
  }

  const sessionId = deps.createSessionId?.() ?? randomUUID();
  const createdSession = deps.sessionStore.createSession({
    sessionId,
    playerName,
    socketId: deps.socketId,
    connectedAt: deps.nowProvider?.() ?? Date.now(),
  });

  const session: ClientJoinResult = {
    ...createdSession,
    replacedSession,
  };

  deps.emitSelf("connected", { sessionId, playerName });
  return session;
}
