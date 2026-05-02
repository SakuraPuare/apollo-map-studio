# Apollo Map Studio

Desktop and web editor for Apollo HD map data. The current `v1` line keeps the
browser editor, adds Electron desktop packaging, and supports offline license
activation for distributed desktop builds.

![License](https://img.shields.io/badge/license-CC%20BY--NC%204.0-orange)
![Version](https://img.shields.io/badge/version-1.0.0-green)

## Features

- Import and export Apollo HD maps in binary and text-proto formats.
- Preserve Apollo proto2 optional semantics and map metadata during round trips.
- Edit lanes, roads, junctions, crosswalks, signals, stop signs, speed bumps,
  yield signs, clear areas, RSUs, parking spaces, barrier gates, and PNC
  junctions.
- Derive and reconcile Apollo overlap, lane topology, boundary, and signal
  geometry data.
- Render committed map data through worker-backed cold layers and live edits
  through hot layers for larger map datasets.
- Package signed desktop artifacts for Linux, macOS, and Windows through
  Electron Builder.
- Issue and verify offline activation licenses bound to a local machine.

## Requirements

- Node.js 20+
- pnpm 10+

## Development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` for the web editor.

For Electron development:

```bash
pnpm electron:dev
```

## Build And Test

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

## Desktop Packaging

```bash
pnpm package:linux
pnpm package:mac
pnpm package:win
```

Build outputs are written to `release/`. CI builds the web artifact first, then
packages desktop artifacts on Linux, macOS, and Windows.

## Project Structure

```text
src/
  components/        React UI, layout, inspector panels, dialogs
  hooks/             MapLibre lifecycle, event routing, layer scheduling
  core/              Domain logic, geometry, FSM, workers, overlap derivation
  io/                Apollo binary/text import and export pipeline
  lib/               Entity operations, schemas, map icons, license bridge
  store/             Zustand stores for map, UI, settings, license, progress
  proto/             Apollo .proto definitions bundled into Vite builds
electron/            Electron main/preload processes and license validation
scripts/             Benchmark budget checks
tools/license-gen/   Offline license key generation and issuing utilities
docs/                VitePress documentation site
```

## CI/CD

GitHub Actions runs typecheck, lint, formatting, web build, docs build, unit
tests, benchmark budgets, and cross-platform desktop packaging. Tag pushes
matching `v*` also publish a GitHub Release.

## License

This project is licensed under the Creative Commons Attribution-NonCommercial
4.0 International license. Commercial use is prohibited.

This repository also includes protocol buffer definitions and logic derived
from the Apollo autonomous driving platform, which is licensed under Apache
2.0. See [LICENSE](./LICENSE) for the full text and third-party notice.
