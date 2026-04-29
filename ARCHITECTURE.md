# Architecture

> Single-page reference for how `apollo-map-studio` is wired together.
> Updated 2026-04-11 after Phase 9 (CI perf budget) + Phase E (incremental
> lane decoration).

## Layering

The codebase is layered. **Imports flow downward only**: an `outer` layer
may import from any `inner` layer below it, but not vice versa. The
review checklist below documents the rule; an `import/no-cycle` lint
rule and a tier-enforcement check live on the P2 backlog.

```
┌─────────────────────────────────────────────────────┐
│  components/   ← React UI: layout, panels, map      │
├─────────────────────────────────────────────────────┤
│  hooks/        ← React hooks: event routing, FSM    │
│                  glue, cold/hot layer scheduling    │
├─────────────────────────────────────────────────────┤
│  store/        ← Zustand stores (mapStore, uiStore, │
│                  settingsStore) + zundo undo middleware │
├─────────────────────────────────────────────────────┤
│  lib/          ← Pure-ish helpers: entityOps        │
│                  adapter, geoJsonHelpers, schemas   │
├─────────────────────────────────────────────────────┤
│  core/         ← Domain logic: FSM, geometry,       │
│                  workers, action registry           │
└─────────────────────────────────────────────────────┘
```

| Layer         | Allowed imports                            | Forbidden                                             |
| ------------- | ------------------------------------------ | ----------------------------------------------------- |
| `core/`       | other `core/` modules, `types/`, `config/` | anything in `lib/`, `store/`, `hooks/`, `components/` |
| `lib/`        | `core/`, `types/`, `config/`               | `store/`, `hooks/`, `components/`                     |
| `store/`      | `core/`, `lib/`, `types/`                  | `hooks/`, `components/`                               |
| `hooks/`      | `core/`, `lib/`, `store/`, `types/`        | `components/`                                         |
| `components/` | everything                                 | nothing (top of the stack)                            |

`types/` and `config/` are pure type/constant modules with no runtime
imports — they can be referenced from anywhere.

## Anti-corruption layer (R2)

The Apollo proto types live in `src/types/apollo.ts`. Without insulation,
a proto v2 upgrade would cascade through every UI file that touched
`ApolloEntity`. The fix is `src/lib/entityOps.ts`: a single module that
collects all proto-aware operations behind proto-agnostic `MapEntity`
helpers.

Anything that touches Apollo proto internals (`apolloCompile.ts`,
`getApolloEditPoints`, etc.) flows **only** through `entityOps`. UI code
imports from `@/lib/entityOps`, never directly from `@/core/geometry/apolloCompile`.

Audit before each refactor:

```
git grep "from '@/core/geometry/apolloCompile'" -- 'src/components/**' 'src/hooks/**'
```

A non-empty result means a new leak — fix it before merging.

## State management

### Stores (Zustand + zundo)

| Store           | Scope                                                     | Undoable                               |
| --------------- | --------------------------------------------------------- | -------------------------------------- |
| `mapStore`      | entities (Map<id, MapEntity>)                             | yes (zundo `partialize: { entities }`) |
| `uiStore`       | grid/snap toggles, cursorLngLat, layerStates, currentZoom | no — UX preferences, not history       |
| `settingsStore` | historyLimit, mapZoom, laneHalfWidth                      | no — user prefs                        |

**R1 closure** (`useActionDispatcher.ts:76-82`): the undo dispatcher
sends `CANCEL` to the FSM **before** invoking `temporal.undo()`. Without
this, mid-draw Ctrl+Z left FSM `drawPoints` stale while `mapStore.entities`
rolled back, corrupting the next CONFIRM. Regression test:
`src/hooks/__tests__/undoCancel.test.ts`.

### FSM (XState 5)

`src/core/fsm/editorMachine.ts` is the source of truth for editor state.
Currently `// @ts-nocheck` due to XState 5 generic inference bugs (fix
deferred until either upstream lands the fix or we migrate to the
typed `setup({}).createMachine(...)` pattern).

Drawing states: `drawPolyline`, `drawCatmullRom`, `drawBezier`, `drawArc`,
`drawRotatedRect`, `drawPolygon`. Each transitions to `idle` on
`CONFIRM` or `DOUBLE_CLICK`. Selection/edit states: `selected`, `editingPoint`.

`useDrawCommit` subscribes to FSM transitions and calls `mapStore.addEntity`
when a draw state exits to idle. **It reads the POST-transition snapshot**
so that `removeLastPoint` (DOUBLE_CLICK guard) propagates without an
off-by-one.

## Action Registry (R5)

`src/core/actions/registry.ts` is the single source of truth for all
user-executable actions. Each `ActionDef` declares:

- id (literal union, statically checked)
- label, shortcut, keybinding
- icon (string name resolved by `src/components/ui/icon-registry.ts`)
- category, menu, menuOrder
- inCommandPalette flag
- drawTool (for tool actions)

Consumers:

- `MenuBar` → `getMenuActions(menu)`
- `CommandPalette` → `getCommandPaletteActions()`
- `ToolStrip` → `getToolAction(drawTool)` + `ACTION_MAP.get(id)`
- Keyboard handler → `getKeyBindingActions()` + `matchesKeybinding`

Adding a new action requires touching only `registry.ts` (and optionally
`elements.ts` for draw tools that need a new element type).

## Cold layer pipeline

The map has two GeoJSON sources: **cold** (committed entities, expensive
to compile, rarely changes per-frame) and **hot** (live drag preview,
recomputed every frame).

### Cold layer flow

