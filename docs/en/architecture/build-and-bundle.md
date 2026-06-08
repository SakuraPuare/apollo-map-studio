---
title: Build & Bundle
description: Vite dev/build for the web, tsc for Electron, electron-builder, GitHub Actions release workflow, bundle splitting, dynamic imports, worker bundling
---

# Build & Bundle

> Key files:
>
> - `vite.config.ts` — renderer build
> - `tsconfig.json` — renderer tsc
> - `tsconfig.electron.json` — main-process tsc
> - `electron-builder.yml` — desktop packaging
> - `.github/workflows/ci.yml` — CI / release
> - `package.json` scripts

## 1. Three pipelines

```mermaid
graph LR
    subgraph Renderer
      A1[src/**/*.ts(x)] --> A2[vite build]
      A2 --> A3[dist/]
    end
    subgraph "Main process"
      B1[electron/**/*.cts] --> B2[tsc -p tsconfig.electron.json]
      B2 --> B3[dist-electron/*.cjs]
    end
    subgraph Docs
      C1[docs/**/*.md] --> C2[vitepress build]
      C2 --> C3[docs/.vitepress/dist]
    end
    A3 & B3 --> D[electron-builder]
    D --> E[release/*.dmg .zip .deb .exe .AppImage]
```

Pipelines are independent — each can run in isolation, and CI runs
them in parallel.

## 2. Renderer: Vite 8

`vite.config.ts:70-97`:

```ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          return getVendorChunkName(id);
        },
      },
    },
  },
});
```

Highlights:

- **`base: './'`** — output works at any subpath (Electron's
  `loadFile` uses `file://`).
- **rolldown** — Vite 8 ships rolldown by default, materially faster
  than Rollup for production builds.
- **`chunkSizeWarningLimit: 1200`** — `maplibre-gl` ships as a
  prebuilt monolith (~1 MB); the bundler can't split inside it.
- **`manualChunks`** — see §3.

### 2.1 Entry

`index.html` → `src/main.tsx` → React root. Vite injects the module
script automatically.

### 2.2 Worker bundling

```ts
new Worker(new URL('./spatial.worker.ts', import.meta.url), { type: 'module' });
```

Vite recognises this idiom as a worker chunk and emits a separate
bundle (`spatial.worker-XXX.js`) with rewritten URL. All three workers
(spatial / overlap / apolloIO) follow the same idiom; no extra config.

## 3. Vendor chunk strategy

`vite.config.ts:6-26` defines `VENDOR_CHUNK_GROUPS`:

| Chunk             | Packages                                                          |
| ----------------- | ----------------------------------------------------------------- |
| `vendor-react`    | react, react-dom, scheduler, use-sync-external-store              |
| `vendor-map`      | maplibre-gl, @maplibre/, @mapbox/, earcut, gl-matrix, kdbush, ... |
| `vendor-dockview` | dockview, dockview-react                                          |
| `vendor-state`    | zustand, zundo, immer, xstate, @xstate/react                      |
| `vendor-forms`    | react-hook-form, @hookform/resolvers, zod                         |
| `vendor-tree`     | react-arborist                                                    |
| `vendor-ui`       | @radix-ui/, cmdk, react-icons                                     |
| `vendor-scoped`   | other `@scoped/*` packages                                        |
| `vendor-misc`     | other unscoped npm deps                                           |

`getNodeModulePackageName` uses the **last** `/node_modules/` segment
to extract the package name — pnpm-nested deps still resolve cleanly.

Intent:

- The browser parallelises multiple chunk downloads better than one
  megachunk.
- Business code changes do not invalidate vendor cache.
- The 1 MB maplibre chunk lives alone, immune to ripple changes.

## 4. Dynamic imports

Hot-path modules import synchronously; the following stay
`import()`-only:

| Module                           | Loads when                   |
| -------------------------------- | ---------------------------- |
| `apolloIOBridge` lazy worker     | first import / export        |
| `LicenseDialog` (large modal)    | user clicks Activate License |
| `SettingsPanel` third-party regs | user opens the Settings tab  |

This trims first-paint JS. Each module documents the rule inline.

## 5. Tailwind 4

```css
/* src/index.css */
@import 'tailwindcss';
@import 'maplibre-gl/dist/maplibre-gl.css';

@theme { ... }
```

- `@tailwindcss/vite` plugin handles `@theme` and auto-utility
  derivation.
