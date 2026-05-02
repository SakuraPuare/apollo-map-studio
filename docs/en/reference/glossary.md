---
title: Glossary
description: Authoritative reference for Apollo Map Studio terminology — project-specific terms, Apollo HD map concepts, and tech-stack vocabulary. 80+ entries.
---

# Glossary

This glossary is the authoritative vocabulary for Apollo Map Studio. It serves
three audiences:

- New engineers who need a vocabulary baseline before reading architecture pages.
- Protocol engineers who need precise field, message, and unit definitions.
- UI/design engineers who want to align on visual and interaction terminology.

::: tip Indexing rules

- Alphabetised by English spelling.
- Acronyms expanded inline (for example RBush(R-Tree based Bulk Spatial index)).
- **Bold** identifiers refer to real symbols or paths in the codebase.
  :::

## A

### **action registry**

`src/core/actions/registry.ts`. The single source of truth for every
user-facing action — menu items, keyboard shortcuts, command palette entries,
and tool buttons. Each `ActionDef` declares id, label, shortcut, icon,
category, menu, menuOrder, inCommandPalette, drawTool, etc. Adding a feature
usually only touches this file.

### **active state**

The current FSM state node — for example `idle`, `drawPolyline`, `selected`,
`editingPoint`. `editorMachine.ts` is the source of truth; the UI mirrors it
with highlighted tools, cursor swaps, and hot-layer rendering.

### **anchor**

Control point captured while drawing a Bezier / arc / Catmull-Rom curve.
Persisted on `LaneEntity._source.anchors` as `BezierAnchorData[]`, allowing
the editor to re-enter handle editing after re-selection.

### **Anti-corruption Layer**

`src/lib/entityOps.ts`. Encapsulates every operation that touches Apollo proto
internals so upper layers see only proto-agnostic `MapEntity` helpers. A proto
v2 upgrade only changes entityOps; UI code is untouched. See
[Anti-Corruption Layer](/en/architecture/anti-corruption-layer).

### **AppImage / dmg / deb / exe**

Electron desktop bundle formats for Linux / macOS / Debian-derived Linux /
Windows. Produced by the `desktop-package` matrix job. See
[CI Pipeline](/en/reference/ci-pipeline).

### **Apollo HD Map**

The high-definition map protocol from Baidu's Apollo project. This editor
reads and writes Apollo proto2 binaries (`.bin`) directly — no intermediate
formats.

### **Apollo Map Studio**

The project. A Web + Electron Apollo HD Map editor.

## B

### **base_map**

The base form of an Apollo HD map containing every lane, signal, junction,
and overlap. Usually named `base_map.bin`. Sim Map and Routing Map are
derived from it.

### **bench-budgets**

`scripts/bench-budgets.json`. The CI perf-regression guard table mapping
bench name → p99 ceiling in milliseconds. See
[Benchmark Budgets](/en/reference/benchmark-budgets).

### **Bezier**

Cubic Bezier curve drawing tool. FSM state `drawBezier`. Anchor data is
persisted on `_source.anchors`.

### **bezier anchor**

A Bezier control point — start / handle / end as `GeoPoint`s. Type defined
in `src/types/entities.ts` as `BezierAnchorData`.

### **boundary type**

Lane boundary type, mirroring `LaneBoundaryType.Type` enum: `UNKNOWN /
DOTTED_YELLOW / DOTTED_WHITE / SOLID_YELLOW / SOLID_WHITE / DOUBLE_YELLOW /
CURB`. See [Enum Mappings](/en/reference/enum-mappings).

### **buildFeatureCollection**

Cold-layer compilation entry point in `src/core/workers/spatial.worker.ts`.
Converts `Map<id, MapEntity>` to a GeoJSON FeatureCollection consumable by
maplibre.

## C

### **Catmull-Rom**

A smooth interpolating spline. FSM state `drawCatmullRom` is used to draw
a curve that passes through every control point.

### **clearArea**

Apollo element representing a no-stop zone. Proto in
`map_msgs/map_clear_area.proto`; type `ClearAreaEntity`.

### **Cold Layer**

The "committed, large, infrequently changing" half of the rendering pipeline.
`useColdLayer` coalesces updates per RAF, sends them to `spatial.worker.ts`
for compilation, and feeds the result into a single GeoJSONSource. See
[Cold/hot layers](/en/architecture/cold-hot-layers).

