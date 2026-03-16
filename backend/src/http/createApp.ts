import express, { type Express } from "express";
import type { IceServerDto } from "../config/readConfig.js";
import { createIceRouter } from "./routes/ice.js";
import { createAuthRouter } from "./routes/auth.js";
import type { PlayerAuthServiceLike } from "./routes/auth.js";

export interface CreateAppInput {
  iceServers: IceServerDto[];
  auth?: {
    playerAuthService: PlayerAuthServiceLike;
    authVerificationEnabled: boolean;
    authTellEnabled: boolean;
    authManualEnabled: boolean;
  };
}

export function createApp(input: CreateAppInput): Express {
  const app = express();

  app.use(express.json());
  app.use("/api", createIceRouter({ iceServers: input.iceServers }));

  if (input.auth) {
    // 鉴权路由按功能开关惰性挂载，避免未注入依赖时误暴露接口。
    app.use(
      "/api/auth",
      createAuthRouter({
        playerAuthService: input.auth.playerAuthService,
        authVerificationEnabled: input.auth.authVerificationEnabled,
        authTellEnabled: input.auth.authTellEnabled,
        authManualEnabled: input.auth.authManualEnabled,
      }),
    );
  }

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ ok: true });
  });

  return app;
}
