# Tech Stack

Every direct dependency in `package.json` was picked deliberately — the
codebase has zero "leftover from the template" packages. This page documents
the load-bearing choices and what each one buys you.

## Runtime dependencies

### Application core

| Package                    | Version    | Why                                                                                                                                                                                                                                   |
| -------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react` / `react-dom`      | 19.2       | Concurrent rendering, automatic batching across boundaries (worker postMessage callbacks fan into single React commits), and the new `useSyncExternalStore` story that Zustand 5 leans on.                                            |
| `xstate` / `@xstate/react` | 5.30 / 6.1 | Editor FSM. XState 5's typed `setup({...}).createMachine(...)` pattern lets us declare context/events once and have actions/guards inferred. See [FSM Design](./fsm-design.md).                                                       |
| `zustand`                  | 5.0        | Tiny store with explicit selectors. Picked over Redux/RTK because we want store actions to live next to state, not in feature slices, and over Jotai because we needed a single canonical entity Map rather than a per-id atom graph. |
| `zundo`                    | 2.3        | Time-travel middleware for Zustand. We use it for the entity Map only — see `src/store/mapStore.ts:259-263` and the `partialize` boundary.                                                                                            |
| `immer`                    | 11.1       | Used by `zustand/middleware/immer` so mutator code can write `state.entities.set(id, e)` instead of cloning. `enableMapSet()` is called once in `mapStore.ts:27`.                                                                     |

### Map rendering

| Package            | Version | Why                                                                                                                                                                                                                               |
| ------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maplibre-gl`      | 5.22    | WebGL vector renderer. We use the `GeoJSONSource` API (not Mapbox Draw) because we own the geometry pipeline. Picked over Cesium for 2D performance and over OpenLayers for the cleaner expression DSL on layer paint properties. |
| `proj4`            | 2.20    | WGS84 ↔ local CRS conversion. The Apollo proto stores `PointENU` in UTM-style meters; the editor works in lon/lat. See [Coordinate System](./coordinate-system.md).                                                               |
| `rbush`            | 4.0     | R-tree spatial index in the worker. Bulk-loads in O(N) and answers bbox queries in O(log N + k). See [Spatial Index](./spatial-index.md).                                                                                         |
| `polygon-clipping` | 0.15    | Sutherland-Hodgman / Vatti polygon Boolean ops, used by `src/core/elements/overlap/polyClip.ts` to derive lane × crosswalk overlap regions.                                                                                       |

### Apollo proto layer

| Package      | Version | Why                                                                                                                                                                                                          |
| ------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `protobufjs` | 8.0     | Reflection-based proto2 codec. We need proto2 optional semantics (Apollo proto files are still proto2) and the pre-compiled static codec story doesn't preserve unknown fields, which we round-trip through. |
| `nanoid`     | 5.1     | Collision-resistant entity IDs. URL-safe alphabet, 21-char default → ~149 bits, well above the per-import collision threshold for any plausible map size.                                                    |

### UI primitives

| Package                                                | Version         | Why                                                                                                                                                                                         |
| ------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dockview` / `dockview-react`                          | 5.2             | The Photoshop-style splittable workspace shell. Persists layouts as JSON. See [Workspace Layout](./workspace-layout.md).                                                                    |
| `react-hook-form`                                      | 7.72            | Inspector forms. Picked over Formik for the uncontrolled-by-default model — re-renders are local to the active field, which matters when an entity has dozens of editable scalars.          |
| `@hookform/resolvers`                                  | 5.2             | Glue for `zod` validation; the inspector uses `zodResolver(schema)` once per entity type.                                                                                                   |
| `zod`                                                  | 4.3             | Runtime schema validation. Same schemas used in `src/lib/schemas.ts` are the source of truth for both inspector form types (`z.infer<>`) and runtime validation.                            |
| `react-arborist`                                       | 3.4             | Virtualised tree view used by the layer panel. Handles 100k+ nodes without DOM thrash.                                                                                                      |
| `cmdk`                                                 | 1.1             | Command palette UI primitive (Cmd-K). Plays well with our [Action Registry](./action-registry.md).                                                                                          |
| `@radix-ui/react-*`                                    | various         | Headless menu/dialog/dropdown/tooltip primitives. Replaced an earlier shadcn/ui-only stack so we keep the same accessibility behaviour without pulling in component opinions we don't need. |
| `react-icons`                                          | 5.6             | Icon set (FA6 family used through the action registry). Tree-shaken per import — we never include the whole sprite.                                                                         |
| `class-variance-authority` / `clsx` / `tailwind-merge` | 0.7 / 2.1 / 3.5 | Tailwind class composition helpers. CVA encodes button variants; `tailwind-merge` resolves conflicts when callers append classes.                                                           |

## Build tooling

| Package                | Version | Why                                                                                                                                                                                                                                    |
| ---------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite`                 | 8.0     | Dev server + production bundler. Manual `manualChunks` config in `vite.config.ts:6-67` splits vendors into stable chunks (`vendor-map`, `vendor-state`, `vendor-dockview`, …) so a code change doesn't bust the maplibre vendor chunk. |
| `@vitejs/plugin-react` | 6.0     | React Fast Refresh + JSX transform.                                                                                                                                                                                                    |
| `@tailwindcss/vite`    | 4.2     | Tailwind 4's official Vite integration. Replaces the Tailwind 3 PostCSS pipeline; reads tokens directly from `@theme` blocks in `src/index.css`.                                                                                       |
| `tailwindcss`          | 4.2     | Utility-first CSS engine. We use it as a JIT compiler that consumes `ams-*` CSS custom properties — see [Design Tokens](./design-tokens.md).                                                                                           |
| `electron`             | 41.5    | Desktop shell. Pinned to a recent stable that supports Node 20 in the main process.                                                                                                                                                    |
| `electron-builder`     | 26.8    | Cross-platform packager. Configuration in `electron-builder.yml` produces `.AppImage`/`.deb`/`.dmg`/`.zip`/`.exe` artifacts.                                                                                                           |

