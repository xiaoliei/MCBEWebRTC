# @mcbewebrtc/shared

[← Back to Root](../README.md)

Shared TypeScript types and utilities used by `backend`, `mcwss`, and `frontend`.

## Quick Start

```bash
npm install
npm run build
```

**Important:** After modifying `shared/`, rebuild it before running dependent packages:

```bash
cd shared && npm run build
cd ../backend && npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm test` | Run Vitest test suite |