- No `tailwind.config.js`; CSS-driven.
- Tailwind 4's JIT works the same in dev and build.

## 6. Electron main: tsc

`tsconfig.electron.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist-electron",
    "rootDir": "electron",
    "types": ["node", "electron"]
  },
  "include": ["electron/**/*.ts", "electron/**/*.cts"]
}
```

- `module: NodeNext` emits CJS (`.cjs`) — Electron main consumes that
  natively.
- `outDir: dist-electron` is where electron-builder looks for
  `main.cjs`.
- No React or browser polyfills — the main process is pure Node.

## 7. Desktop packaging

See [Electron Integration §7](./electron-integration.md#7-packaging-electron-builder)
for the full schema. Highlights:

- `extraMetadata.main: dist-electron/main.cjs`
- `extraMetadata.dependencies: {}` so the asar archive does not
  re-bundle Vite-bundled deps.
- `asar: true`
- `npmRebuild: false`; `pnpm.onlyBuiltDependencies` limits native
  builds to `electron` / `electron-winstaller`.

## 8. CI / GitHub Actions

`.github/workflows/ci.yml`:

### 8.1 Quality, build, and benchmark jobs

```yaml
quality:
  - pnpm typecheck
  - pnpm lint
  - pnpm format:check
  - pnpm test
  - pnpm test:electron
  - CI=true pnpm run react-doctor
benchmarks:
  - pnpm bench --outputJson bench-results.json
  - node scripts/check-bench-budget.mjs bench-results.json
web-build:
  - pnpm build:web
docs-build:
  - pnpm docs:build
desktop-build:
  - download apollo-map-studio-web
  - pnpm build:docs:desktop
  - pnpm build:electron:hardened
  - pnpm verify:electron-hardening
```

`web-build` uploads `dist/`; `desktop-build` downloads that web
artifact, builds `dist/docs` plus hardened `dist-electron/`, and uploads the
desktop build artifact.

### 8.2 `desktop-package` matrix

```yaml
matrix:
  include:
    - { os: ubuntu-latest, builder-args: --linux --x64, artifact-name: apollo-map-studio-linux }
    - {
        os: macos-latest,
        builder-args: --mac --x64 --arm64,
        artifact-name: apollo-map-studio-macos,
      }
    - { os: windows-latest, builder-args: --win --x64, artifact-name: apollo-map-studio-windows }
```

`desktop-package` depends on `desktop-build`, downloads
`apollo-map-studio-desktop-build`, and runs
`pnpm exec electron-builder &#36;&#123;&#123; matrix.builder-args &#125;&#125; --publish never`.

Env:

- `CSC_IDENTITY_AUTO_DISCOVERY: false` — do not search the local
  keychain for signing certs.
- `NODE_OPTIONS: --no-deprecation` — suppress Electron Builder Node
  deprecation noise during packaging.

### 8.3 `github-release` (tag only)

```yaml
if: startsWith(github.ref, 'refs/tags/v')
```

`github-release` depends on `quality`, `benchmarks`, `web-build`,
`docs-build`, and `desktop-package`. Tag pushes download all artifacts, zip
the web bundle, and run `softprops/action-gh-release@v3` to publish `.dmg` /
`.zip` / `.deb` / `.AppImage` / `.exe`.

## 9. Concurrency

```yaml
concurrency:
  group: &#36;&#123;&#123; github.workflow &#125;&#125;-&#36;&#123;&#123; github.ref &#125;&#125;
  cancel-in-progress: true
```

A new push cancels the in-progress run on the same branch — keeps the
queue short.

## 10. Local scripts (package.json)

| Script                      | Purpose                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `dev`                       | `vite` — browser dev                                                                                            |
| `build`                     | `build:web && build:docs:desktop`                                                                               |
| `build:web`                 | `vite build` — renderer prod                                                                                    |
| `build:docs:desktop`        | VitePress build into `dist/docs` for the desktop package                                                        |
| `build:electron`            | sync public key + clean + `tsc -p tsconfig.electron.json`                                                       |
| `build:electron:hardened`   | `build:electron` plus sealed protected Electron modules                                                         |
| `verify:electron-hardening` | verifies sealed modules, loader, and integrity manifest                                                         |
| `build:desktop`             | `build && build:electron:hardened && verify:electron-hardening`                                                 |
| `electron:dev`              | concurrently vite + wait-on + electron + HMR                                                                    |
| `electron:start`            | `build:desktop && electron .`                                                                                   |
| `package`                   | `build:desktop && cross-env NODE_OPTIONS=--no-deprecation electron-builder --dir --publish never`               |
| `package:linux`             | `build:desktop && cross-env NODE_OPTIONS=--no-deprecation electron-builder --linux --x64 --publish never`       |
| `package:mac`               | `build:desktop && cross-env NODE_OPTIONS=--no-deprecation electron-builder --mac --x64 --arm64 --publish never` |
| `package:win`               | `build:desktop && cross-env NODE_OPTIONS=--no-deprecation electron-builder --win --x64 --publish never`         |
| `docs:dev`                  | `vitepress dev docs`                                                                                            |
| `docs:build`                | `vitepress build docs`                                                                                          |
| `docs:preview`              | `vitepress preview docs`                                                                                        |
| `test`                      | `vitest run`                                                                                                    |
| `test:electron`             | `node scripts/run-electron-tests.mjs`                                                                           |
| `bench`                     | `vitest bench --run --maxWorkers=1`                                                                             |
| `bench:fast`                | `vitest bench --run --maxWorkers=100%`                                                                          |
| `typecheck`                 | renderer + config + Electron tsconfigs                                                                          |
| `lint` / `lint:fix`         | `eslint .` (`lint` also runs react-doctor)                                                                      |
| `react-doctor`              | UI structural check, blocking errors in CI                                                                      |
| `format` / `format:check`   | `prettier`                                                                                                      |

## 11. Footprint and timing

| Metric               | Observed                           |
| -------------------- | ---------------------------------- |
| Total `dist` size    | ~12 MB (gzip ~3.5 MB)              |
| `vendor-map` chunk   | ~1.0 MB (maplibre dominant)        |
| `vendor-react` chunk | ~150 KB                            |
| Application code     | ~700 KB (incl. worker bundles)     |
| Web cold load        | ~1.2 s (4G mobile)                 |
| Electron cold launch | ~600 ms (loadFile reads from disk) |
| `pnpm build:web`     | ~9 s (rolldown)                    |
| `pnpm package:linux` | ~2 min (signing + asar)            |

## 12. ESLint 9 + Prettier 3

- `eslint.config.js` (flat config): react-hooks, react-refresh, basic
  TS rules.
- Prettier 3 + `eslint-config-prettier` to avoid rule conflicts.
- Local `husky` pre-commit + `lint-staged` runs `--fix` and
  `prettier --write` on staged files.
- CI `format:check` is strict; no auto-fix.

## 13. Pitfalls

1. **Editing `manualChunks` without checking sizes** — diff
   `dist/assets/` after each change.
2. **New worker modules** — always use the literal
   `new URL('./xxx.worker.ts', import.meta.url)` form. Vite cannot
   detect dynamically built paths.
3. **`tsconfig.json` (`module: ESNext`) vs `tsconfig.electron.json`
   (`NodeNext`)** — they are independent; main-process code must not
   import renderer paths.
4. **Forgetting `dist-electron` in `electron-builder.files`** — the
   binary launches but cannot find `main.cjs`.
5. **CI matrix failures** — `fail-fast: false` so a single-platform
   failure does not block the others.

## 14. Security notes

- Public-repo PRs only get a limited `secrets.GITHUB_TOKEN`; the
  `package` job runs but `publish: never` means no upload anyway.
- Real signing certs are kept on the release engineer's machine, not
  in CI.
- The license private key
  (`tools/license-gen/keys/private.pem`) is gitignored and held only
  by ops.

## 15. Testing

`pnpm test` runs in CI; local routine:

```bash
pnpm test            # one-shot
pnpm test --watch    # TDD
pnpm bench           # perf
```

## 16. Source map

```
vite.config.ts                    ← renderer build
tsconfig.json                     ← renderer tsc
tsconfig.electron.json            ← main-process tsc
electron-builder.yml              ← desktop packaging
.github/workflows/ci.yml          ← CI matrix + release
.github/workflows/docs-preview.yml← VitePress preview deploy
package.json                      ← script entry
docs/.vitepress/                  ← VitePress config (nav / theme)
scripts/                          ← bench budget guard
```

## 17. See also

- [Electron Integration](./electron-integration.md)
- [Testing Strategy](./testing-strategy.md)
- [Worker Protocol](./worker-protocol.md)
- [Design Tokens](./design-tokens.md)