```
mapStore.entities  →  useColdLayer (RAF coalesced)
                          │
                          ↓
              SpatialWorkerBridge.send()  ← postMessage clone boundary
                          │
                          ↓
                  spatial.worker.ts
                  ├── featureCache       (raw compiled features per entity)
                  ├── decorationCache    (post-stitch boundary decoration per lane)
                  ├── junctionGraph      (LaneJunctionGraph: endpoint deps)
                  ├── tree (RBush)       (spatial index for hitTest)
                  │
                  ├── SYNC          → full rebuild
                  ├── INCREMENTAL   → affected-set re-decoration only
                  └── HIT_TEST      → RBush search + Mercator-aware geo distance
                          │
                          ↓
                  COLD_READY response   ← postMessage clone boundary
                          │
                          ↓
              maplibre GeoJSONSource.setData()
```

### Phase E incremental decoration (N1 partial)

Boundary decoration (`decorateBoundary` in `laneJunctions.ts`) is the
dominant cost of `buildFeatureCollection` (~3ms × N lanes for naïve full
rebuild). The Phase E optimization caches decoration features per lane
in `decorationCache: Map<lane_id, Feature[]>` and only re-decorates
the affected set on INCREMENTAL.

Affected set on INCREMENTAL = pre-update dependents ∪ changed lanes ∪
post-update dependents, computed via `LaneJunctionGraph.getDependents(id)`
in O(K) where K = junction fan-out (typically 2-4).

Junction stitching itself still runs over every junction every time —
it's cheap (~0.01ms per junction) and idempotent (non-affected lanes
get the same join values back). Only decoration is incremental.

### Hot layer flow

`useHotLayer` listens to FSM state for the in-flight drawing/edit and
calls `setData` directly with a small client-side feature collection.
No worker, no caching — it's recomputed every animation frame.

## Quality gates

CI runs on every PR + push to main/v1 (`.github/workflows/ci.yml`):

1. `pnpm typecheck` — `tsc --noEmit`
2. `pnpm lint` — ESLint 9 flat config (react-hooks, basic TS)
3. `pnpm format:check` — Prettier
4. `pnpm test` — Vitest unit tests
5. `pnpm bench --outputJson bench-results.json` — Vitest benchmarks
6. `node scripts/check-bench-budget.mjs bench-results.json` — perf
   regression guard against `scripts/bench-budgets.json`

Local: `husky` pre-commit hook runs `lint-staged` (eslint --fix +
prettier --write on changed files).

## Critical files (single-glance reference)

| Concern              | File                                                  |
| -------------------- | ----------------------------------------------------- |
| FSM source of truth  | `src/core/fsm/editorMachine.ts`                       |
| Action registry      | `src/core/actions/registry.ts`                        |
| Apollo proto adapter | `src/lib/entityOps.ts`                                |
| Undo CANCEL closure  | `src/hooks/useActionDispatcher.ts:76-82`              |
| Cold layer worker    | `src/core/workers/spatial.worker.ts`                  |
| Junction dep graph   | `src/core/workers/laneJunctionGraph.ts`               |
| Junction stitching   | `src/core/geometry/laneJunctions.ts`                  |
| Worker protocol      | `src/core/workers/protocol.ts`                        |
| dblclick dedup       | `src/hooks/useMapEventRouter.ts` (`isDuplicateInput`) |
| Icon registry        | `src/components/ui/icon-registry.ts`                  |
| Workspace layout     | `src/components/layout/WorkspaceLayout.tsx`           |
| Cold layer hook      | `src/hooks/useColdLayer.ts`                           |
| Hot layer hook       | `src/hooks/useHotLayer.ts`                            |
| Map event router     | `src/hooks/useMapEventRouter.ts`                      |
| Inspector forms      | `src/components/layout/panels/InspectorForms.tsx`     |
| ToolStrip            | `src/components/layout/ToolStrip.tsx`                 |
| Perf budget script   | `scripts/check-bench-budget.mjs`                      |
| CI workflow          | `.github/workflows/ci.yml`                            |

## Design tokens (ams-\*)

Visual styling routes through semantic Tailwind 4 tokens defined in
`src/index.css` under `@theme`. The PoC catalogue (11 tokens) covers
backgrounds, surfaces, borders, four text tiers, and the cyan accent.
Tokens are emitted as `--color-ams-{semantic}`, which Tailwind 4
automatically exposes as utility classes — `bg-ams-bg-base`,
`text-ams-text-primary`, `border-ams-border-subtle`, etc.

**Add a token**: append a `--color-ams-{semantic}: <value>;` line inside
the `@theme` block in `src/index.css`. Update the catalogue comment at
the top of that file with the new entry. Keep names _semantic_
(`surface-hover`, `text-muted`) rather than _hue-based_ (`zinc-700`,
`gray-400`) so future palette swaps don't ripple into component code.

**Use a token**: replace raw Tailwind colour classes with their `ams-*`
equivalent — `bg-zinc-950` → `bg-ams-bg-base`, `text-cyan-400` →
`text-ams-accent`. When in doubt, prefer the closest semantic match
(e.g. inactive icons → `text-ams-text-disabled`). Reach for a new token
only when an existing one cannot honestly describe the intent.

**Migration policy**: tokens are introduced incrementally. New
components SHOULD use `ams-*` classes from day one. Existing components
get migrated opportunistically (when otherwise touched) or via dedicated
PRs — `StatusBar` and `ActivityBar` are the reference migrations. Avoid
bulk grep-and-replace passes that touch hundreds of files in one go;
prefer one component family at a time so visual review stays tractable.

**Out of scope (future work)**: typography tokens (`font-heading`,
`font-mono` overrides), elevation/shadow tokens, motion tokens, and
the long-promised oklch palette swap. None of these are needed for the
current PoC; introduce them when a real component requires the
distinction.
