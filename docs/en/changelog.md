---
title: Changelog
description: Apollo Map Studio release history. Each entry tracks features, fixes, CI/CD, and documentation changes per version.
---

# Changelog

This page lists released versions of Apollo Map Studio in reverse chronological
order. The repository-level [`CHANGELOG.md`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/CHANGELOG.md)
is the compact release feed; this page keeps the documentation-facing notes.

::: tip Versioning
The project follows [Semantic Versioning 2.0.0](https://semver.org/):
**MAJOR.MINOR.PATCH**. The `v1` branch is the production line; `main` is the
experimental staging branch. Pushing any tag matching `v*` triggers the
`github-release` job in CI.
:::

## [1.0.0] — 2026-05-02

The first stable public release. This version completes the Web → Electron
desktop dual-form distribution, offline activation, worker-backed Apollo
import/export, and round-trip fidelity for boundary curves, proto2 `optional`
semantics, overlap derivation, and map header metadata.

### Features

| Topic                   | Description                                                                                                                                            | Architecture link                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Desktop packaging       | Cross-platform Electron pipeline producing AppImage / deb / dmg / zip / exe artifacts on Linux, macOS, and Windows.                                    | [Electron integration](/en/architecture/electron-integration) |
| Offline activation      | Machine-bound activation code system. The Electron main process verifies signatures; the renderer only displays state.                                 | [License system](/en/architecture/license-system)             |
| Worker import/export    | Apollo `.bin` parsing and encoding moved into a Web Worker. The main thread stays interactive on large maps; a progress UI surfaces long-running work. | [Worker protocol](/en/architecture/worker-protocol)           |
| Apollo element coverage | Inspector forms and metadata panels expanded to cover lanes, junctions, signals, roads, overlaps, and the long tail of Apollo elements.                | [Inspector system](/en/architecture/inspector-system)         |
| Round-trip fidelity     | Boundary curves, proto2 optional semantics, overlaps, and map header metadata survive import/export with zero field loss.                              | [Export engine](/en/architecture/export-engine)               |
| Performance             | Cold/hot layer rendering, worker-backed spatial rebuilds, and a `bench-budgets.json` perf-regression guard in CI.                                      | [Cold/hot layers](/en/architecture/cold-hot-layers)           |

### CI / CD

- Added a pnpm-based CI workflow (`.github/workflows/ci.yml`) running on
  `ubuntu-latest`: typecheck, lint, Prettier check, web production build,
  documentation build, unit tests, benchmarks, and the perf-budget guard.
- Added the `desktop-package` matrix job covering `ubuntu-latest`,
  `macos-latest`, and `windows-latest` runners; artifacts are uploaded via
  `actions/upload-artifact@v7`.
- Added the `github-release` job which fires on any `v*` tag and publishes a
  GitHub Release through `softprops/action-gh-release@v3`, archiving web and
  desktop artifacts in one drop.
- Added `docs-preview.yml`. It listens to `docs/**`, `CHANGELOG.md`,
  `package.json`, and `pnpm-lock.yaml` paths, builds VitePress, and deploys to
  GitHub Pages under the `github-pages` environment.

### Documentation

- Restored README, LICENSE, CHANGELOG, and the VitePress documentation
  scaffolding for the `v1` code line.
- Added reference chapters covering protocol, types, enums, perf budgets, CI,
  and design tokens.

## [0.2.0] — 2026-02-25

### Features

- Added the road grouping UI for assigning multiple lanes to a single road /
  section.
- Added the map validation report and the element list explorer for global
  triage of orphan lanes or missing boundaries.
- Added the road properties panel summarising lane topology.

### Bug fixes

- Fixed byte-unit conversion bugs during import/export (speed limits silently
  oscillated between m/s and km/h).
- Fixed lane predecessor/successor wiring and junction polygon winding-order
  normalisation.

### Documentation

- Initial VitePress documentation site with architecture, guide, and api
  sections.

## [0.1.0] — 2026-02-18

### Features

- Project bootstrapped on Vite + React 19 + TypeScript 6.
- Added Apollo proto loading (via `protobufjs`), binary map import/export,
  and the parametric geometry helpers.
- Added Zustand stores (`mapStore`, `uiStore`), zundo undo/redo middleware,
  and MapLibre rendering primitives.
- Added the foundational editor UI: menu bar, tool strip, map canvas, and a
  first-cut property panel.

## Upgrade notes

::: warning 0.x → 1.0.0

- **License**: 1.0.0 introduces offline activation. Unlicensed sessions
  enter read-only mode. See the [activation guide](/en/guide/license-activation).
- **Worker protocol**: `spatial.worker.ts` was bumped to protocol v2. Any
  custom worker bridges must re-align with the new contract documented in
  [Worker protocol](/en/architecture/worker-protocol).
- **Bench budgets**: CI now enforces the p99 ceilings in
  `scripts/bench-budgets.json`. If local benches drift, investigate machine
  load first; only adjust budgets in a PR that explains why.
  :::

## Links

- [Project README](https://github.com/SakuraPuare/apollo-map-studio#readme)
- [GitHub Releases](https://github.com/SakuraPuare/apollo-map-studio/releases)
- [Architecture overview](/en/architecture/overview)
- [Reference entry](/en/reference/)
- [Benchmark budgets](/en/reference/benchmark-budgets)
- [CI pipeline](/en/reference/ci-pipeline)

## Known caveats and follow-ups

> The entries below do not correspond to released features. They track
> engineering red lines surfaced during the documentation pass and serve as
> entry points for follow-up work.

- Mutating `settingsStore.historyLimit` does **not** rebuild the existing
  zundo temporal store. A reload or restart is required for the new limit to
  take effect. See [State management](/en/architecture/state-management).
- `replaceImportedEntityMap` clears the undo history. An import is treated
  as a new document snapshot; undo/redo cannot cross the import boundary.
- `recomputeOverlapsAsync()` uses the entity snapshot at call time. If
  edits land while the worker is computing, the patch reapplies and any
  drift converges back, but a brief inconsistency window exists.
- Renderer-side license state is for UI display only. The trust root lives
  in the Electron main process — bypassing the renderer does not bypass the
  license.
- `tools/license-gen/gen-keys.mjs --rotate` rewrites
  `electron/license/public-key.cts` and invalidates every previously issued
  activation code. Treat key rotation as a release event.

## 1.0.0 PR highlights (curated)

> 1.0.0 covers a large set of commits. The list below picks the changes
> with the biggest architectural / protocol / CI impact. The full history
> is available with `git log --oneline v0.2.0..v1.0.0`.

| Theme           | Notes                                                               |
| --------------- | ------------------------------------------------------------------- |
| feat(license)   | ed25519 keypair, machine binding, main-process verification         |
| ci(desktop)     | tag push fans out to Linux / macOS / Windows packaging              |
| chore(v1)       | Reattaches the v1 branch to docs / ci / release plumbing            |
| chore(merge)    | Keeps v1 tree while merging main history — resolves long divergence |
| docs(vitepress) | Multi-agent doc rewrite; this reference chapter ships in that batch |

## Per-version impact matrix

| Subsystem               | 0.1.0         | 0.2.0           | 1.0.0                                                                     |
| ----------------------- | ------------- | --------------- | ------------------------------------------------------------------------- |
| Apollo proto round-trip | basic         | byte/unit fixes | boundary curves, proto2 optional, overlap unknown variant — all preserved |
| Rendering pipeline      | single layer  | single layer    | cold/hot split, worker-backed spatial, RAF coalesce                       |
| FSM                     | simple toggle | adds selected   | drawPolyline / Bezier / Catmull / Arc / Rect / Polygon                    |
| Inspector               | basic fields  | more fields     | full Apollo coverage + override tracking                                  |
| Offline activation      | —             | —               | machine-bound, main-process verification                                  |
| Desktop packaging       | —             | —               | Linux / macOS / Windows                                                   |
| CI                      | typecheck     | + unit tests    | + docs build, benches, desktop matrix, releases                           |

## Subsystem ownership matrix

| Subsystem             | Primary owner (role) | Key files                                               |
| --------------------- | -------------------- | ------------------------------------------------------- |
| FSM / drawing         | Core engineer        | `src/core/fsm/editorMachine.ts`                         |
| Anti-corruption layer | Core engineer        | `src/lib/entityOps.ts`                                  |
| Cold/Hot rendering    | Rendering engineer   | `src/hooks/useColdLayer.ts`, `src/hooks/useHotLayer.ts` |
| Spatial worker        | Rendering engineer   | `src/core/workers/spatial.worker.ts`                    |
| Inspector & forms     | UI engineer          | `src/components/panels/Inspector*`                      |
| License               | Platform engineer    | `electron/license/*`, `tools/license-gen/*`             |
| CI / release          | Platform engineer    | `.github/workflows/ci.yml`                              |
| Docs (this page)      | Docs maintainer      | `docs/**`                                               |

## Roadmap (informational, no commitment)

::: tip Direction-only
This section shares directional intent. It is not a release commitment. Once
an item ships it moves into the matching version section above.
:::

| Topic                       | Description                                                                                                                                                                        | Related chapter                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Multi-language i18n         | `enumLabels.ts` already exposes the i18n hook; introducing i18next only replaces the dictionary.                                                                                   | [Enum Mappings](/en/reference/enum-mappings)                  |
| Light theme                 | 1.0 ships dark-only. Light theme will override `ams-*` tokens under `[data-theme="light"]`.                                                                                        | [Color Palette](/en/reference/color-palette)                  |
| Worker protocol v3          | Plans to use `SharedArrayBuffer` to remove postMessage clone overhead.                                                                                                             | [Worker protocol](/en/architecture/worker-protocol)           |
| Cross-platform native menus | The Electron main process now installs native menus and routes them through native menu callback wiring into renderer actions; later work can expand OS-menu interaction coverage. | [Electron integration](/en/architecture/electron-integration) |

## Versioning policy in detail

| Bump          | Meaning                                                                     | Compatibility             |
| ------------- | --------------------------------------------------------------------------- | ------------------------- |
| MAJOR (X.0.0) | proto wire-format incompatibility, CLI entry-point changes, data migrations | Migration guide required  |
| MINOR (1.X.0) | New features, new inspector fields, new worker messages                     | Backward compatible       |
| PATCH (1.0.X) | Bug fixes, doc corrections, behaviour-preserving refactors                  | Fully backward compatible |

## Release checklist

Each release walks through this list:

1. ✅ `pnpm typecheck` / `pnpm lint` / `pnpm format:check` all green.
2. ✅ `pnpm test` passes.
3. ✅ `pnpm bench && node scripts/check-bench-budget.mjs` PASS for every bench.
4. ✅ `pnpm build:web` and `pnpm package:linux | mac | win` each succeed.
5. ✅ Repository-level `CHANGELOG.md` has the new version header committed.
6. ✅ Tag is signed (`git tag -s vX.Y.Z`).
7. ✅ Push triggers all three CI jobs (check / desktop-package / github-release) green.

## Compatibility matrix

| Item         | 1.0.0                                                        |
| ------------ | ------------------------------------------------------------ |
| Node.js      | ≥ 22.22.1                                                    |
| pnpm         | 11.5.2                                                       |
| Browser      | Chrome 120+, Firefox 120+, Safari 17+ (Chromium recommended) |
| Electron     | 41                                                           |
| Apollo proto | proto2 syntax aligned with Apollo 9.0 fields                 |
| MapLibre GL  | 5.x                                                          |
| Dockview     | 5.x                                                          |
| TypeScript   | 6.x                                                          |
| Vite         | 8.x                                                          |
| React        | 19.x                                                         |
| XState       | 5.x                                                          |
| Zustand      | with zundo middleware                                        |

## Deprecations and removals

> 1.0.0 does not deprecate any API. Every breaking change during the 0.x
> series is captured in the version sections above; 1.0.0 is the new
> baseline. Future deprecations require one MINOR-version warning before
> removal in the next MAJOR version.

| Planned deprecation                    | Status                     | Replacement                                                             |
| -------------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| `// @ts-nocheck` on `editorMachine.ts` | Planned removal during 1.x | Migrate to `setup({}).createMachine(...)` once XState publishes the fix |

## Security

- The ed25519 keypair for offline activation lives at
  `electron/license/public-key.cts`. It is **not** a project secret; the
  private key is held independently by the publisher.
- `tools/license-gen/gen-keys.mjs --rotate` is one-shot and destructive —
  rotating invalidates every previously issued activation code immediately.
- Renderer-side license state is for UI hints only. Bypassing the renderer
  does not bypass the Electron main-process verification.

## Maintenance conventions

- **Append-only**: 1.0.0 and later sections are immutable in place. Use new
  PATCH releases to correct historical issues.
- **No fabrication**: only versions that resolve via
  `git log --tags --simplify-by-decoration` may appear here.
- **Cross-link PRs / Issues**: link the matching GitHub PR or Issue inline
  whenever it adds context for future readers.
- **Reviews**: every edit to this page requires at least one maintainer
  approval.
