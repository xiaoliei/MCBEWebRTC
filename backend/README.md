# @mcbewebrtc/backend

[← Back to Root](../README.md)

Signaling server for MCBE WebRTC Voice Chat. Provides HTTP API, WebSocket signaling relay, proximity calculation, and player authentication.

## Quick Start

```bash
npm install
cp .env.example .env   # Configure BRIDGE_JWT_SECRET and PLAYER_JWT_SECRET
npm run dev            # Development with hot reload
```

Default: `http://0.0.0.0:3000`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start in development mode (tsx watch) |
| `npm run build` | Compile TypeScript |
| `npm run start` | Start compiled server |
| `npm test` | Run Vitest test suite |

## Project Structure

```
src/
├── config/       # Environment variable reading
├── domain/       # Business logic
│   ├── auth/     # Player auth, rate limiting, token whitelist
│   ├── proximity/# Nearby player calculation
│   ├── session/  # Connection session store
│   └── state/    # Global state store
├── http/         # Express app and routes
│   └── routes/   # auth, ice
├── signaling/    # Socket.IO server and event handlers
│   ├── handlers/ # bridgePosition, clientJoin, presence, webrtcRelay
│   └── middleware/# Bridge authentication
├── utils/        # JWT helpers, safe event emitters
└── server.ts     # Entry point
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Health check |
| GET | `/api/ice` | ICE server configuration |
| POST | `/api/auth/verify/tell/start` | Start tell-based verification |
| POST | `/api/auth/verify/tell/finish` | Complete tell-based verification |
| POST | `/api/auth/verify/manual/start` | Start manual verification |
| POST | `/api/auth/verify/manual/confirm` | Confirm manual verification |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `HOST` | `0.0.0.0` | Listen address |
| `BRIDGE_JWT_SECRET` | *(required)* | JWT secret for MC gateway auth |
| `JWT_EXPIRES_IN` | `2h` | Bridge JWT expiration |
| `PLAYER_JWT_SECRET` | *(required)* | JWT secret for player sessions |
| `PLAYER_JWT_EXPIRES_IN` | `24h` | Player JWT expiration |
| `PLAYER_TOKEN_REFRESH_STRATEGY` | `none` | Token refresh strategy |
| `ICE_SERVERS` | Google STUN | WebRTC ICE servers (JSON array) |
| `CALL_RADIUS` | `16` | Voice call radius in blocks |
| `AUTH_VERIFICATION_ENABLED` | `true` | Enable verification |
| `AUTH_TELL_ENABLED` | `true` | Enable tell verification |
| `AUTH_TELL_CODE_TTL_MS` | `120000` | Tell code TTL (ms) |
| `AUTH_TELL_RATE_LIMIT_WINDOW_MS` | `60000` | Tell rate limit window (ms) |
| `AUTH_TELL_RATE_LIMIT_MAX` | `3` | Tell rate limit max requests |
| `AUTH_MANUAL_ENABLED` | `true` | Enable manual verification |
| `AUTH_MANUAL_CODE_TTL_MS` | `300000` | Manual code TTL (ms) |
| `AUTH_MANUAL_RATE_LIMIT_WINDOW_MS` | `60000` | Manual rate limit window (ms) |
| `AUTH_MANUAL_RATE_LIMIT_MAX` | `3` | Manual rate limit max requests |
| `AUTH_MANUAL_MESSAGE_PREFIX` | `#` | Manual verification message prefix |
| `AUTH_TOKEN_CLEANUP_INTERVAL_MS` | `60000` | Token cleanup interval (ms) |
| `AUTH_VERIFY_SESSION_CLEANUP_INTERVAL_MS` | `60000` | Verify session cleanup interval (ms) |

See `.env.example` for a complete reference.
