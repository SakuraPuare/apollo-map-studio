---
title: Geo / Lane Geometry
description: src/core/geometry/* — interpolation, topology, junctions, snap, hitTest, validation
---

# Geo / Lane Geometry

`src/core/geometry/` is the editor's pure geometry layer. None of
its functions depend on React, maplibre, or the store, so they
migrate cleanly between main thread and workers.

## Sub-modules

| File                                    | Role                                               |
| --------------------------------------- | -------------------------------------------------- |
| `interpolate.ts`                        | Catmull-Rom / Bezier / arc / rotated-rect samplers |
| `coords.ts`                             | `GeoPoint ↔ LngLat` conversions                    |
| `anchorConvert.ts`                      | `BezierAnchorData ↔ runtime BezierAnchor`          |
| `compile.ts`                            | Entity → GeoJSON Feature + AABB                    |
| `apolloCompile.ts` (+ subdir)           | Apollo feature compile / editPoints / template     |
| `laneTopology.ts`                       | pred / succ / junction / neighbors derivation      |
| `laneJunctions.ts` (+ `laneJunctions/`) | Endpoint stitching + boundary decoration           |
| `connectLanes.ts`                       | Two-lane endpoint matching + move                  |
| `snap.ts`                               | Vertex/edge snap candidates                        |
| `hitTest.ts`                            | Point-to-polyline / polygon distance               |
| `validation.ts`                         | Polyline / polygon self-intersection               |

## `interpolate.ts`

```ts
export type LngLat = [number, number];

export interface BezierAnchor {
  point: LngLat;
  handleIn: LngLat | null;
  handleOut: LngLat | null;
}

export function mirrorPoint(pivot: LngLat, pt: LngLat): LngLat;
export function catmullRom(points: LngLat[], segments?: number, alpha?: number): LngLat[];
export function cubicBezier(anchors: BezierAnchor[], segments?: number): LngLat[];
export function threePointArc(p1: LngLat, p2: LngLat, p3: LngLat, segments?: number): LngLat[];
export function rectCorners(p1: LngLat, p2: LngLat, rotation: number): LngLat[];
export function rotatedRectFromPoints(): { p1: LngLat; p2: LngLat; rotation: number };
/* ... */
export function rectRotateHandle(p1: LngLat, p2: LngLat, rotation: number): LngLat;
```

Default segment counts: `catmullRom = 32`, `cubicBezier = 48`,
`threePointArc = 64`. Catmull-Rom alpha defaults to 0.5
(centripetal — minimises overshoot at sharp turns).

## `coords.ts`

```ts
export function toLngLat(p: GeoPoint): LngLat; // [x, y]
export function toGeoPoint(p: LngLat): GeoPoint; // { x, y }
export function pointsToCoords(points: GeoPoint[]): LngLat[];
export function coordsToPoints(coords: LngLat[]): GeoPoint[];
```

## `anchorConvert.ts`

```ts
export function anchorToRuntime(a: BezierAnchorData): BezierAnchor;
export function anchorToData(a: BezierAnchor): BezierAnchorData;
```

`BezierAnchorData` lives on `_source.anchors` (uses `GeoPoint`);
`BezierAnchor` is the runtime form fed to `cubicBezier`
(uses `LngLat`).

## `compile.ts`

```ts
export function compileColdFeatures(entity: MapEntity): GeoJSON.Feature[];
export function entityBBox(entity: MapEntity): [number, number, number, number];
export function entityCoords(entity: MapEntity): LngLat[];
export function entityRenderCoords(entity: MapEntity): LngLat[];
export function isAreaEntity(entity: MapEntity): boolean;
```

`compileColdFeatures` is the cold-layer entry point. Drawing
primitives emit a single LineString or Polygon coloured per entity
type; Apollo entities delegate to `compileApolloFeatures`.

## `apolloCompile.ts` (re-exports)

```ts
export { pointsToCurve, pointsToPolygon } from './apolloCompile/conversions';
export { offsetPolylineDeg } from './apolloCompile/offsetPolyline';
export {
  apolloEntityCoords,
  deleteApolloVertex,
  getApolloEditPoints,
  isApolloAreaEntity,
  isApolloPolygonEditPoints,
  moveApolloEntity,
  setAllApolloEditPoints,
  setApolloEditPoint,
} from './apolloCompile/editPoints';
export { createApolloEntity, inferLaneTurn } from './apolloCompile/factory';
export { compileApolloFeatures } from './apolloCompile/features';
```

Subdirectory helpers (`signalTemplate.ts`, `signalHeading.ts`,
`laneBoundaryGeometry.ts`) are `@internal`. UI code must reach them
via `@/lib/entityOps`.

## `laneTopology.ts`

```ts
export interface LaneTopologyDiff {
  changes: Map<string, LaneEntity>;
}

