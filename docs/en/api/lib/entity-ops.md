---
title: entityOps — Apollo proto anti-corruption layer
description: The single boundary between the UI and Apollo proto domain. Bundles edit, cascade-delete, reparent, and type-guard operations.
---

# `entityOps` — Apollo proto anti-corruption layer

> Source: `src/lib/entityOps.ts` (barrel) plus `src/lib/entityOps/{edit,typeGuards,cascadeDeleteRefs,reparent}.ts`

## Purpose

`entityOps` is the **only** public surface for proto-aware operations on map entities (see `ARCHITECTURE.md` "Anti-corruption layer (R2)"). Apollo proto types live in `src/types/apollo.ts`; the geometry compiler lives in `src/core/geometry/apolloCompile.ts`. Without this insulation a proto-v2 upgrade would cascade through every UI file that touches `ApolloEntity`.

UI code imports `@/lib/entityOps`, never `@/core/geometry/apolloCompile` directly.

Audit before each refactor:

```bash
git grep "from '@/core/geometry/apolloCompile'" -- 'src/components/**' 'src/hooks/**'
```

A non-empty result means a new leak — fix it before merging.

## Module layout

```
entityOps.ts                   ← public barrel; only re-exports
├── entityOps/edit.ts          ← getEditPoints/setEditPoint/createEntity/...
├── entityOps/typeGuards.ts    ← isApolloEntityType/isAreaEntity/...
├── entityOps/cascadeDeleteRefs.ts ← clean foreign keys on delete
└── entityOps/reparent.ts      ← lane/road/rsu reparenting
```

The barrel is 12 re-export lines; logic lives in the four sub-modules.

## Public API at a glance

### Edit (`entityOps/edit.ts`)

| Symbol             | Kind | Signature                                                            | Summary                                        |
| ------------------ | ---- | -------------------------------------------------------------------- | ---------------------------------------------- |
| `getEditPoints`    | fn   | `(entity: MapEntity) => GeoPoint[]`                                  | Draggable control points                       |
| `setEditPoint`     | fn   | `(entity, index, point) => MapEntity`                                | Edit one point + re-derive                     |
| `setAllEditPoints` | fn   | `(entity, points: GeoPoint[]) => MapEntity`                          | Replace all points + re-derive                 |
| `moveEntity`       | fn   | `(entity, dx, dy) => MapEntity`                                      | Translate entity                               |
| `deleteVertex`     | fn   | `(entity, index) => MapEntity \| null`                               | Remove a vertex; null = entity must be deleted |
| `compileEntity`    | fn   | `(entity) => GeoJSON.Feature[]`                                      | Cold-layer features                            |
| `createEntity`     | fn   | `(elementType, drawTool, points, anchors, options?) => ApolloEntity` | FSM CONFIRM hand-off                           |
| `entityCoords`     | fn   | `(entity) => LngLat[]`                                               | "Spine" coordinates for hitTest                |

### Type guards (`entityOps/typeGuards.ts`)

| Symbol                | Kind | Signature                             | Summary                                   |
| --------------------- | ---- | ------------------------------------- | ----------------------------------------- |
| `isDrawingEntity`     | fn   | `(entity) => entity is DrawingEntity` | Is a drawing primitive                    |
| `isApolloEntityType`  | fn   | `(entity) => entity is ApolloEntity`  | Is an Apollo entity                       |
| `isAreaEntity`        | fn   | `(entity) => boolean`                 | Counts as a region for hitTest            |
| `isPolygonEditEntity` | fn   | `(entity) => boolean`                 | editPoints form a closed ring (hot layer) |

### Cascade delete (`entityOps/cascadeDeleteRefs.ts`)

| Symbol                  | Kind | Signature                                          | Summary                                |
| ----------------------- | ---- | -------------------------------------------------- | -------------------------------------- |
| `cascadeDeleteRefsFull` | fn   | `(removedIds, allEntities) => CascadeDeleteResult` | Full result (changes + cascadeRemoved) |
| `CascadeDeleteResult`   | type | `{changes, cascadeRemoved}`                        | Patch + extra removals                 |

### Reparent (`entityOps/reparent.ts`)

