# MCBE WebRTC Voice Chat

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

A proximity-based voice chat system for **Minecraft Bedrock Edition**, powered by WebRTC peer-to-peer audio.

Players in the same Minecraft world can hear each other based on their in-game distance. The closer you are, the louder they sound — just like real life.

## Features

- **Proximity Voice Chat** — WebRTC peer-to-peer audio with configurable call radius
- **In-Game Position Tracking** — Real-time position updates via Minecraft WebSocket
- **JWT Authentication** — Secure player verification with two modes:
  - **Tell Verification**: Server sends a code to your in-game chat via `/tell`
  - **Manual Verification**: Copy a verification code and paste it in-game chat
- **Duplicate Name Protection** — Prevents impersonation with force-replace option
- **Modular Architecture** — Separate backend, frontend, MC gateway, and shared packages

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────┐    Socket.IO     ┌─────────┐    Socket.IO    ┌──────────┐
│  Minecraft   │ ◄──────────────► │  mcwss  │ ◄─────────────► │ backend │ ◄────────────► │ frontend │
│  Bedrock Ed. │   /connect       │ (gateway)│                 │ (server)│                 │ (browser)│
└─────────────┘                   └─────────┘                 └─────────┘                 └──────────┘
                                        │                           │                          │
                                 Position updates            Signaling relay           WebRTC P2P audio
                                 (PlayerTransform)         + Proximity calc          (麦克风 → 耳机)
```

**Data flow:**
1. MC clients send `PlayerTransform` events to `mcwss` gateway via WebSocket
2. `mcwss` forwards positions to `backend` via Socket.IO
3. `backend` calculates nearby players and relays WebRTC signaling
4. `frontend` establishes P2P audio connections with nearby players

## Project Structure

```
MCBEWebRTC/
├── backend/      # Signaling server (Express + Socket.IO)
├── frontend/     # Browser client (React + Vite + WebRTC)
├── mcwss/        # Minecraft WebSocket gateway (ws + Socket.IO client)
├── shared/       # Shared TypeScript types
└── demo/         # Legacy reference implementation (deprecated)
```

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **Minecraft Bedrock Edition** with WebSocket support enabled

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/<your-username>/MCBEWebRTC.git
cd MCBEWebRTC

# Install dependencies for each package
cd backend && npm install && cd ..
cd mcwss && npm install && cd ..
cd frontend && npm install && cd ..
cd shared && npm install && cd ..
```

### 2. Configure Environment Variables

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env — set BRIDGE_JWT_SECRET and PLAYER_JWT_SECRET to strong random strings

# MC Gateway
cd ../mcwss
cp .env.example .env
# Edit .env — set BRIDGE_JWT_SECRET (must match backend)
```

**Important:** `BRIDGE_JWT_SECRET` must be identical in both `backend/.env` and `mcwss/.env`.

### 3. Start Services

**Development mode** (with hot reload):

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: MC Gateway
cd mcwss && npm run dev

# Terminal 3: Frontend (optional)
cd frontend && npm run dev
```

**Production mode:**

```bash
cd shared && npm run build
cd backend && npm run build && npm run start
cd mcwss && npm run build && npm run start
cd frontend && npm run build  # Static files in frontend/dist/
```

**Docker deployment:**

```bash
# Development (with hot reload)
docker compose up --build

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Stop production
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

> When using Docker, you still need `.env` files in each subpackage directory (see "Configure environment variables" above).
> Ensure `BRIDGE_JWT_SECRET` is identical in both `backend/.env` and `mcwss/.env`.

### 4. Connect in Minecraft

In Minecraft Bedrock Edition, enable WebSocket and connect to the gateway:

```
/connect localhost:8000
```

Open `http://localhost:5173` in your browser, enter your player name, complete verification, and start chatting!

## Configuration

### Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `HOST` | `0.0.0.0` | Listen address |
| `BRIDGE_JWT_SECRET` | *(required)* | JWT secret for MC gateway auth |
| `JWT_EXPIRES_IN` | `2h` | Bridge JWT expiration |
| `PLAYER_JWT_SECRET` | *(required)* | JWT secret for player sessions |
| `PLAYER_JWT_EXPIRES_IN` | `24h` | Player JWT expiration |
| `ICE_SERVERS` | Google STUN | WebRTC ICE servers (JSON array) |
| `CALL_RADIUS` | `16` | Voice call radius in blocks |
| `AUTH_VERIFICATION_ENABLED` | `true` | Enable player verification |
| `AUTH_TELL_ENABLED` | `true` | Enable tell-based verification |
| `AUTH_MANUAL_ENABLED` | `true` | Enable manual verification |

### MC Gateway Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_URL` | `http://127.0.0.1:3000` | Backend service address |
| `BRIDGE_JWT_SECRET` | *(required)* | Must match backend |
| `JWT_EXPIRES_IN` | `2h` | Bridge JWT expiration |
| `GATEWAY_PORT` | `8000` | MC WebSocket listen port |
| `DEBUG` | `false` | Debug logging |

### Frontend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_BACKEND_URL` | *(empty)* | Explicit backend URL. Leave empty to use Vite proxy |

## Development

### Running Tests

```bash
cd backend && npm test
cd mcwss && npm test
cd frontend && npm test
cd shared && npm test
```

### Code Style

```bash
cd frontend && npm run lint
cd mcwss && npm run lint
```

This project uses **ESLint** + **Prettier** for code formatting.

## Troubleshooting

### Gateway fails to connect to backend

1. Verify backend is running: `curl http://localhost:3000/healthz`
2. Check `BRIDGE_JWT_SECRET` matches in both `.env` files
3. Verify `BACKEND_URL` is correct in `mcwss/.env`

### Environment variables not taking effect

Ensure `.env` files are in the correct package directories (`backend/.env`, `mcwss/.env`).

### Port already in use

Change ports in `.env`:
- Backend: `PORT=3001`
- MC Gateway: `GATEWAY_PORT=8001`

### WebRTC audio not working across networks

Configure TURN servers in `backend/.env`:

```bash
ICE_SERVERS=[{"urls":"turn:your-turn-server.com:3478","username":"user","credential":"pass"}]
```

## Tech Stack

| Package | Technologies |
|---------|-------------|
| **Backend** | Node.js, Express 5, Socket.IO 4, TypeScript |
| **MC Gateway** | Node.js, ws, Socket.IO client, TypeScript |
| **Frontend** | React 19, Vite 7, Socket.IO client, WebRTC, TypeScript |
| **Shared** | TypeScript type definitions |
| **Testing** | Vitest |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

[MIT](./LICENSE) © 小礼
