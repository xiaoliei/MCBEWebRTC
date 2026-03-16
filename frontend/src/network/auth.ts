/**
 * 鉴权 API 封装
 * 提供四种验证方式的 HTTP 请求封装：
 * - 验证码（tell）方式
 * - 手动验证（manual）方式
 */

export interface AuthErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export interface StartTellVerificationSuccessResponse {
  ok: true;
  ttlMs: number;
  expiresAt: number;
}

export interface FinishTellVerificationSuccessResponse {
  ok: true;
  token: string;
}

export interface StartManualVerificationSuccessResponse {
  ok: true;
  code: string;
  challenge: string;
  ttlMs: number;
  expiresAt: number;
}

export interface ConfirmManualVerificationSuccessResponse {
  ok: true;
  token: string;
}

export type StartTellVerificationResponse =
  | StartTellVerificationSuccessResponse
  | AuthErrorResponse;
export type FinishTellVerificationResponse =
  | FinishTellVerificationSuccessResponse
  | AuthErrorResponse;
export type StartManualVerificationResponse =
  | StartManualVerificationSuccessResponse
  | AuthErrorResponse;
export type ConfirmManualVerificationResponse =
  | ConfirmManualVerificationSuccessResponse
  | AuthErrorResponse;

const NETWORK_ERROR_RESPONSE: AuthErrorResponse = {
  ok: false,
  error: {
    code: 'NETWORK_ERROR',
    message: '鉴权请求失败，请稍后重试'
  }
};

function isAuthErrorResponse(payload: unknown): payload is AuthErrorResponse {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as {
    ok?: unknown;
    error?: {
      code?: unknown;
      message?: unknown;
    };
  };

  return (
    candidate.ok === false &&
    typeof candidate.error?.code === 'string' &&
    typeof candidate.error?.message === 'string'
  );
}

// 中文注释：未配置后端地址时走相对路径，配合 Vite 代理进行本地联调；显式配置时直连后端地址。
function buildRequestUrl(endpoint: string): string {
  const backendUrl = String(import.meta.env.VITE_BACKEND_URL ?? '').trim();
  return backendUrl ? `${backendUrl}${endpoint}` : endpoint;
}

// 中文注释：统一处理鉴权接口的 JSON 响应；网络异常或非 JSON 响应时返回统一错误结构，避免调用方分散处理。
async function requestJson<TSuccess extends { ok: true }>(
  endpoint: string,
  body: Record<string, unknown>,
  fetcher: typeof fetch = fetch
): Promise<TSuccess | AuthErrorResponse> {
  try {
    const response = await fetcher(buildRequestUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const payload = (await response.json()) as TSuccess | AuthErrorResponse;
    if (!response.ok && !isAuthErrorResponse(payload)) {
      return NETWORK_ERROR_RESPONSE;
    }

    return payload;
  } catch {
    return NETWORK_ERROR_RESPONSE;
  }
}

/**
 * 验证码（tell）验证 - 开始
 * POST /api/auth/verify/tell/start
 * Body: { playerName: string }
 * 成功返回: { ok: true, ttlMs, expiresAt }
 */
export async function startTellVerification(
  playerName: string,
  fetcher: typeof fetch = fetch
): Promise<StartTellVerificationResponse> {
  return requestJson<StartTellVerificationSuccessResponse>(
    '/api/auth/verify/tell/start',
    { playerName },
    fetcher
  );
}

/**
 * 验证码（tell）验证 - 完成
 * POST /api/auth/verify/tell/finish
 * Body: { playerName: string, code: string }
 * 成功返回: { ok: true, token }
 */
export async function finishTellVerification(
  playerName: string,
  code: string,
  fetcher: typeof fetch = fetch
): Promise<FinishTellVerificationResponse> {
  return requestJson<FinishTellVerificationSuccessResponse>(
    '/api/auth/verify/tell/finish',
    { playerName, code },
    fetcher
  );
}

/**
 * 手动验证 - 开始
 * POST /api/auth/verify/manual/start
 * Body: { playerName: string }
 * 成功返回: { ok: true, code, challenge, ttlMs, expiresAt }
 */
export async function startManualVerification(
  playerName: string,
  fetcher: typeof fetch = fetch
): Promise<StartManualVerificationResponse> {
  return requestJson<StartManualVerificationSuccessResponse>(
    '/api/auth/verify/manual/start',
    { playerName },
    fetcher
  );
}

/**
 * 手动验证 - 确认
 * POST /api/auth/verify/manual/confirm
 * Body: { playerName: string , code: string }
 * 成功返回: { ok: true, token }
 */
export async function confirmManualVerification(
  playerName: string,
  code: string,
  fetcher: typeof fetch = fetch
): Promise<ConfirmManualVerificationResponse> {
  return requestJson<ConfirmManualVerificationSuccessResponse>(
    '/api/auth/verify/manual/confirm',
    { playerName, code },
    fetcher
  );
}