| Symbol           | Kind      | Signature                                        | Summary                                   |
| ---------------- | --------- | ------------------------------------------------ | ----------------------------------------- |
| `ParentTarget`   | union     | see below                                        | `junction \| road \| roadSection \| none` |
| `ReparentResult` | interface | `{changes, rejected?}`                           | Patch + rejection reason                  |
| `reparent`       | fn        | `(child, target, allEntities) => ReparentResult` | Apply reparent                            |
| `canReparent`    | fn        | `(child, target, allEntities) => boolean`        | Dry-run for drag-over UI                  |

## Detailed entries

### `getEditPoints(entity)`

```ts
function getEditPoints(entity: MapEntity): GeoPoint[];
```

Per entity type:

- Drawing primitive (polyline / catmullRom / polygon) → `entity.points`
- bezier → `entity.anchors.map(a => a.point)`
- arc → `[start, mid, end]`
- rect → `[p1, p2]`
- Apollo entity → delegated to `getApolloEditPoints` (per-type branch)

Source: `entityOps/edit.ts:19-35`.

### `setEditPoint(entity, index, point)` / `setAllEditPoints`

Apollo entities only — drawing primitives go through the FSM in-flight buffer and never enter the store mid-draw.

Each edit calls `applyDerive(next, { cause: 'editGeometry', prev: entity })` to re-run derive rules (e.g. `lane.length`, `leftSamples` resampling) while honouring `_userOverrides`.

Source: `entityOps/edit.ts:37-51`.

### `moveEntity(entity, dx, dy)`

Translates every vertex by `(dx, dy)` (degrees of longitude/latitude) and re-derives. Caller maps screen-pixel drag to degrees.

### `deleteVertex(entity, index)`

Apollo only. Returns `null` when the entity collapses below its minimum point count (e.g. lane centre line < 2 points). The store treats null as a signal to remove the entity entirely.

### `compileEntity(entity)`

Compiles one entity to its cold-layer feature list — for a lane: centre line + boundaries + arrows + ID label. Drawing primitives return `[]` (the hot layer renders them directly).

### `createEntity(elementType, drawTool, points, anchors, options?)`

Called by `useDrawCommit` after a CONFIRM transition:

```ts
createEntity(elementType, drawTool, drawPoints, drawAnchors, { laneHalfWidth, entities });
```

The returned entity has already passed through `applyDerive(_, { cause: 'create' })`, so all derived fields are populated.

Source: `entityOps/edit.ts:76-85`.

### `entityCoords(entity)`

The entity's "spine" — lane → centerline coordinates; rect → the four corners; polygon → ring. Used by hitTest and tooltips.

### `cascadeDeleteRefsFull(removedIds, allEntities)`

When entities are deleted, two cleanups must happen:

1. Strip stale foreign keys on remaining entities (`predecessorIds`, `successorIds`, `overlapIds`, `junctionId`, `road.sections[].laneIds`, …).
2. Remove now-meaningless Overlap entities (where `objects.length < 2` after filtering).

```ts
interface CascadeDeleteResult {
  changes: Map<string, MapEntity>; // patches
  cascadeRemoved: Set<string>; // extra ids to delete (orphan overlaps)
}
```

Algorithm:

1. Iterate `allEntities`; for each, call `patchOne(e, removed, cascadeRemoved)`.
2. `patchOne` dispatches by `entityType` to `cleanupLane` / `cleanupRoad` / `cleanupPNCJunction` / `decideOverlap`.
3. If an Overlap survives with fewer than 2 objects, it is added to `cascadeRemoved`.
4. A second pass cleans `overlapIds` on remaining entities to remove now-orphan-overlap references.

Source: `entityOps/cascadeDeleteRefs.ts:135-154`.

### `reparent(child, target, allEntities)` / `ParentTarget`

```ts
type ParentTarget =
  | { kind: 'junction'; id: string }
  | { kind: 'road'; id: string }
  | { kind: 'roadSection'; roadId: string; sectionId: string }
  | { kind: 'none' };
```

Valid (child, target) pairs live in `HANDLERS`:

| child  | target        | handler                   |
| ------ | ------------- | ------------------------- |
| `lane` | `junction`    | `handleLaneToJunction`    |
| `lane` | `road`        | `handleLaneToRoad`        |
| `lane` | `roadSection` | `handleLaneToRoadSection` |
| `lane` | `none`        | `handleLaneToNone`        |
| `road` | `junction`    | `handleRoadToJunction`    |
| `road` | `none`        | `handleRoadToNone`        |
| `rsu`  | `junction`    | `handleRsuToJunction`     |
| `rsu`  | `none`        | `handleRsuToNone`         |

