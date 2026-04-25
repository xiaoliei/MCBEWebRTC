# Contributing to MCBE WebRTC Voice Chat

Thank you for your interest in contributing! This guide will help you get started.

## Prerequisites

- Node.js >= 18
- npm >= 9
- Familiarity with TypeScript

## Getting Started

### 1. Fork and Clone

```bash
git clone https://github.com/<your-username>/MCBEWebRTC.git
cd MCBEWebRTC
```

### 2. Install Dependencies

```bash
cd shared && npm install && npm run build && cd ..
cd backend && npm install && cd ..
cd mcwss && npm install && cd ..
cd frontend && npm install && cd ..
```

**Note:** `shared` must be built before `backend`, `mcwss`, or `frontend` since they depend on it.

### 3. Configure Environment

```bash
cd backend && cp .env.example .env
cd ../mcwss && cp .env.example .env
```

Set `BRIDGE_JWT_SECRET` to the same value in both files.

## Development Workflow

### Running the Project

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd mcwss && npm run dev

# Terminal 3
cd frontend && npm run dev
```

### Running Tests

All packages use **Vitest**:

```bash
cd backend && npm test
cd mcwss && npm test
cd frontend && npm test
cd shared && npm test
```

Make sure all tests pass before submitting a PR.

### Code Style

This project uses **ESLint** + **Prettier**:

```bash
cd frontend && npm run lint
cd mcwss && npm run lint
```

Please fix any lint errors before committing.

### Code Comments

- Add **Chinese comments** to explain design intent and non-obvious logic
- Don't add comment noise — only comment what isn't self-evident

## Making Changes

### Branch Naming

- `feature/<short-description>` — New features
- `fix/<short-description>` — Bug fixes
- `docs/<short-description>` — Documentation changes

### Commit Messages

Use clear, concise commit messages:

- `feat: add TURN server support`
- `fix: resolve proximity calculation overflow`
- `docs: update README installation steps`

## Project Structure

```
MCBEWebRTC/
├── backend/src/
│   ├── config/       # Environment configuration
│   ├── domain/       # Business logic (auth, proximity, sessions)
│   ├── http/         # Express routes and API
│   ├── signaling/    # Socket.IO event handlers
│   └── utils/        # JWT and utility functions
├── frontend/src/
│   ├── audio/        # WebRTC audio processing
│   ├── components/   # React UI components
│   ├── network/      # HTTP auth and ICE config
│   ├── signaling/    # Socket.IO client
│   └── webrtc/       # WebRTC peer connections
├── mcwss/src/
│   ├── config/       # Environment configuration
│   ├── services/     # Command handling (tell, manual auth)
│   ├── utils/        # JWT utilities
│   ├── mcGateway.ts  # Minecraft WebSocket gateway
│   └── signalingBridge.ts  # Socket.IO bridge to backend
├── shared/src/       # Shared TypeScript types
└── demo/             # Legacy reference (do not modify)
```

## Pull Request Checklist

Before submitting a PR, ensure:

- [ ] All tests pass (`npm test` in each package)
- [ ] No lint errors (`npm run lint` in frontend and mcwss)
- [ ] New code includes Chinese comments for non-obvious logic
- [ ] No changes to `demo/` directory
- [ ] `shared/` is rebuilt if type definitions changed
- [ ] Environment variables follow existing conventions

## Reporting Issues

When reporting bugs, please include:

- Node.js version
- Minecraft Bedrock Edition version
- Steps to reproduce
- Expected vs actual behavior
- Relevant log output

Thank you for contributing!