### **CommandPalette**

Globally invokable command finder (Ctrl/Cmd+K). Pulls actions from
`getCommandPaletteActions()` and dispatches by id.

### **CONFIRM / DOUBLE_CLICK**

FSM events that terminate the current draw state and write into `mapStore`.
`useDrawCommit` calls `addEntity` when the FSM transitions back to `idle`.

### **CRS (Coordinate Reference System)**

Coordinate reference system. The editor uses `proj4` to transform between
WGS84, UTM, and custom local frames against `MapProjection.proj`.

### **Curve**

Apollo geometric primitive made of one or more `CurveSegment`s. Proto in
`map_msgs/map_geometry.proto`; TS type `Curve` in `src/types/apollo.ts`.

### **CurveSegment**

One segment of a curve. The current implementation supports the
`lineSegment` oneof only; `arc`, `spiral`, etc. are reserved.

## D

### **Decoration**

Auxiliary features produced by `decorateBoundary` after stitching and
rounding lane boundaries. Dominates `buildFeatureCollection` cost
(~3ms per lane in a naïve full rebuild). Phase E introduced
`decorationCache` to incrementalise it.

### **decorationCache**

`Map<lane_id, Feature[]>` inside `spatial.worker.ts`. The INCREMENTAL
message only invalidates the affected set.

### **Dockview**

The dockable multi-pane layout library used here (Dockview 5). Powers the
Photoshop-style workspace.

### **DOM event router**

`src/hooks/useMapEventRouter.ts`. Routes maplibre canvas mouse/keyboard
events into the FSM and de-duplicates dblclick (`isDuplicateInput`).

### **drawTool**

The `ActionDef.drawTool` field that links an action to a drawing tool such
as `polyline`, `bezier`, or `arc`.

## E

### **editorMachine**

The FSM root in `src/core/fsm/editorMachine.ts`, written for XState 5.
Currently bears `// @ts-nocheck` while waiting for upstream generic
inference fixes.

### **EditorMeta**

proto2 custom field number 1000 used to attach editor-only metadata such as
`geometry_kind`. Proto definition in `editor/editor_meta.proto`.

### **Electron**

The desktop runtime. Uses Electron 41. The main process owns license
checks, native filesystem I/O, and OS menus; the renderer hosts the web
editor.

### **entityOps**

Synonym for the Anti-corruption Layer above.

### **enumLabels**

`src/lib/enumLabels.ts`. The future-i18n hook that maps every proto enum
value to a human-readable label. The single funnel for UI labels. See
[Enum Mappings](/en/reference/enum-mappings).

## F

### **FSM (Finite State Machine)**

The editor state controller, written with XState 5. All mouse and keyboard
events route into the FSM; the FSM decides what happens next (drawing,
selecting, point editing). See [FSM design](/en/architecture/fsm-design).

### **featureCache**

`Map<entity_id, Feature[]>` in `spatial.worker.ts`. Caches compiled features
per entity, finer-grained than `decorationCache`.

## G

### **GeoJSON**

The intermediate geometry format used here. MapLibre consumes GeoJSON
directly; the cold-layer worker outputs a single FeatureCollection.

### **GeoJSONSource**

A maplibre source type. The cold and hot layers each own one.

### **geo distance**

`spatial.worker.ts` uses Mercator-corrected geographic distance during
`HIT_TEST` to avoid latitude-dependent length distortion.

### **getEnumLabel**

`src/lib/enumLabels.ts:173`. The single function the UI uses to resolve a
human-readable label from `(category, value)`.

### **getMenuActions**

A query helper exposed by the action registry. Filters actions by `menu`
and feeds the menu bar.

## H

### **Hot Layer**

The "in-flight, recomputed-every-frame" half of the rendering pipeline.
Managed by `useHotLayer`; does **not** go through the worker. See
[Cold/hot layers](/en/architecture/cold-hot-layers).

### **HD Map**

High-Definition Map. Apollo's protocol is one implementation.

### **husky**

Git-hooks tool. Locally drives `lint-staged` (eslint --fix + prettier
--write) on pre-commit.

## I

### **Icon registry**

`src/components/ui/icon-registry.ts`. Resolves an `ActionDef.icon` string
to a React component, avoiding scattered icon imports.

### **idle (FSM)**