## Test and quality tooling

| Package               | Version    | Why                                                                                                                                                                                                                       |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest`              | 4.1        | Test runner. Same Vite transform pipeline as the app, so `import.meta.glob` and `?raw` proto imports work identically in tests.                                                                                           |
| `vitest bench`        | (built in) | Microbenchmarks. Each `*.bench.ts` file declares budgeted runtimes; CI compares the JSON output against `scripts/bench-budgets.json` via `scripts/check-bench-budget.mjs`. See [Testing Strategy](./testing-strategy.md). |
| `@vitest/coverage-v8` | 4.1        | V8-native coverage.                                                                                                                                                                                                       |
| `eslint`              | 9.39       | Flat config in `eslint.config.js`. Plugins: `@typescript-eslint`, `react-hooks`, `react-refresh`.                                                                                                                         |
| `prettier`            | 3.8        | Formatter. Pre-commit via `lint-staged`.                                                                                                                                                                                  |
| `husky`               | 9.1        | Git hook runner. `prepare` script wires it on `pnpm install`.                                                                                                                                                             |

::: tip Why no Jest, Playwright, or Cypress?

- **Jest**: tooling overhead. Vitest already runs in the same Vite transform that the app uses; adding Jest would mean a second transform pipeline plus a second config matrix.
- **Playwright/Cypress**: there is currently no E2E suite. The interactive surface is mostly geometric and is exercised through unit tests against pure-function geometry primitives. An E2E pass over the Dockview shell is on the roadmap but explicitly out-of-scope for v1.
  :::

## Bench budget integration

`vitest bench --outputJson bench-results.json` produces a tree of
`{ name, p99, mean, ... }` leaves. `scripts/check-bench-budget.mjs:46-56`
walks that tree generically and compares each named bench to the ceiling in
`scripts/bench-budgets.json`. The CI step lives at
`.github/workflows/ci.yml:56-60`.

Current ceilings (from `scripts/bench-budgets.json`):

| Bench                                           | p99 ceiling |
| ----------------------------------------------- | ----------- |
| 10-point polyline, 3.5m offset                  | 1 ms        |
| 100-point polyline, 3.5m offset                 | 3 ms        |
| 1000-point polyline, 3.5m offset                | 40 ms       |
| full stitch — 10-lane linear chain              | 3 ms        |
| full stitch — 100-lane linear chain             | 6 ms        |
| full stitch — 100 lanes / 50 isolated junctions | 6 ms        |
| incremental — 100-lane chain, 1 lane decorated  | 5 ms        |
| incremental — 100-lane chain, 3 lanes decorated | 5 ms        |

The ceilings are deliberately ~1.5× higher than local-dev means to absorb
GitHub Actions runner jitter. Tightening them after N green runs is on the
backlog.

## Versions to watch

::: info Library upgrade gates
| Library | Why we may not upgrade casually |
| --- | --- |
| `xstate` | The editor machine has `// @ts-nocheck` historically, now removed by the `setup({})` pattern. Major version bumps need a careful re-typing pass. See [FSM Design](./fsm-design.md). |
| `maplibre-gl` | Major versions occasionally rename layer/source APIs (`updateData` was added in 5.x). Our [Cold/Hot Layers](./cold-hot-layers.md) pipeline depends on the diff API. |
| `protobufjs` | The reflection codec is the only path that round-trips unknown proto fields. Replacing it with a static codec would break Apollo round-trip fidelity. |
| `electron` | Updates need a full pass through `electron/license/*.cts` for Node-API and `crypto` deprecations. |
:::

See [Build And Bundle](./build-and-bundle.md) for the bundler config in detail.
