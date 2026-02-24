import express, { type Express } from "express";
import type { IceServerDto } from "../config/readConfig.js";
import { createIceRouter } from "./routes/ice.js";

export interface CreateAppInput {
  iceServers: IceServerDto[];
}

export function createApp(input: CreateAppInput): Express {
  const app = express();

  app.use(express.json());
  app.use("/api", createIceRouter({ iceServers: input.iceServers }));

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ ok: true });
  });

  return app;
}
