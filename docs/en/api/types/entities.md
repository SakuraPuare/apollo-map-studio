---
title: types/entities — MapEntity union and drawing primitives
description: GeoPoint / six drawing primitives / Apollo entity re-exports / the master MapEntity union — the single editor-side type entry point.
---

# `types/entities` — `MapEntity` union and drawing primitives

> Source: `src/types/entities.ts` · 126 lines

## Purpose

`types/entities` is the **only** entity-type entry point for editor code. It does three things:

1. Defines the six in-flight drawing primitives the FSM produces.
2. Re-exports every Apollo HD Map type from `types/apollo.ts`.
3. Unions both into the master `MapEntity` type.

`MapEntity` is the value type of `mapStore.entities` and the input of `entityOps`, `geoJsonHelpers`, `useHotLayer`, and every other "operates on entities" module.

## Public API

| Symbol                                                                                                | Kind                        | Summary                                           |
| ----------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------- |
| `GeoPoint`                                                                                            | interface                   | `{ x: lng, y: lat, z? }`                          |
| `BezierAnchorData`                                                                                    | interface                   | Persisted bezier anchor                           |
| `PolylineEntity` / `CatmullRomEntity` / `BezierEntity` / `ArcEntity` / `RectEntity` / `PolygonEntity` | interface                   | Six drawing primitives                            |
| `DrawingEntity`                                                                                       | union                       | Union of the six                                  |
| `MapEntity`                                                                                           | union                       | `DrawingEntity \| ApolloEntity`                   |
| `PointENU`                                                                                            | type alias **(deprecated)** | `GeoPoint` synonym                                |
| Apollo re-exports                                                                                     | type                        | All Apollo types from `./apollo` (see list below) |

## Detailed entries

### `interface GeoPoint`

```ts
export interface GeoPoint {
  x: number; // longitude
  y: number; // latitude
  z?: number;
}
```

**The editor uses WGS84 lng/lat throughout.** `x` is longitude (-180…180), `y` is latitude (-90…90). `z` is preserved when present but ignored by most UI code.

### `type PointENU` _(deprecated)_

```ts
/** @deprecated use GeoPoint */
export type PointENU = GeoPoint;
```

Historical alias — Apollo proto names it ENU even though the editor's runtime is lng/lat. New code uses `GeoPoint`.

### `interface BezierAnchorData`

```ts
export interface BezierAnchorData {
  point: PointENU;
  handleIn: PointENU | null;
  handleOut: PointENU | null;
}
```

Persisted bezier anchor — `null` denotes an anchor with no incoming / outgoing handle (corner / endpoint). Runtime form (`BezierAnchor`) lives in `core/geometry/interpolate`; conversions live in `core/geometry/anchorConvert`.

### Six drawing primitives

```ts
export interface PolylineEntity {
  id: string;
  entityType: 'polyline';
  points: PointENU[];
}

export interface CatmullRomEntity {
  id: string;
  entityType: 'catmullRom';
  points: PointENU[];
}

export interface BezierEntity {
  id: string;
  entityType: 'bezier';
  anchors: BezierAnchorData[];
}

export interface ArcEntity {
  id: string;
  entityType: 'arc';
  start: PointENU;
  mid: PointENU;
  end: PointENU;
}

export interface RectEntity {
  id: string;
  entityType: 'rect';
  p1: PointENU;
  p2: PointENU;
  rotation: number; // around the rect's centre, radians
}

export interface PolygonEntity {
  id: string;
  entityType: 'polygon';
  points: PointENU[];
}
```

Notes:

- Every primitive has an `id` so the store can address mid-draw entities.
- `entityType` is a literal — TS narrows the union automatically.
- Field names deliberately do not collide with Apollo entity fields (`points` is exclusive to drawing primitives; lanes use `centralCurve`, etc.).

### `type DrawingEntity`

```ts
export type DrawingEntity =
  | PolylineEntity
  | CatmullRomEntity
  | BezierEntity
  | ArcEntity
  | RectEntity
  | PolygonEntity;
```