The default FSM state. Awaiting user intent.

### **immer**

Immutable update library. The `updateEntity` flow uses immer drafts under
the hood; new references make zundo snapshots automatic.

### **import.proto**

Collective term for everything in `src/proto/`. The project loads them at
runtime via protobufjs rather than precompiling them to TypeScript.

### **INCREMENTAL (worker message)**

The incremental update message in the worker protocol. Re-decorates only
affected lanes.

### **isDuplicateInput**

A helper inside `useMapEventRouter` that swallows the `click` that would
fire alongside a `dblclick`.

## J

### **JetBrains Mono**

The project's mono-spaced typeface. See
[Design Tokens](/en/reference/design-tokens).

### **Junction**

Apollo element representing a multi-lane crossing. Proto in
`map_msgs/map_junction.proto`; type `JunctionEntity`.

### **Junction Graph**

`src/core/workers/laneJunctionGraph.ts`. Encodes lane endpoint
dependencies. INCREMENTAL uses `getDependents(id)` to compute the affected
set in O(K).

### **junction stitching**

`src/core/geometry/laneJunctions.ts`. Aligns lane endpoints entering or
leaving a junction so adjacent boundaries join cleanly. ~0.01ms per
junction; idempotent.

## K

### **keybinding**

`ActionDef.keybinding`. Strings such as `Mod+K`. `matchesKeybinding`
parses them and tests against `KeyboardEvent`.

## L

### **Lane**

Apollo's central element and the editor's main drawing object. Proto in
`map_msgs/map_lane.proto`; type `LaneEntity`. Holds central curve, left
and right boundaries, topology neighbors, width samples, and override
lists.

### **LaneBoundary**

Boundary object with `curve / length / virtual / boundaryType[]` fields.

### **LaneSampleAssociation**

A `{ s, width }` pair describing local lane width at arc length `s`.

### **license-gen**

`tools/license-gen/`. The offline activation-code generator. Emits an
ed25519 keypair and signs machine-bound activation payloads.

### **lint-staged**

Companion to husky. Lints only files in the staged index.

## M

### **MapEntity**

The editor's thin wrapper over `ApolloEntity`. Adds `_source` and
`_userOverrides`. All writes go through `entityOps`.

### **MapLibre GL (5)**

The map rendering substrate. Pure WebGL, with all business logic peeled
off.

### **MapProjection**

TS shape of Apollo's `Projection` message. Holds only the `proj` string;
proj4 consumes it.

### **map.proto**

The schema file `src/proto/map_msgs/map.proto` defining Apollo's top-level
`Map` message.

### **menubar**

`src/components/layout/MenuBar`. The Photoshop-style top menu, populated
from the action registry.

### **MGRS (Military Grid Reference System)**

A grid string encoding on top of UTM. The status bar can display it.

### **Mod key**

Cross-platform shortcut modifier — ⌘ on macOS, Ctrl elsewhere. Resolved
automatically by `matchesKeybinding`.

## N

### **nanoid**

ID generator powering stable IDs like `lane_V1StGp4kQz3R`.

### **neighbor lane**

Lane topology references: `leftNeighborForwardIds`,
`rightNeighborForwardIds`, `leftNeighborReverseIds`,
`rightNeighborReverseIds`.

## O

### **Overlap**

Apollo element describing the relationship between any two map objects
(lanes, signals, junctions, crosswalks, etc.). Proto in
`map_msgs/map_overlap.proto`; type `OverlapEntity`.

### **overlap derivation**

Implemented in `recomputeOverlapsAsync`. The worker derives overlaps from
a snapshot; the main thread applies a patch.

## P

### **PointENU**

Apollo's geometric base point. East / North / Up axes in metres. The
editor uses `GeoPoint` as a WGS84 lat/lng alias.

### **predecessor / successor / neighbor**

The three lane topology reference categories: incoming, outgoing, and
laterally adjacent.

### **proj4**

The PROJ.4 string parser handling `MapProjection.proj` such as
`+proj=tmerc ...`.

### **protobufjs**

The runtime proto library. Loads `.proto` files as text — no precompiled
artefacts.

### **proto2 optional**

In proto2, an `optional` absent value is **not** written to the wire. The
editor strictly distinguishes `undefined` from `0` to avoid round-trip
inflation.

## R

### **RAF (requestAnimationFrame)**

