# Demo (Legacy Reference)

> **Deprecated:** This directory contains the original proof-of-concept implementation. It uses a different architecture (raw ws + JSON) and is NOT compatible with the current mainline packages.
>
> For the current implementation, see:
> - [Backend](../backend/README.md)
> - [MC Gateway](../mcwss/README.md)
> - [Frontend](../frontend/README.md)

## Running

This demo is kept for behavior reference and regression testing only.

```bash
cd demo
npm install
npm run start        # Start signaling server (ws://localhost:3000/ws)
npm run start:gateway # Start MC gateway (ws://localhost:8000)
```

Open `http://localhost:3000` for the demo interface.
