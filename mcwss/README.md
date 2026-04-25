# @mcbewebrtc/mcwss

[← Back to Root](../README.md)

Minecraft Bedrock WebSocket gateway. Receives `PlayerTransform` events from MC clients and bridges them to the backend signaling server via Socket.IO.

## Quick Start

```bash
npm install
cp .env.example .env   # Set BRIDGE_JWT_SECRET (must match backend)
npm run dev
```

Default: `ws://0.0.0.0:8000`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start in development mode (tsx watch) |
| `npm run build` | Compile TypeScript |
| `npm run start` | Start compiled server |
| `npm test` | Run Vitest test suite |
| `npm run lint` | Run ESLint |
| `npm run format` | Check Prettier formatting |
| `npm run format:fix` | Fix Prettier formatting |

## Connecting in Minecraft

In Minecraft Bedrock Edition, enable WebSocket and run:

```
/connect localhost:8000
```

## Project Structure

```
src/
├── config/                  # Environment configuration
├── services/command/        # Command handlers
│   ├── manualAuthWatcher.ts # Monitor chat for manual verification codes
│   └── sendTellCommand.ts   # Send /tell messages to players
├── utils/                   # JWT utilities
├── main.ts                  # Entry point
├── mcGateway.ts             # MC WebSocket server
├── signalingBridge.ts       # Socket.IO bridge to backend
└── types.ts                 # Type definitions
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_URL` | `http://127.0.0.1:3000` | Backend service address |
| `BRIDGE_JWT_SECRET` | *(required)* | Must match backend |
| `JWT_EXPIRES_IN` | `2h` | Bridge JWT expiration |
| `GATEWAY_PORT` | `8000` | MC WebSocket listen port |
| `DEBUG` | `false` | Debug logging |

See `.env.example` for reference.
