# Development Setup

This page covers cloning the repo, installing dependencies, and the
shape of the local dev workflow. Pair it with
[code-style](./code-style.md) for linting / formatting / TS rules and
[testing](./testing.md) for the test workflow.

## Requirements

| Tool | Version | Why                                                              |
| ---- | ------- | ---------------------------------------------------------------- |
| Node | 20+     | matches CI (`.github/workflows/ci.yml` pins `node-version: 20`). |
| pnpm | 10+     | repo uses pnpm workspaces and a `pnpm-lock.yaml`.                |
| Git  | any     | nothing version-specific.                                        |

The repo does not ship `.nvmrc` — pin Node yourself with whatever
version manager you use. If you're on `nvm`:

```sh
nvm install 20
nvm use 20
corepack enable
corepack prepare pnpm@10 --activate
```

## First-time clone

```sh
git clone <repo-url> apollo-map-studio
cd apollo-map-studio
pnpm install
```

`pnpm install` runs the `prepare` script (`husky`) automatically, which
installs git hooks under `.husky/`. If hooks fail to install (e.g. no
network during postinstall), run `pnpm prepare` manually.

## Branch topology

- `v1` — the active development branch. **All work happens here.**
- `main` — divergent legacy line. The two branches share no common
  ancestor; never use `main` as a PR base for current work.

```sh
git checkout v1
git pull --ff-only
```

If `git status` shows you on `main`, switch to `v1` before starting.

## Scripts

Every script is in `package.json`. Quick reference:

### Dev loop

| Command               | Effect                                                                           |
| --------------------- | -------------------------------------------------------------------------------- |
| `pnpm dev`            | Vite dev server on `http://localhost:5173`. HMR enabled.                         |
| `pnpm electron:dev`   | Vite + Electron concurrently (via `concurrently` + `wait-on`). Uses `127.0.0.1`. |
| `pnpm preview`        | Serve the production-built renderer (run after `pnpm build`).                    |
| `pnpm electron:start` | Build desktop bundle then launch Electron against the built renderer.            |

`pnpm electron:dev` is the right command when you need to debug
main-process code (license manager, IPC, native menu). It builds
`tsconfig.electron.json` first, then starts Electron pointing at the
Vite dev server. Renderer HMR still works.

### Build

| Command               | Effect                                                    |
| --------------------- | --------------------------------------------------------- |
| `pnpm build`          | Vite production build (alias for `build:web`).            |
| `pnpm build:web`      | Renderer only → `dist/`.                                  |
| `pnpm build:electron` | Main + preload TS → `dist-electron/`.                     |
| `pnpm build:desktop`  | `build:web && build:electron`. Required before packaging. |

### Quality gates (run these before pushing)

| Command                          | Effect                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm typecheck`                 | `tsc --noEmit` (renderer) + `tsc -p tsconfig.electron.json --noEmit` (main). |
| `pnpm lint`                      | ESLint 9 flat config (`eslint.config.js`).                                   |
| `pnpm lint:fix`                  | ESLint with `--fix`.                                                         |
| `pnpm format`                    | Prettier write across the repo.                                              |
| `pnpm format:check`              | Prettier check (read-only). Used by CI.                                      |
| `pnpm test`                      | Vitest run (no watch).                                                       |
| `pnpm bench`                     | Vitest benchmarks.                                                           |
| `pnpm bench --outputJson <file>` | Bench with JSON output, consumed by the budget guard.                        |

### Documentation

| Command             | Effect                                |
| ------------------- | ------------------------------------- |
| `pnpm docs:dev`     | VitePress dev server for `docs/`.     |
| `pnpm docs:build`   | VitePress static build. CI runs this. |
| `pnpm docs:preview` | Serve the built docs locally.         |

### Packaging

| Command              | Output                                           |
| -------------------- | ------------------------------------------------ |
| `pnpm package`       | Unpacked dir under `release/` for inspection.    |
| `pnpm package:linux` | `release/*.AppImage` + `release/*.deb` (x64).    |
| `pnpm package:mac`   | `release/*.dmg` + `release/*.zip` (x64 + arm64). |
| `pnpm package:win`   | `release/*.exe` + `release/*.zip` (x64).         |

See [packaging-desktop-builds](../recipes/packaging-desktop-builds.md)
for the full pipeline.

## Editor setup

VS Code is the team baseline. Recommended extensions:

- **ESLint** (`dbaeumer.vscode-eslint`) — surfaces lint issues inline.
- **Prettier — Code formatter** (`esbenp.prettier-vscode`) — pair with
  the repo's `.prettierrc.json` and set `editor.formatOnSave: true`.
- **Tailwind CSS IntelliSense** (`bradlc.vscode-tailwindcss`) —
  picks up `@theme` tokens so `bg-ams-bg-base` autocompletes.
- **TypeScript Vue Plugin** is **not** required (no Vue here).
- **vitest.explorer** (optional) — UI test runner inside VS Code.

A workspace `.vscode/settings.json` is not committed; configure your
own with at minimum:

```jsonc
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "eslint.useFlatConfig": true,
  "typescript.tsdk": "node_modules/typescript/lib",
}
```

## Path aliases

Imports use the `@/` alias (configured in `vite.config.ts` and
`tsconfig.json`). Deep relative paths (`../../../`) are flagged by
ESLint:

```ts
// good
import { useMapStore } from '@/store/mapStore';

// bad — eslint warns
import { useMapStore } from '../../../store/mapStore';
```

## Project layout

```text
apollo-map-studio/
  src/
    components/        React UI: layout, panels, dialogs, MapCanvas
    hooks/             Maplibre lifecycle, event routing, layer scheduling
    store/             Zustand: mapStore (zundo), uiStore, settingsStore, licenseStore
    lib/               entityOps adapter, schemas, mapIcons, license-bridge
    core/              FSM, geometry, action registry, workers
    io/                Apollo binary/text round-trip
    proto/             Bundled Apollo .proto definitions
    types/             Apollo entity types, editor types
    config/            Pure constants
  electron/            Main process + preload + license subsystem
  scripts/             CI helpers (bench budget guard)
  tools/license-gen/   Offline license issue / verify
  docs/                VitePress site
  .github/workflows/   CI + docs preview
```

## Common first-day commands

```sh
# Verify the toolchain
node --version          # ≥ 20
pnpm --version          # ≥ 10

# Install + first run
pnpm install
pnpm dev                # browser dev
# or
pnpm electron:dev       # desktop dev shell

# Verify quality gates locally
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

If any of those fail on a fresh clone, you have an environment issue —
not a project issue. Common culprits:

- Wrong Node version (TypeScript compiler errors on `??=` syntax).
- pnpm 9 leftover instead of pnpm 10 (lockfile shape mismatch).
- Husky hooks not installed (commits get accepted but pre-commit
  doesn't run; rerun `pnpm prepare`).

## Cross-references

- [code-style](./code-style.md) — ESLint rules, file layout, naming
- [testing](./testing.md) — Vitest config and patterns
- [commit-conventions](./commit-conventions.md) — Conventional Commits
  and the pre-commit hook
- [packaging-desktop-builds](../recipes/packaging-desktop-builds.md) — desktop pipeline
