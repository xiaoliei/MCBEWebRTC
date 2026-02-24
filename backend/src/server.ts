import "dotenv/config";
import http from "node:http";
import { readConfig } from "./config/readConfig.js";
import { ReconnectCodeStore } from "./domain/session/ReconnectCodeStore.js";
import { SessionStore } from "./domain/session/SessionStore.js";
import { StateStore } from "./domain/state/StateStore.js";
import { createApp } from "./http/createApp.js";
import { createSocketServer } from "./signaling/createSocketServer.js";

const config = readConfig();

const stateStore = new StateStore();
const sessionStore = new SessionStore();
const reconnectCodeStore = new ReconnectCodeStore();

const app = createApp({ iceServers: config.iceServers });
const httpServer = http.createServer(app);

createSocketServer({
  httpServer,
  options: {
    bridgeToken: config.bridgeToken,
    callRadius: 16,
    tickMs: 200,
    gamePlayerTtlMs: 30_000,
  },
  stores: {
    stateStore,
    sessionStore,
    reconnectCodeStore,
  },
});

httpServer.listen(config.port, config.host, () => {
  // 中文日志便于本地调试快速确认监听地址。
  console.log(`[backend] listening on http://${config.host}:${config.port}`);
});
