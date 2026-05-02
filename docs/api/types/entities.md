# `types/entities`

> Source: [`src/types/entities.ts`](https://github.com/SakuraPuare/apollo-map-studio/blob/v1/src/types/entities.ts)

The proto-agnostic editor model. `MapEntity` is the discriminated union
that the entire UI layer consumes; it extends [`ApolloEntity`](/api/types/apollo)
with the editor's six drawing primitives (`polyline`, `catmullRom`,
`bezier`, `arc`, `rect`, `polygon`).

> **Layering rule.** Components, hooks, and stores import `MapEntity`
> and the entityType discriminants from this file. Direct imports of
> `ApolloEntity` from `@/types/apollo` outside of `entityOps`,
> `entityBridge`, and the inspector schema are an R2 leak — see
> [Architecture overview](/architecture/overview).

## Module surface (verbatim)

```ts
/** 经纬度点 (WGS84) */
export interface GeoPoint {
  x: number; // longitude
  y: number; // latitude
  z?: number;
}

/** @deprecated 使用 GeoPoint */
export type PointENU = GeoPoint;

/** 贝塞尔锚点（存储用） */
export interface BezierAnchorData {
  point: PointENU;
  handleIn: PointENU | null;
  handleOut: PointENU | null;
}
```

`PointENU` is preserved here only as a back-compat alias for code
written before the rename to `GeoPoint`. New code should import
`GeoPoint`.

`BezierAnchorData` is the storage shape — `null` handles mean the
adjacent segment is straight rather than curved.

## Drawing primitives

```ts
/** 多段线实体 */
export interface PolylineEntity {
  id: string;
  entityType: 'polyline';
  points: PointENU[];
}

/** Catmull-Rom 样条实体 */
export interface CatmullRomEntity {
  id: string;
  entityType: 'catmullRom';
  points: PointENU[];
}

/** 贝塞尔曲线实体 */
export interface BezierEntity {
  id: string;
  entityType: 'bezier';
  anchors: BezierAnchorData[];
}

/** 圆弧实体（三点定弧） */
export interface ArcEntity {
  id: string;
  entityType: 'arc';
  start: PointENU;
  mid: PointENU;
  end: PointENU;
}

/** 可旋转矩形实体（两对角点 + 旋转角度） */
export interface RectEntity {
  id: string;
  entityType: 'rect';
  p1: PointENU; // 对角点1
  p2: PointENU; // 对角点2
  rotation: number; // 绕中心旋转角度（弧度）
}

/** 多边形实体 */
export interface PolygonEntity {
  id: string;
  entityType: 'polygon';
  points: PointENU[];
}
```

| `entityType` literal | Variant            | Storage shape                    | Default tool      |
| -------------------- | ------------------ | -------------------------------- | ----------------- |
| `'polyline'`         | `PolylineEntity`   | `points: PointENU[]`             | `drawPolyline`    |
| `'catmullRom'`       | `CatmullRomEntity` | `points: PointENU[]`             | `drawCatmullRom`  |
| `'bezier'`           | `BezierEntity`     | `anchors: BezierAnchorData[]`    | `drawBezier`      |
| `'arc'`              | `ArcEntity`        | `start`, `mid`, `end: PointENU`  | `drawArc`         |
| `'rect'`             | `RectEntity`       | `p1`, `p2: PointENU`, `rotation` | `drawRotatedRect` |
| `'polygon'`          | `PolygonEntity`    | `points: PointENU[]`             | `drawPolygon`     |

These primitives exist because the FSM needs an addressable shape for
mid-draw state. Once a draw FSM state exits to `idle`,
`useDrawCommit` converts the primitive into the appropriate Apollo
entity (e.g. a `BezierEntity` becomes a `LaneEntity` with the
`anchors` stashed in `_source`) and replaces the in-flight primitive
in the store.

## Apollo re-exports

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

The re-export list is the public Apollo API for non-bridge callers.
Importing any of these names through `@/types/entities` (rather than
`@/types/apollo` directly) keeps UI files compatible with future
[ACL hardening](/architecture/overview) — the import surface narrows
without code churn.

## Drawing union

```ts
import type { ApolloEntity } from './apollo';

/** Drawing primitive entity types (geometry tools) */
export type DrawingEntity =
  | PolylineEntity
  | CatmullRomEntity
  | BezierEntity
  | ArcEntity
  | RectEntity
  | PolygonEntity;
```

## `MapEntity` — the editor entity

```ts
/** All editable entity types — drawing primitives + Apollo HD map elements */
export type MapEntity = DrawingEntity | ApolloEntity;
```

`MapEntity` is the **only** entity type the UI layer should reference.
`mapStore.entities` is `Map<string, MapEntity>`; the FSM speaks
`MapEntity`; `entityOps` operates on `MapEntity`.

### Discrimination patterns

```ts
function isApollo(entity: MapEntity): entity is ApolloEntity {
  return (
    entity.entityType !== 'polyline' &&
    entity.entityType !== 'catmullRom' &&
    entity.entityType !== 'bezier' &&
    entity.entityType !== 'arc' &&
    entity.entityType !== 'rect' &&
    entity.entityType !== 'polygon'
  );
}

function isLane(entity: MapEntity): entity is LaneEntity {
  return entity.entityType === 'lane';
}
```

Prefer narrow `entityType === 'lane'` checks over the broad
`isApollo` form when only one variant is needed; the narrow form keeps
the type-system inference per-variant rather than collapsing to
`ApolloEntity`.

### Geometry vs Apollo invariant

A `MapEntity` is in exactly one of two phases:

1. **Drawing primitive** (`entityType` ∈ `{polyline, catmullRom, bezier,
arc, rect, polygon}`) — the FSM is mid-draw, the entity has no
   Apollo semantics, and serialisation skips it.
2. **Apollo entity** (any other `entityType`) — committed, drives the
   cold layer, exports through the bridge.

The transition is one-way: `useDrawCommit` replaces the primitive with
the Apollo variant on FSM `CONFIRM` / `DOUBLE_CLICK`. Going the other
way (Apollo → primitive) is not a supported operation; editing an
existing Apollo entity uses its `_source` / `_sourceRect` to recreate
the original handles.

## See also

- [`types/apollo`](/api/types/apollo) — Apollo proto-mirror types
- [`types/editor`](/api/types/editor) — `DragPointType` and adjacent
  runtime surface
- [`types/inspectorSchema`](/api/types/inspector-schema) — schema
  descriptors that consume `MapEntity`
- [`entityOps`](/api/lib/entity-ops) — adapter that hides `ApolloEntity`
  internals from UI callers
- [Architecture overview](/architecture/overview) — anti-corruption
  layer (R2) and undo CANCEL closure (R1)
- `src/core/fsm/editorMachine.ts` — drawing FSM that produces /
  consumes `DrawingEntity`
- `src/store/mapStore.ts` — Zustand store typed over
  `Map<string, MapEntity>`
