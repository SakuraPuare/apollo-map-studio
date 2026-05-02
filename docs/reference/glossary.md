# Glossary

Domain terms used throughout Apollo Map Studio, alphabetised. Each entry
is a single tight paragraph followed by `See also` cross-links.

---

### ACL — Anti-Corruption Layer

The architectural rule that proto-aware operations must flow through
`src/lib/entityOps.ts`, never directly from UI files into
`@/core/geometry/apolloCompile`. Without the ACL a proto v2 upgrade
would cascade through every component that touched `ApolloEntity`. The
audit script `git grep "from '@/core/geometry/apolloCompile'" --
'src/components/**' 'src/hooks/**'` enforces it before each refactor;
a non-empty result indicates a leak.
_See also:_ [`entityOps`](/api/lib/entity-ops),
[Apollo Types](/reference/apollo-types),
[Architecture overview](/architecture/overview).

### ams token

Semantic design token prefixed `ams-` (Apollo Map Studio) and emitted
from the `@theme` block in `src/index.css`. Tailwind 4 surfaces every
`--color-ams-{semantic}` declaration as utility classes (`bg-ams-*`,
`text-ams-*`, `border-ams-*`). Tokens are named by intent (`bg-base`,
`text-muted`) rather than hue (`zinc-700`) so palette swaps don't
ripple through component code.
_See also:_ [Design Tokens](/reference/design-tokens),
[Color Palette](/reference/color-palette).

### Anchor