Browser render cadence. `useColdLayer` coalesces multiple entity changes
into the next RAF before calling setData.

### **RBush**

A 2-D R-Tree spatial index. `spatial.worker.ts` uses it for
sub-millisecond hit tests.

### **Reconcile**

Re-normalising overlaps, lane neighbor lists, and similar derived state
after import or large edits.

### **RoadBoundary**

The polygonal boundary of a Road element, with an outer polygon and any
holes.

### **Routing Map**

A derived map for Apollo's routing scenario. Focuses on lane topology and
routing constraints.

### **RSU (Road Side Unit)**

Roadside infrastructure. Apollo uses an `RSU` message holding ID,
junction reference, and overlaps.

## S

### **schema-only fields**

Fields present in proto but not declared in TS. protobufjs preserves their
unknown bytes during round-trip — `editor_meta` uses this exact mechanism.

### **Sim Map**

A derived map for Apollo's simulator. A subset of fields aligned with the
Cyber simulator.

### **shadcn/ui**

The component library used here. Copy-paste components built on Radix UI
and Tailwind 4. See [Design Tokens](/en/reference/design-tokens).

### **Signal**

Apollo traffic light element. Proto in `map_msgs/map_signal.proto`.

### **SourceDrawInfo**

The type of `LaneEntity._source` and friends. Stores the originating draw
tool and anchors so re-selection can restore handle editing.

### **spatial worker**

`src/core/workers/spatial.worker.ts`. Cold-layer compilation, RBush
maintenance, and hit testing all happen here.

### **status bar**

The bottom workspace bar. Displays cursor lng/lat, grid/snap toggles, and
current zoom.

### **Syne**

The brand display typeface used for headings. See
[Design Tokens](/en/reference/design-tokens).

## T

### **temporal store**

The auxiliary store zundo injects beside Zustand. Carries `undo`, `redo`,
and `clear`.

### **type discriminator**

The `entityType` field on the `ApolloEntity` union, used for narrowing.

## U

### **undo CANCEL closure**

`useActionDispatcher.ts:76-82`. Sends a `CANCEL` to the FSM **before**
calling `temporal.undo()`, so a mid-draw Ctrl+Z does not desynchronise FSM
and `mapStore.entities`. The R1 closure.

### **UTM (Universal Transverse Mercator)**

The default Apollo projection. The editor relies on local UTM zones.

### **uiStore**

A Zustand store carrying grid/snap toggles, cursorLngLat, layerStates, and
currentZoom. **Not** part of the undo history.

## V

### **VitePress**

The documentation engine — VitePress 1.x.

### **VITEPRESS_BASE**

Environment variable injected by `docs-preview.yml` for GitHub Pages
sub-path deployment, formatted as `/<repo-name>/`.

## W

### **WGS84**

World Geodetic System 1984. The editor's default reference frame; PROJ.4
transforms between WGS84 and UTM.

### **Web Worker**

Browser background thread. `spatial.worker.ts` and `apollo.worker.ts` run
inside workers.

### **worker bridge**

A main-thread proxy class encapsulating the postMessage protocol,
Promise-shaped responses, and lifecycle. See
[Worker protocol](/en/architecture/worker-protocol).

## X

### **XState 5**

The FSM library. The `editorMachine.ts` file is annotated `// @ts-nocheck`
pending an upstream generic inference fix.

## Y

### **YieldSign**

Apollo yield-sign element. Proto in `map_msgs/map_yield_sign.proto`.

## Z

### **Zustand**

The state-management library. Combines with `immer` for immutable updates
and with `zundo` for undo/redo.

### **zundo**

Zustand undo middleware. The editor uses `partialize: { entities }` so
only entity tables enter the history; UX preferences do not.

### **zod**

Schema-validation library. Inspector forms validate input through zod
schemas.

## Cross-chapter links

- [Architecture overview](/en/architecture/overview)
- [Reference overview](/en/reference/)
- [Apollo Types](/en/reference/apollo-types)
- [Enum Mappings](/en/reference/enum-mappings)
- [Proto Schema](/en/reference/proto-schema)
- [Benchmark Budgets](/en/reference/benchmark-budgets)
- [CI Pipeline](/en/reference/ci-pipeline)
- [Color Palette](/en/reference/color-palette)
- [Design Tokens](/en/reference/design-tokens)