export interface LaneTopologyIncrementalOptions {
  dirtyIds: ReadonlySet<string>;
  previousEntities?: ReadonlyMap<string, MapEntity>;
}

export function reconcileLaneTopology(entities): LaneTopologyDiff;
export function reconcileLaneTopologyIncremental(entities, options): LaneTopologyDiff;
```

Derived fields:

- `predecessorIds` / `successorIds` — endpoints sharing a 1 cm precise
  coordinate;
- `selfReverseLaneIds` — opposite-direction twins;
- `junctionId` — geometric crossing of lane centerline with junction
  polygon;
- L/R neighbor lists in forward and reverse directions — lateral
  distance ∈ [1, 6] m, longitudinal offset < 1.5 m, dot ≥ ±0.95.

`reconcileLaneTopology` runs in O(N²); the incremental variant uses a
local R-tree to limit the work to dirty lanes' bbox neighbourhood.

## `laneJunctions.ts`

```ts
export function applyLaneJunctions(
  features: GeoJSON.Feature[],
  entities: Iterable<MapEntity>,
  excludeId?: string | null,
  decorateOnly?: Set<string> | null,
): GeoJSON.Feature[];
```

Stitches lane boundary endpoints into mitre/bevel joins and applies
boundary decoration. `decorateOnly` enables Phase E incremental
decoration so unchanged lanes skip the per-feature redecorate.

## `connectLanes.ts`

```ts
export type ConnectionMode = 'AendToBstart' | 'AstartToBend' | 'AstartToBstart' | 'AendToBend';

export interface ConnectionPlan {
  mode: ConnectionMode;
  distanceMeters: number;
  isContinuous: boolean;
  indexToMove: number;
  target: GeoPoint;
}

export function planConnection(a: LaneEntity, b: LaneEntity): ConnectionPlan | null;
export function applyLaneConnection(lane: LaneEntity, plan: ConnectionPlan): LaneEntity;
```

`planConnection` picks the closest of four endpoint combinations.
`isContinuous` is true when the connection forms pred/succ
(`AendToBstart` or `AstartToBend`). `applyLaneConnection` handles
three source forms (bezier / arc / polyline), re-samples the
centerline, then runs `applyDerive` so the caller does not have to
update derived fields manually.

## `snap.ts`

```ts
export type SnapKind = 'vertex' | 'edge';
export type LaneEndpointRole = 'start' | 'end';

export interface SnapTarget {
  kind: SnapKind;
  point: GeoPoint;
  entityId: string;
  entityType: string;
  vertexIndex?: number;
  endpointRole?: LaneEndpointRole;
}

export function pixelsToMeters(pixels: number, lat: number, zoom: number): number;
export function collectCandidates(/* ... */): { vertices; edges };
export function findSnapTarget(cursor, candidates, cosLat, radiusMeters): SnapTarget | null;
```

Snap units are metres. Vertices outrank edges at equal distance.
`endpointRole` is set on lane-vertex hits and drives the pred/succ
decision in `reconcileLaneTopology`.

## `hitTest.ts`

```ts
export function pointInPolygon(point, polygon): boolean;
export function pointToPolylineDistGeo(point, coords, cosLat): number;
export function pointToPolygonDistGeo(point, polygon, cosLat): number;
```

Latitude-compensated distances are used by worker hitTest.
`pointInPolygon` is topological and does not need unit correction.

## `validation.ts`

```ts
export function segmentsIntersect(a1, a2, b1, b2): boolean;
export function wouldSelfIntersect(points: LngLat[], newPt: LngLat): boolean;
export function polygonSelfIntersects(points: LngLat[]): boolean;
```

FSM uses `wouldSelfIntersect` while drawing polygons to reject
self-crossing rings before the entity is committed.

## See also

- [Geo / Overlap Calc](/en/api/geo-overlap-calc) — consumer of these
  primitives via `core/elements/overlap`.
- [Store / Map](/en/api/store-map) — calls `reconcileLaneTopology*`
  inside `addEntity` / `updateEntity` / `removeEntity`.
- `src/core/fsm/editorMachine.ts` — FSM that drives the validation
  guards.