A control point on a Bezier curve carrying a primary point and optional
`handleIn` / `handleOut` companions. Stored on `LaneEntity._source`
when the lane was drawn with the Bezier tool so the original handles
are preserved for later edits — the Apollo proto only stores sampled
points, not the control structure.
_See also:_ [Drawing system](/architecture/overview),
[`SourceDrawInfo`](/reference/apollo-types#editor-only-extension-fields),
edit point.

### Apollo

The open-source autonomous-driving platform whose HD map proto
definitions Apollo Map Studio reads, edits, and re-emits. The proto
files live under `src/proto/` and are bundled into the Vite build via
`src/io/proto/loader.ts`. References to "Apollo" in the editor mean the
Apache 2.0 Apollo project at <https://github.com/ApolloAuto/apollo>.
_See also:_ [Proto Schema](/reference/proto-schema), base_map.

### base_map

The primary Apollo HD map artefact — a binary or text protobuf encoding
of `apollo.hdmap.Map`. The editor's import path consumes `.bin`, `.txt`,
and `.pb.txt` variants, and the export path emits binary or text protos
that round-trip through Apollo runtime tooling. Distinct from
[sim_map](#sim-map) and [routing_map](#routing-map) which are derived
artefacts.
_See also:_ [Proto Schema](/reference/proto-schema),
sim_map, routing_map.

### bench budget

A hardcoded `p99` ceiling in `scripts/bench-budgets.json` for a named
benchmark. CI runs `pnpm bench --outputJson` then
`scripts/check-bench-budget.mjs`, which compares each bench's measured
`p99` against its ceiling and exits non-zero on violations. Ceilings
are intentionally generous (~1.5× over local mean) to absorb GitHub
Actions runner jitter.
_See also:_ [Benchmark Budgets](/reference/benchmark-budgets),
[CI Pipeline](/reference/ci-pipeline).

### CANCEL closure (R1)

The risk class flagged in the architecture audit: undo during an
in-flight draw must send `CANCEL` to the FSM **before** invoking
`temporal.undo()`. Without this, the FSM's `drawPoints` stays stale
while `mapStore.entities` rolls back, corrupting the next CONFIRM. The
fix lives in `src/hooks/useActionDispatcher.ts:76-82` and is regression-
tested by `src/hooks/__tests__/undoCancel.test.ts`.
_See also:_ [Architecture overview](/architecture/overview),
FSM, R1.

### Cold layer

The "committed entities" half of the editor's two-source MapLibre
rendering pipeline. Cold features are expensive to compile (lane
boundaries, junction stitching, decoration cache) so they live in a
worker-backed cache and only re-render on explicit invalidation. Source
id `'cold'`; layer ids `cold-fill`, `cold-line`, `cold-labels`, etc.
_See also:_ hot layer, decoration cache,
[Architecture overview](/architecture/overview),
[Color Palette](/reference/color-palette).

### Decoration cache

The per-lane cache `decorationCache: Map<lane_id, Feature[]>` inside
`spatial.worker.ts` that stores post-stitch boundary decoration features.
Boundary decoration is the dominant cost of `buildFeatureCollection`
(~3ms × N lanes for a naïve full rebuild); the cache converts this into
an O(K) re-decoration on INCREMENTAL updates where K is the affected
junction fan-out.
_See also:_ cold layer, junction graph, hot layer.

### Edit point

An interactive handle rendered on the map for a selected entity that
lets the user drag a vertex, Bezier handle, or rotation centre. Edit
points are computed by `getApolloEditPoints` (gated through
`entityOps`); their layout matches `SourceDrawInfo.anchors` /
`SourceRectInfo` so editing operates on the original drawing topology
rather than the sampled proto curve.
_See also:_ anchor, `DragPointType` in [editor types](/api/types/editor),
[`SourceRectInfo`](/reference/apollo-types#editor-only-extension-fields).

### FSM — Finite State Machine

The XState 5 machine in `src/core/fsm/editorMachine.ts` that owns
editor state. Drawing states (`drawPolyline`, `drawCatmullRom`,
`drawBezier`, `drawArc`, `drawRotatedRect`, `drawPolygon`) transition
to `idle` on `CONFIRM` or `DOUBLE_CLICK`; selection states are
`selected` and `editingPoint`. `useDrawCommit` reads the
post-transition snapshot so `removeLastPoint` (DOUBLE*CLICK guard)
propagates without an off-by-one.
\_See also:* CANCEL closure (R1), `editorMachine.ts`,
[Architecture overview](/architecture/overview).

### Hot layer

The "live drag preview" half of the editor's MapLibre rendering. Hot
features are recomputed every animation frame from the FSM's mid-draw
state, fed straight into `setData` without worker round-trip or
caching. Used for the in-flight drawing line, drag preview of a
selected vertex, and rotation handles.
_See also:_ cold layer, FSM, decoration cache.

### Junction

Apollo's at-grade road crossing entity. Carries a `polygon`, an
optional `type` (`UNKNOWN`/`IN_ROAD`/`CROSS_ROAD`/`FORK_ROAD`/`MAIN_SIDE`/
`DEAD_END`), and a list of `overlap_id`. Lanes that lie inside a
junction polygon get their `junction_id` auto-derived. PNC junctions
add ingress/egress passage groups on top.
_See also:_ [Proto Schema](/reference/proto-schema#junction-map_msgs-map_junction-proto),
[`JunctionEntity`](/reference/apollo-types#junction),
PNCJunction.

### Junction graph

`LaneJunctionGraph` in `src/core/workers/laneJunctionGraph.ts` — the
endpoint-dependency graph keyed by lane id. `getDependents(id)` returns
the set of lanes whose decorated boundary is affected by a change to
`id`, in O(K) where K is the typical junction fan-out (2–4). Drives the
incremental decoration affected-set during cold-layer updates.
_See also:_ decoration cache, cold layer.

### Lane

The Apollo entity representing a single line of vehicle travel. Carries
a central curve, left/right boundaries with type runs, width samples,
flat ID arrays for predecessors / successors / neighbours, optional
`junction_id`, and overlap IDs. Lane is the most-edited entity and
drives the bulk of derive / overlap / boundary geometry.
_See also:_ [`LaneEntity`](/reference/apollo-types#lane),
[Proto Schema](/reference/proto-schema#lane-family-map_msgs-map_lane-proto),
[Enum Mappings](/reference/enum-mappings#lane-lanetype),
lane corridor.

### Lane corridor

The polygonal strip swept out by a lane between its left and right
boundaries. Computed on demand from `centralCurve` + `leftSamples` /
`rightSamples`; used for lane↔polygon overlap detection (e.g.
crosswalk vs lane) and for click hit-testing the lane interior rather
than just the central line.
_See also:_ lane, overlap, `offsetPolylineDeg`.

### License grace period

The window after a desktop license expires during which the editor
still permits read-only operations. Implemented by the offline
activation system in `electron/license/` and surfaced through
`src/lib/license-bridge.ts`. Edit-class actions check the license
status via the action dispatcher's editable guard before dispatching.
_See also:_ machine ID, time guard,
[`useActionDispatcher`](/api/hooks).

### Machine ID

The locally-derived identifier that binds an offline activation license
to a specific machine. Generated by the Electron main process from
hardware fingerprints; verified during license issuance and on every
launch. Mismatches fail license validation, dropping the editor into
read-only mode.
_See also:_ license grace period, time guard, offline activation.

### Overlap

The Apollo join entity that records every pair of objects whose
geometry intersects on the map plane. A single `Overlap` carries
`object: ObjectOverlapInfo[]` (the intersecting objects with optional
per-pair info such as lane `start_s` / `end_s`) and
`region_overlap: RegionOverlapInfo[]` (curated polygons describing
the intersection region). Other entities reference overlaps via their
`overlap_id` arrays.
_See also:_ [`OverlapEntity`](/reference/apollo-types#overlap),
[Proto Schema](/reference/proto-schema#overlap-map_msgs-map_overlap-proto),
[overlap reconciliation](/api/geo-overlap-calc).

### Predecessor / Successor

The directional topology relationship between consecutive lanes. A
lane's `predecessor_id` array points at lanes that flow **into** it;
its `successor_id` array points at lanes that flow **out of** it.
These flat ID arrays are derived from endpoint coincidence on import
and re-derived after each edit unless the user has marked them as
overrides via `_userOverrides`.
_See also:_ lane, junction,
[Architecture overview](/architecture/overview).

### R1

Risk identifier from the 2026-04-11 architecture audit referring to
the undo CANCEL closure: undo during an in-flight draw used to corrupt
the FSM `drawPoints`. Closed by `useActionDispatcher.ts:76-82`. Listed
as the top risk pre-fix; remains in the audit register as a closed
item with the regression test
`src/hooks/__tests__/undoCancel.test.ts` guarding it.
_See also:_ CANCEL closure (R1), FSM,
[Architecture overview](/architecture/overview).

### R2

Risk identifier for the anti-corruption-layer audit: proto-aware
operations leaking out of `entityOps` into UI files. Closed by routing
all `apolloCompile.ts` / `getApolloEditPoints` access through
`src/lib/entityOps.ts` and policing it with a manual `git grep` audit.
A future static check (`import/no-cycle` + tier enforcement) is on the
P2 backlog.
_See also:_ ACL, [`entityOps`](/api/lib/entity-ops),
[Architecture overview](/architecture/overview).

### Road

The Apollo entity that aggregates one or more `RoadSection`s, each of
which lists `lane_id`s and an optional `RoadBoundary`. `Road.junction_id`
points at the containing junction (or `null`). The editor surfaces
roads primarily via the boundary edges; lane membership is derived
from the section list.
_See also:_ [`RoadEntity`](/reference/apollo-types#road),
junction, lane,
[Proto Schema](/reference/proto-schema#road-family-map_msgs-map_road-proto).

### routing_map

A derived Apollo artefact that encodes lane-level navigability for the
routing module. Apollo Map Studio's exporter has stubs for routing-graph
generation but the public API is not yet shipped — current builds emit
only `base_map`. Tracked as future work in the export engine docs.
_See also:_ base_map, sim_map,
[Export engine](/architecture/export-engine).

### sim_map

A derived Apollo artefact used by the simulator that downsamples the
base map's geometry for faster collision queries. Same status as
`routing_map`: stubs exist, public API not shipped, tracked as future
work.
_See also:_ base_map, routing_map.

### Time guard

The license-validation guard that detects clock rollback (the user
moving their system clock backwards to extend a license). Compares the
last-seen timestamp persisted by the Electron main process against
`Date.now()`; rollbacks trigger an immediate license invalidation.
_See also:_ license grace period, machine ID, offline activation.

## See also

- [Apollo Types](/reference/apollo-types) — TypeScript shapes for every
  Apollo entity referenced above.
- [Proto Schema](/reference/proto-schema) — Apollo proto field-level
  reference.
- [Enum Mappings](/reference/enum-mappings) — int↔name↔label tables.
- [Design Tokens](/reference/design-tokens) — `ams-*` token catalogue.
- [Architecture overview](/architecture/overview) — quality-gate and
  layering rules behind the audit terminology.
