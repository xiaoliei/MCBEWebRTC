import "dotenv/config";
import { readConfig } from "./config/readConfig.js";
import { McGateway } from "./mcGateway.js";
import { SignalingBridge } from "./signalingBridge.js";

const config = readConfig();

const bridge = new SignalingBridge({
  backendUrl: config.backendUrl,
  bridgeToken: config.bridgeToken,
  debug: config.debug
});

const mcGateway = new McGateway({
  port: config.gatewayPort,
  debug: config.debug,
  onPlayerTransform: (payload) => {
    const sent = bridge.sendPositionUpdate(payload);
    if (config.debug && !sent) {
      console.log(
        `[mcwss][bridge] skipped update while disconnected: ${payload.playerName}`
      );
    }
  }
});

bridge.start();
mcGateway.start();

function shutdown(): void {
  // 中文注释：统一退出路径，确保 bridge 与网关都能被安全回收。
  bridge.stop();
  mcGateway.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