Detected by the `isDrawingEntity` guard in `entityOps/typeGuards.ts` (driven by the `DRAWING_TYPES` set).

### Apollo re-exports

```ts
export type {
  ApolloEntity,
  ApolloEntityType,
  ApolloMapProto,
  ApolloPolygon,
  AreaEntity,
  AreaType,
  BarrierGateEntity,
  BarrierGateType,
  BoundaryEdge,
  BoundaryPolygon,
  BoundaryLineType,
  ClearAreaEntity,
  CrosswalkEntity,
  Curve,
  CurveSegment,
  JunctionEntity,
  JunctionType,
  LaneBoundary,
  LaneBoundaryTypeEntry,
  LaneDirection,
  LaneEntity,
  LaneSampleAssociation,
  LaneTurn,
  LaneType,
  LineSegment,
  ObjectOverlapInfo,
  OverlapEntity,
  ParkingLotEntity,
  ParkingSpaceEntity,
  PNCJunctionEntity,
  RoadBoundary,
  RoadEntity,
  RoadSection,
  RoadType,
  RSUEntity,
  SignalEntity,
  SignalType,
  SpeedBumpEntity,
  SpeedControlEntity,
  StopSignEntity,
  StopSignType,
  Subsignal,
  SubsignalType,
  YieldSignEntity,
} from './apollo';
```

**Single entry point** — UI code should import every type (including Apollo ones) from `@/types/entities`, not directly from `@/types/apollo`. This way a future Apollo-types refactor only needs to touch this barrel.

### `type MapEntity` — master union

```ts
import type { ApolloEntity } from './apollo';

export type MapEntity = DrawingEntity | ApolloEntity;
```

Element type of `mapStore.entities`.

#### Narrowing example

```ts
function describe(e: MapEntity) {
  switch (e.entityType) {
    case 'polyline':
      return `Polyline with ${e.points.length} points`;
    case 'lane':
      return `Lane ${e.id} length=${e.length ?? '?'}m`;
    case 'rect':
      return `Rect rotation=${e.rotation.toFixed(2)}rad`;
    // … TS enforces exhaustiveness
  }
}
```

The literal `entityType` discriminator narrows automatically in switch / if statements, so call sites never need `as`.

### Total `entityType` enum

Drawing: `polyline | catmullRom | bezier | arc | rect | polygon`

Apollo: `lane | junction | parkingSpace | parkingLot | signal | crosswalk | stopSign | speedBump | yieldSign | clearArea | road | overlap | pncJunction | barrierGate | rsu | area | speedControl`

23 total. The FSM draw states and the `idGenerator` prefix table both key off this set.

## Side effects

None — pure types.

## Test coverage

No standalone tests; type contracts are enforced at compile time.

## Consumers

Almost every non-proto-direct module:

- `src/store/mapStore.ts` — entities Map element
- `src/lib/entityOps/*.ts` — input type
- `src/lib/geoJsonHelpers.ts` — `entityToHotFeatures(entity: MapEntity)`
- `src/hooks/useDrawCommit.ts` — FSM CONFIRM creates the entity
- All Inspector forms

## Source map

| Lines   | Content                 |
| ------- | ----------------------- |
| 1–6     | `GeoPoint` / `PointENU` |
| 11–16   | `BezierAnchorData`      |
| 18–22   | `PolylineEntity`        |
| 24–30   | `CatmullRomEntity`      |
| 32–37   | `BezierEntity`          |
| 39–46   | `ArcEntity`             |
| 48–55   | `RectEntity`            |
| 57–62   | `PolygonEntity`         |
| 65–111  | Apollo re-exports       |
| 113     | `import ApolloEntity`   |
| 116–122 | `DrawingEntity`         |
| 125     | `MapEntity`             |

## See also

- [`apollo`](./apollo.md) — Apollo proto types
- [`editor`](./editor.md) — `DragPointType`
- [`entityOps`](../lib/entity-ops.md) — core operations on `MapEntity`
- `core/fsm/editorMachine.ts` — FSM states matching drawing primitives
