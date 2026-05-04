---
title: Geo / Lane Geometry
description: src/core/geometry/* — lane 中心线编译、interpolate、topology、junctions、snap、hitTest、validation
---

# Geo / Lane Geometry

`src/core/geometry/` 是编辑器的纯几何层。所有函数都不依赖 React、
maplibre 或 store，可以在 worker 主线程互相迁移。本节按子模块列出
全部公开符号与签名。

## 子模块概览

| 模块                                  | 角色                                               |
| ------------------------------------- | -------------------------------------------------- |
| `interpolate.ts`                      | Catmull-Rom / Bezier / 圆弧 / 旋转矩形等基础采样   |
| `coords.ts`                           | `GeoPoint ↔ LngLat` 转换                           |
| `anchorConvert.ts`                    | `BezierAnchorData ↔ runtime BezierAnchor`          |
| `compile.ts`                          | 实体 → GeoJSON Feature + AABB                      |
| `apolloCompile.ts` + 子目录           | Apollo 实体的 feature 编译 / editPoints / template |
| `laneTopology.ts`                     | pred / succ / junction / neighbors 全量推导        |
| `laneJunctions.ts` + `laneJunctions/` | 端点对齐 + boundary stitching                      |
| `connectLanes.ts`                     | 两条 lane 端点匹配 + 移动                          |
| `snap.ts`                             | 顶点/边吸附候选与 `findSnapTarget`                 |
| `hitTest.ts`                          | 点到折线 / 多边形距离（欧氏 + 纬度补偿）           |
| `validation.ts`                       | 折线/多边形自交检测                                |

## interpolate.ts

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
export function rotatedRectFromPoints(/* ... */): { p1: LngLat; p2: LngLat; rotation: number };
export function rectRotateHandle(p1: LngLat, p2: LngLat, rotation: number): LngLat;
```

- `catmullRom` 默认 `segments=32, alpha=0.5`（centripetal）。
- `cubicBezier` 默认 `segments=48`。
- `threePointArc` 默认 `segments=64`，三点共线时退化为线段。

## coords.ts

```ts
export function toLngLat(p: GeoPoint): LngLat; // [x, y]
export function toGeoPoint(p: LngLat): GeoPoint; // { x, y }
export function pointsToCoords(points: GeoPoint[]): LngLat[];
export function coordsToPoints(coords: LngLat[]): GeoPoint[];
```

## anchorConvert.ts

```ts
export function anchorToRuntime(a: BezierAnchorData): BezierAnchor;
export function anchorToData(a: BezierAnchor): BezierAnchorData;
```

`BezierAnchorData` 是 `_source.anchors` 的存储形式（`GeoPoint`），
`BezierAnchor` 是 interpolate 内部的运行时形式（`LngLat`）。

## compile.ts

```ts
export function compileColdFeatures(entity: MapEntity): GeoJSON.Feature[];
export function entityBBox(entity: MapEntity): [number, number, number, number];
export function entityCoords(entity: MapEntity): LngLat[];
export function entityRenderCoords(entity: MapEntity): LngLat[];
export function isAreaEntity(entity: MapEntity): boolean;
```

- `compileColdFeatures` 是冷层 GeoJSON 的总入口；Apollo 实体走
  `compileApolloFeatures`，其它绘制图形按颜色直出 LineString / Polygon。
- `entityBBox` = AABB，单位度。
- `entityRenderCoords` 在 Catmull-Rom 上会返回采样后的折线，用于精确
  hitTest。

## apolloCompile.ts (re-export)

`src/core/geometry/apolloCompile.ts` 收口子目录：

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

子目录还提供 `signalTemplate.ts`（`buildSignalTemplate`、
`regenerateSignalGeometry`）、`signalHeading.ts`、`laneBoundaryGeometry.ts`
（`curvePoints`、`explicitLaneBoundaryEdges`）等内部工具，UI 一律通过
`@/lib/entityOps` 间接调用，不应直接 import 这些子文件。

## laneTopology.ts

```ts
export interface LaneTopologyDiff {
  changes: Map<string, LaneEntity>;
}

export interface LaneTopologyIncrementalOptions {
  dirtyIds: ReadonlySet<string>;
  previousEntities?: ReadonlyMap<string, MapEntity>;
}

export function reconcileLaneTopology(entities: ReadonlyMap<string, MapEntity>): LaneTopologyDiff;

export function reconcileLaneTopologyIncremental(
  entities: ReadonlyMap<string, MapEntity>,
  options: LaneTopologyIncrementalOptions,
): LaneTopologyDiff;
```

派生字段：

- `predecessorIds / successorIds` — 端点 1cm 精度共享；
- `selfReverseLaneIds` — 反向孪生；
- `junctionId` — 中心线 ∩ junction.polygon；
- `leftNeighborForwardIds / rightNeighborForwardIds /
leftNeighborReverseIds / rightNeighborReverseIds` — 横向距离 1..6m + 方向 ±0.95。

`reconcileLaneTopology` O(N²)；`reconcileLaneTopologyIncremental` 在
dirty lane 周围做 O(K) 邻居查询，编辑期 < 16ms。

## laneJunctions.ts

```ts
export function applyLaneJunctions(
  features: GeoJSON.Feature[],
  entities: Iterable<MapEntity>,
  excludeId?: string | null,
  decorateOnly?: Set<string> | null,
): GeoJSON.Feature[];
```

把 lane 的左右 boundary 在端点对齐处缝合（mitre / bevel），并做
boundary decoration。`decorateOnly` 用于增量解码（Phase E 优化）。
内部分散到 `laneJunctions/internal.ts`：`decorateBoundary`、
`endpointDirection`、`sideJoinOffset`、`buildLaneFeatureMap`、
`updateLineEndpoint`、`syncPolygonFromEdges`、
`laneEndpointsFromEntity` 等。

## connectLanes.ts

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

`planConnection` 在 4 种端点组合中找最近的一对，返回最佳 plan；
`isContinuous` 标记是否会形成 pred/succ（`AendToBstart` /
`AstartToBend`）。`applyLaneConnection` 处理三种 source 形态
（bezier / arc / polyline）后整体重采样中心线，最后过 `applyDerive`。

## snap.ts

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
export function findSnapTarget(
  cursor: GeoPoint,
  candidates: ReturnType<typeof collectCandidates>,
  cosLat: number,
  radiusMeters: number,
): SnapTarget | null;
```

吸附以米为单位，`radiusMeters` 由 `pixelsToMeters` 从像素阈值（典型
12px）+ 当前纬度/zoom 计算。顶点优先于边段。

## hitTest.ts

```ts
export function pointInPolygon(point: LngLat, polygon: LngLat[]): boolean;
export function pointToPolylineDistGeo(point: LngLat, coords: LngLat[], cosLat: number): number;
export function pointToPolygonDistGeo(point: LngLat, polygon: LngLat[], cosLat: number): number;
```

纬度补偿版距离用于 worker hitTest。
`pointInPolygon` 是拓扑判断，不需要量纲修正。

## validation.ts

```ts
export function segmentsIntersect(a1: LngLat, a2: LngLat, b1: LngLat, b2: LngLat): boolean;
export function wouldSelfIntersect(points: LngLat[], newPt: LngLat): boolean;
export function polygonSelfIntersects(points: LngLat[]): boolean;
```

FSM 在 polygon 绘制时用 `wouldSelfIntersect` 拦截创建无效几何。
