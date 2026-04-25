# @mcbewebrtc/frontend

[← Back to Root](../README.md)

Browser client for MCBE WebRTC Voice Chat. Built with React + TypeScript + Vite, handles WebRTC peer connections and proximity-based audio.

## Quick Start

```bash
npm install
npm run dev
```

Default: `http://localhost:5173`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type check + build for production |
| `npm test` | Run Vitest test suite |
| `npm run lint` | Run ESLint |
| `npm run format` | Check Prettier formatting |

## Development Modes

### Mode A: Vite Proxy (Default)

Leave `VITE_BACKEND_URL` empty. Vite proxies `/api` and `/socket.io` to `http://127.0.0.1:3000`.

### Mode B: Explicit Backend URL

Set `VITE_BACKEND_URL` in `.env`:

```bash
VITE_BACKEND_URL=http://127.0.0.1:3000
```

The frontend will connect directly to `${VITE_BACKEND_URL}/socket.io` and request `${VITE_BACKEND_URL}/api/ice`.

## Project Structure

```
src/
├── audio/        # WebRTC audio service
├── components/   # React UI components
│   └── ui/       # Button, Input, Panel, RadioGroup, Section, StatusChip
├── network/      # HTTP auth requests, ICE server fetching
├── signaling/    # Socket.IO gateway and signaling service
└── webrtc/       # Peer connection and WebRTC signaling machine
```

## Features

- Player name verification (tell and manual modes)
- Nearby players display
- Peer connection status monitoring
- Microphone permission management
- Force-replace for duplicate name conflicts

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_BACKEND_URL` | *(empty)* | Explicit backend URL. Leave empty for Vite proxy. |

See `.env.example` for reference.