Invalid combinations return `{ changes: Map(), rejected: '...' }`.

Return shape:

```ts
interface ReparentResult {
  changes: Map<string, MapEntity>; // patches for child + old parent + new parent
  rejected?: string; // human-readable reason
}
```

#### Lane → Road (implicit RoadSection)

```ts
function handleLaneToRoad(child, target, allEntities): ReparentResult {
  const road = allEntities.get(target.id);
  if (road?.entityType !== 'road') return rejected('target is not a road');
  const sectionId = road.sections[0]?.id ?? `${road.id}_s0`;
  return reparent(child, { kind: 'roadSection', roadId: road.id, sectionId }, allEntities);
}
```

Drop a lane onto a road = drop onto its first section. If the road has no section, synthesise `${roadId}_s0`.

#### Lane → RoadSection (the busy path)

`handleLaneToRoadSection` does the most work:

1. If the lane was in a junction, clear `junctionId`.
2. Push lane id into the target section's `laneIds` (skip if already there).
3. Remove lane id from any _other_ section in the same road.
4. Remove lane id from sections of _other_ roads (cross-road move).
5. If the target sectionId is missing, append a fresh one.

Source: `entityOps/reparent.ts:82-130`.

### `canReparent(child, target, allEntities)`

Dry-runs `reparent` and returns `rejected === undefined`. Used by drag-over highlighting — zero side effects.

### Type guards

```ts
const DRAWING_TYPES = new Set(['polyline', 'catmullRom', 'bezier', 'arc', 'rect', 'polygon']);
```

- `isDrawingEntity` — `DRAWING_TYPES.has(entityType)`
- `isApolloEntityType` — its negation
- `isAreaEntity` — Apollo: delegates to `isApolloAreaEntity` (junction/parking/crosswalk/clearArea/area/…). Drawing: only `rect`/`polygon`
- `isPolygonEditEntity` — editPoints form a closed ring? **Not** identical to `isAreaEntity`: a `lane` _is_ an area (junction hitTest needs it) but its editPoints are a centre line (open polyline), so the hot layer must render the rubber-band as a LineString, not a Polygon

Source: `entityOps/typeGuards.ts:7-28`.

## Dependency graph

```
entityOps.ts (barrel)
├── entityOps/edit.ts
│   ├── core/geometry/apolloCompile  (proto-aware fn home)
│   ├── core/elements/derive         (derive rules)
│   └── core/geometry/interpolate    (LngLat type)
├── entityOps/typeGuards.ts
│   └── core/geometry/apolloCompile
├── entityOps/cascadeDeleteRefs.ts
│   └── types/apollo (types)
└── entityOps/reparent.ts
    └── types/apollo (types)
```

UI must import from `@/lib/entityOps`, never `core/geometry/apolloCompile`.

## Test coverage

`src/lib/__tests__/entityOps.test.ts` exercises:

- `cascadeDeleteRefsFull` — delete lane → other lanes' `predecessorIds` are stripped; delete junction → `lane.junctionId = null`; delete one of two overlap participants → cascadeRemoved
- `reparent` — lane→junction, lane→roadSection, cross-road moves
- `canReparent` dry runs
- `getEditPoints` / `setEditPoint` / `setAllEditPoints` per entity type
- `createEntity` for every drawTool

## Side effects

- **None.** All functions are pure: input `entity, allEntities`, output a new entity / a change map.
- Does not read or write the store.
- Derive runs through `applyDerive` (from `core/elements/derive`) and obeys `_userOverrides`.

## Source map (barrel)

| Lines | Content                           |
| ----- | --------------------------------- |
| 7–10  | Type re-exports                   |
| 12–15 | `cascadeDeleteRefsFull` re-export |
| 17–26 | Edit function re-exports          |
| 27–32 | Reparent re-exports               |
| 33–38 | typeGuards re-exports             |

## See also

- `core/geometry/apolloCompile` — actual proto-aware implementations (do **not** import directly)
- `core/elements/derive` — derive-rule engine
- [`entities` types](../types/entities.md) — `MapEntity` union
- [`apollo` types](../types/apollo.md) — proto types
- `mapStore` — actual mutator caller
- `ARCHITECTURE.md` "Anti-corruption layer (R2)" — design rationale
