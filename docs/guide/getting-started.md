# Getting Started

## Prerequisites

- Node.js 20+
- pnpm 10+

## Installation

```bash
git clone https://github.com/SakuraPuare/apollo-map-studio
cd apollo-map-studio
pnpm install
```

## Start The Web Editor

```bash
pnpm dev
```

Open `http://localhost:5173`.

## Start Electron

```bash
pnpm electron:dev
```

The Electron command starts Vite, waits for the local dev server, builds the
Electron main/preload code, then opens the desktop shell against the local
renderer.

## Build For Production

```bash
pnpm build:web
pnpm build:desktop
```

## Package Desktop Artifacts

```bash
pnpm package:linux
pnpm package:mac
pnpm package:win
```

Artifacts are written to `release/`.

## Local CI Parity

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build:web
pnpm docs:build
pnpm test
pnpm bench --outputJson bench-results.json
node scripts/check-bench-budget.mjs bench-results.json
```
