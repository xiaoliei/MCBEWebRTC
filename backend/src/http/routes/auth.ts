import { Router } from "express";

// 使用更宽松的错误码类型，兼容 PlayerAuthService 的所有错误码
interface AuthRouteError {
  code:
    | "RATE_LIMITED"
    | "BRIDGE_UNAVAILABLE"
    | "INVALID_VERIFICATION"
    | "TOKEN_INVALID"
    | "AUTH_DISABLED"
    | "TOKEN_MISSING"
    | "TOKEN_EXPIRED"
    | "TOKEN_REVOKED"
    | "TOKEN_PLAYER_MISMATCH";
  message: string;
}

type AuthRouteFailure = {
  ok: false;
  error: AuthRouteError;
};

type StartTellResult =
  | {
      ok: true;
      ttlMs: number;
      expiresAt: number;
    }
  | AuthRouteFailure;

type FinishTellResult =
  | {
      ok: true;
      token: string;
    }
  | AuthRouteFailure;

type StartManualResult =
  | {
      ok: true;
      code: string;
      challenge: string;
      ttlMs: number;
      expiresAt: number;
    }
  | AuthRouteFailure;

type ConfirmManualResult =
  | {
      ok: true;
      token: string;
    }
  | AuthRouteFailure;

export interface PlayerAuthServiceLike {
  startTellVerification(playerName: string): Promise<StartTellResult>;
  finishTellVerification(playerName: string, code: string): Promise<FinishTellResult>;
  startManualVerification(playerName: string): Promise<StartManualResult>;
  confirmManualVerification(
    playerName: string,
    code: string,
  ): Promise<ConfirmManualResult>;
}

interface CreateAuthRouterInput {
  playerAuthService: PlayerAuthServiceLike;
  authVerificationEnabled: boolean;
  authTellEnabled: boolean;
  authManualEnabled: boolean;
}

export function createAuthRouter(input: CreateAuthRouterInput): Router {
  const router = Router();

  const ensureTellEnabled = () => {
    if (!input.authVerificationEnabled || !input.authTellEnabled) {
      return {
        ok: false as const,
        error: {
          code: "AUTH_DISABLED" as const,
          message: "鉴权功能未启用",
        },
      };
    }

    return { ok: true as const };
  };

  const ensureManualEnabled = () => {
    if (!input.authVerificationEnabled || !input.authManualEnabled) {
      return {
        ok: false as const,
        error: {
          code: "AUTH_DISABLED" as const,
          message: "鉴权功能未启用",
        },
      };
    }

    return { ok: true as const };
  };

  router.post("/verify/tell/start", async (request, response) => {
    const enabled = ensureTellEnabled();
    if (!enabled.ok) {
      response.status(403).json(enabled);
      return;
    }

    const playerName = parsePlayerName(request.body);
    if (!playerName) {
      response.status(400).json({
        ok: false,
        error: {
          code: "INVALID_VERIFICATION",
          message: "playerName 必填",
        },
      });
      return;
    }

    const result = await input.playerAuthService.startTellVerification(playerName);
    sendAuthResult(response, result);
  });

  router.post("/verify/tell/finish", async (request, response) => {
    const enabled = ensureTellEnabled();
    if (!enabled.ok) {
      response.status(403).json(enabled);
      return;
    }

    const playerName = parsePlayerName(request.body);
    const code = parseCode(request.body);
    if (!playerName || !code) {
      response.status(400).json({
        ok: false,
        error: {
          code: "INVALID_VERIFICATION",
          message: "playerName 与 code 必填",
        },
      });
      return;
    }

    const result = await input.playerAuthService.finishTellVerification(playerName, code);
    sendAuthResult(response, result);
  });

  router.post("/verify/manual/start", async (request, response) => {
    const enabled = ensureManualEnabled();
    if (!enabled.ok) {
      response.status(403).json(enabled);
      return;
    }

    const playerName = parsePlayerName(request.body);
    if (!playerName) {
      response.status(400).json({
        ok: false,
        error: {
          code: "INVALID_VERIFICATION",
          message: "playerName 必填",
        },
      });
      return;
    }

    const result = await input.playerAuthService.startManualVerification(playerName);
    sendAuthResult(response, result);
  });

  router.post("/verify/manual/confirm", async (request, response) => {
    const enabled = ensureManualEnabled();
    if (!enabled.ok) {
      response.status(403).json(enabled);
      return;
    }

    const playerName = parsePlayerName(request.body);
    const code = parseCode(request.body);
    if (!playerName || !code) {
      response.status(400).json({
        ok: false,
        error: {
          code: "INVALID_VERIFICATION",
          message: "playerName 与 code 必填",
        },
      });
      return;
    }

    const result = await input.playerAuthService.confirmManualVerification(
      playerName,
      code,
    );
    sendAuthResult(response, result);
  });

  return router;
}

function parsePlayerName(body: unknown): string {
  if (typeof body !== "object" || body === null || !("playerName" in body)) {
    return "";
  }

  const { playerName } = body as { playerName?: unknown };
  if (typeof playerName !== "string") {
    return "";
  }

  return playerName.trim();
}

function parseCode(body: unknown): string {
  if (typeof body !== "object" || body === null || !("code" in body)) {
    return "";
  }

  const { code } = body as { code?: unknown };
  if (typeof code !== "string") {
    return "";
  }

  return code.trim();
}

function sendAuthResult(
  response: {
    status(statusCode: number): { json(payload: unknown): void };
    json(payload: unknown): void;
  },
  result: StartTellResult | FinishTellResult | StartManualResult | ConfirmManualResult,
): void {
  if (result.ok) {
    response.status(200).json(result);
    return;
  }

  // 统一把领域错误码映射为 HTTP 状态，避免前端依赖分散的状态判断逻辑。
  response.status(toHttpStatusCode(result.error.code)).json(result);
}

function toHttpStatusCode(code: AuthRouteError["code"]): number {
  if (code === "RATE_LIMITED") {
    return 429;
  }
  if (code === "BRIDGE_UNAVAILABLE") {
    return 503;
  }
  if (code === "INVALID_VERIFICATION") {
    return 400;
  }
  if (code === "TOKEN_INVALID") {
    return 401;
  }
  return 403;
}
