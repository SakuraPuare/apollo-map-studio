---
title: Apollo Types
description: src/types/apollo.ts 中所有导出 TypeScript 类型与接口的字段级参考。
---

# Apollo Types

本页对 `src/types/apollo.ts`（约 556 行）的所有导出类型 / 接口进行字段级展开。
TS 类型层与 [Proto Schema](/reference/proto-schema) 一一映射，但额外携带：

- 编辑器扩展字段（`_source`、`_sourceRect`、`_userOverrides`），proto2 unknown 字段保留。
- 联合类型（`ApolloEntity`、`ObjectOverlapInfo`），便于类型 narrowing。
- 注释中标注的 proto2 `optional` 守则。

::: tip 阅读约定

- 行号引用例如 `src/types/apollo.ts:42-58` 表示当前 commit 的真实代码位置。
- 类型定义按文件原顺序排列，便于与源文件直接对照。
  :::

## 文件总览

| 区块                      | 行号范围 | 包含                                                    |
| ------------------------- | -------- | ------------------------------------------------------- |
| Editor 扩展类型           | 11–32    | `SourceDrawInfo`, `SourceRectInfo`                      |
| `map_geometry.proto`      | 33–70    | `ApolloPolygon`, `LineSegment`, `CurveSegment`, `Curve` |
| `map_lane.proto`          | 72–164   | Lane 全家桶                                             |
| `map_junction.proto`      | 166–183  | `JunctionType`, `JunctionEntity`                        |
| `map_parking_space.proto` | 185–203  | `ParkingSpaceEntity`, `ParkingLotEntity`                |
| `map_signal.proto`        | 205–252  | `Subsignal`, `SignInfo`, `Signal` 全家桶                |
| `map_crosswalk.proto`     | 254–262  | `CrosswalkEntity`                                       |
| `map_stop_sign.proto`     | 264–282  | `StopSignType`, `StopSignEntity`                        |
| `map_speed_bump.proto`    | 284–292  | `SpeedBumpEntity`                                       |
| `map_yield_sign.proto`    | 294–302  | `YieldSignEntity`                                       |
| `map_clear_area.proto`    | 304–312  | `ClearAreaEntity`                                       |
| `map_road.proto`          | 314–345  | `BoundaryEdge` ~ `RoadEntity`                           |
| `map_overlap.proto`       | 347–398  | Overlap 全家桶                                          |
| `map_pnc_junction.proto`  | 400–424  | PNC 路口                                                |
| `map_barrier_gate.proto`  | 426–438  | BarrierGate                                             |
| `map_rsu.proto`           | 440–447  | RSU                                                     |
| `map_area.proto`          | 449–460  | Area                                                    |
| `map_speed_control.proto` | 462–471  | SpeedControl                                            |
| Apollo 联合               | 473–497  | `ApolloEntity`, `ApolloEntityType`                      |
| `map.proto` 顶层          | 499–538  | `MapProjection`, `MapHeader`, `ApolloMapProto`          |
| 编辑器访问器              | 540–555  | `getSource()`, `getSourceRect()`                        |

## 编辑器扩展类型

```ts
// src/types/apollo.ts:20-31
export interface SourceDrawInfo {
  drawTool: string;
  anchors?: BezierAnchorData[];
  arcPoints?: [GeoPoint, GeoPoint, GeoPoint];
}

export interface SourceRectInfo {
  p1: GeoPoint;
  p2: GeoPoint;
  rotation: number;
}
```

| 字段                       | 用途                                                               |
| -------------------------- | ------------------------------------------------------------------ |
| `SourceDrawInfo.drawTool`  | 原始绘制工具 ID（如 `polyline`、`bezier`、`catmull-rom`、`arc`）。 |
| `SourceDrawInfo.anchors`   | 贝塞尔/Catmull-Rom 锚点列表，使元素被选中后仍可恢复手柄编辑。      |
| `SourceDrawInfo.arcPoints` | 圆弧三点（起点 / 中间点 / 终点）。                                 |
| `SourceRectInfo`           | 矩形元素的两对角点 + 旋转角度，便于旋转编辑。                      |

## 几何基础

```ts
// src/types/apollo.ts:36-70
export type PointENU = GeoPoint;
export interface ApolloPolygon {
  points: PointENU[];
}
export interface LineSegment {
  points: PointENU[];
}
export interface CurveSegment {
  lineSegment: LineSegment;
  s?: number;
  startPosition?: PointENU;
  heading?: number;
  length?: number;
}
export interface Curve {
  segments: CurveSegment[];
}
```

::: warning proto2 optional 守则
`s / startPosition / heading / length` 都是 `optional`：

- 不要在缺失情况下补 `0` 或 `{x:0,y:0}`，否则 round-trip 会写入虚假数据。
- 真正缺失要保留 `undefined`。
  :::

## Lane 类型族

### 边界类型

```ts
export type BoundaryLineType =
  | 'UNKNOWN'
  | 'DOTTED_YELLOW'
  | 'DOTTED_WHITE'
  | 'SOLID_YELLOW'
  | 'SOLID_WHITE'
  | 'DOUBLE_YELLOW'
  | 'CURB';
export interface LaneBoundaryTypeEntry {
  s: number;
  types: BoundaryLineType[];
}
export interface LaneBoundary {
  curve: Curve;
  length?: number;
  virtual?: boolean;
  boundaryType: LaneBoundaryTypeEntry[];
}
export interface LaneSampleAssociation {
  s: number;
  width: number;
}
export type LaneType =
  'NONE' | 'CITY_DRIVING' | 'BIKING' | 'SIDEWALK' | 'PARKING' | 'SHOULDER' | 'SHARED';
export type LaneTurn = 'NO_TURN' | 'LEFT_TURN' | 'RIGHT_TURN' | 'U_TURN';
export type LaneDirection = 'FORWARD' | 'BACKWARD' | 'BIDIRECTION';
```

### `LaneEntity`

```ts
// src/types/apollo.ts:118-164
export interface LaneEntity {
  id: string;
  entityType: 'lane';

  centralCurve: Curve;
  leftBoundary: LaneBoundary;
  rightBoundary: LaneBoundary;
  length?: number;

  type: LaneType;
  turn: LaneTurn;
  direction: LaneDirection;
  speedLimit?: number;

  predecessorIds: string[];
  successorIds: string[];
  leftNeighborForwardIds: string[];
  rightNeighborForwardIds: string[];
  leftNeighborReverseIds: string[];
  rightNeighborReverseIds: string[];
  selfReverseLaneIds: string[];
  junctionId: string | null;
  overlapIds: string[];

  leftSamples: LaneSampleAssociation[];
  rightSamples: LaneSampleAssociation[];
  leftRoadSamples: LaneSampleAssociation[];
  rightRoadSamples: LaneSampleAssociation[];

  _source?: SourceDrawInfo;
  _userOverrides?: string[];
}
```

::: tip `_userOverrides`
被用户在 inspector 手动改过的字段路径列表。derive-engine 重新推算时会跳过这些
路径，避免覆盖手动值。详见 [Derive Engine](/architecture/derive-engine)。
:::

## Junction

```ts
export type JunctionType =
  'UNKNOWN' | 'IN_ROAD' | 'CROSS_ROAD' | 'FORK_ROAD' | 'MAIN_SIDE' | 'DEAD_END';
export interface JunctionEntity {
  id: string;
  entityType: 'junction';
  polygon: ApolloPolygon;
  type?: JunctionType;
  overlapIds: string[];
}
```

## ParkingSpace / ParkingLot

```ts
export interface ParkingSpaceEntity {
  id: string;
  entityType: 'parkingSpace';
  polygon: ApolloPolygon;
  heading: number;
  overlapIds: string[];
  _sourceRect?: SourceRectInfo;
  _userOverrides?: string[];
}
export interface ParkingLotEntity {
  id: string;
  entityType: 'parkingLot';
  polygon: ApolloPolygon;
  overlapIds: string[];
}
```

## Signal 类型族

```ts
export type SubsignalType =
  | 'UNKNOWN_SUBSIGNAL'
  | 'CIRCLE'
  | 'ARROW_LEFT'
  | 'ARROW_FORWARD'
  | 'ARROW_RIGHT'
  | 'ARROW_LEFT_AND_FORWARD'
  | 'ARROW_RIGHT_AND_FORWARD'
  | 'ARROW_U_TURN';
export interface Subsignal {
  id: string;
  type: SubsignalType;
  location?: PointENU;
}

export type SignInfoType = 'None' | 'NO_RIGHT_TURN_ON_RED';
export interface SignInfo {
  type: SignInfoType;
}

export type SignalType =
  | 'UNKNOWN_SIGNAL'
  | 'MIX_2_HORIZONTAL'
  | 'MIX_2_VERTICAL'
  | 'MIX_3_HORIZONTAL'
  | 'MIX_3_VERTICAL'
  | 'SINGLE';

export interface SignalEntity {
  id: string;
  entityType: 'signal';
  boundary: ApolloPolygon;
  subsignals: Subsignal[];
  type: SignalType;
  overlapIds: string[];
  stopLines: Curve[];
  signInfo: SignInfo[];
  _source?: SourceDrawInfo;
}
```

## Crosswalk / StopSign / SpeedBump / YieldSign / ClearArea

```ts
export interface CrosswalkEntity {
  id: string;
  entityType: 'crosswalk';
  polygon: ApolloPolygon;
  overlapIds: string[];
  _sourceRect?: SourceRectInfo;
}

export type StopSignType =
  'UNKNOWN_STOP_SIGN' | 'ONE_WAY' | 'TWO_WAY' | 'THREE_WAY' | 'FOUR_WAY' | 'ALL_WAY';
export interface StopSignEntity {
  id: string;
  entityType: 'stopSign';
  stopLines: Curve[];
  type?: StopSignType;
  overlapIds: string[];
  _source?: SourceDrawInfo;
}

export interface SpeedBumpEntity {
  id: string;
  entityType: 'speedBump';
  position: Curve[];
  overlapIds: string[];
  _source?: SourceDrawInfo;
}

export interface YieldSignEntity {
  id: string;
  entityType: 'yieldSign';
  stopLines: Curve[];
  overlapIds: string[];
  _source?: SourceDrawInfo;
}

export interface ClearAreaEntity {
  id: string;
  entityType: 'clearArea';
  polygon: ApolloPolygon;
  overlapIds: string[];
  _sourceRect?: SourceRectInfo;
}
```

## Road 类型族

```ts
export interface BoundaryEdge {
  curve: Curve;
  type: 'UNKNOWN' | 'NORMAL' | 'LEFT_BOUNDARY' | 'RIGHT_BOUNDARY';
}
export interface BoundaryPolygon {
  edges: BoundaryEdge[];
}
export interface RoadBoundary {
  outerPolygon: BoundaryPolygon;
  holes: BoundaryPolygon[];
}
export interface RoadSection {
  id: string;
  laneIds: string[];
  boundary?: RoadBoundary;
}
export type RoadType = 'UNKNOWN_ROAD' | 'HIGHWAY' | 'CITY_ROAD' | 'PARK';
export interface RoadEntity {
  id: string;
  entityType: 'road';
  sections: RoadSection[];
  junctionId: string | null;
  type?: RoadType;
}
```

## Overlap 类型族

```ts
export interface LaneOverlapInfo {
  startS?: number;
  endS?: number;
  isMerge?: boolean;
  regionOverlapId?: string;
}
export interface RegionOverlapInfo {
  id: string;
  polygons: ApolloPolygon[];
}

export type ObjectOverlapInfo =
  | { objectType: 'lane'; objectId: string; laneOverlapInfo: LaneOverlapInfo }
  | { objectType: 'signal'; objectId: string }
  | { objectType: 'stopSign'; objectId: string }
  | { objectType: 'crosswalk'; objectId: string; regionOverlapId?: string }
  | { objectType: 'junction'; objectId: string }
  | { objectType: 'yieldSign'; objectId: string }
  | { objectType: 'clearArea'; objectId: string }
  | { objectType: 'speedBump'; objectId: string }
  | { objectType: 'parkingSpace'; objectId: string }
  | { objectType: 'pncJunction'; objectId: string }
  | { objectType: 'rsu'; objectId: string }
  | { objectType: 'area'; objectId: string }
  | { objectType: 'barrierGate'; objectId: string }
  | { objectType: 'unknown'; objectId: string };

export interface OverlapEntity {
  id: string;
  entityType: 'overlap';
  objects: ObjectOverlapInfo[];
  regionOverlaps: RegionOverlapInfo[];
  _userOverrides?: string[];
}
```

::: warning `unknown` 变体的存在意义
某些 Apollo 真实地图的 `lane↔crosswalk` overlap 没有写 `overlap_info` oneof。
旧版 bridge 直接丢弃，导致 round-trip 数据损失。`unknown` 变体专门 pass-through
这些条目，不再丢失。
:::

## PNCJunction / BarrierGate / RSU / Area / SpeedControl

```ts
export type PassageType = 'UNKNOWN_PASSAGE' | 'ENTRANCE' | 'EXIT';
export interface Passage {
  id: string;
  signalIds: string[];
  yieldIds: string[];
  stopSignIds: string[];
  laneIds: string[];
  type: PassageType;
}
export interface PassageGroup {
  id: string;
  passages: Passage[];
}
export interface PNCJunctionEntity {
  id: string;
  entityType: 'pncJunction';
  polygon: ApolloPolygon;
  overlapIds: string[];
  passageGroups: PassageGroup[];
}

export type BarrierGateType = 'ROD' | 'FENCE' | 'ADVERTISING' | 'TELESCOPIC' | 'OTHER';
export interface BarrierGateEntity {
  id: string;
  entityType: 'barrierGate';
  type: BarrierGateType;
  polygon: ApolloPolygon;
  stopLines: Curve[];
  overlapIds: string[];
  _source?: SourceDrawInfo;
}

export interface RSUEntity {
  id: string;
  entityType: 'rsu';
  junctionId: string | null;
  overlapIds: string[];
}

export type AreaType = 'Driveable' | 'UnDriveable' | 'Custom1' | 'Custom2' | 'Custom3';
export interface AreaEntity {
  id: string;
  entityType: 'area';
  type: AreaType;
  polygon: ApolloPolygon;
  overlapIds: string[];
  name?: string;
}

export interface SpeedControlEntity {
  id: string;
  entityType: 'speedControl';
  name: string;
  polygon: ApolloPolygon;
  speedLimit: number;
}
```

## Apollo 实体联合类型

```ts
// src/types/apollo.ts:476-497
export type ApolloEntity =
  | LaneEntity
  | JunctionEntity
  | ParkingSpaceEntity
  | ParkingLotEntity
  | SignalEntity
  | CrosswalkEntity
  | StopSignEntity
  | SpeedBumpEntity
  | YieldSignEntity
  | ClearAreaEntity
  | RoadEntity
  | OverlapEntity
  | PNCJunctionEntity
  | BarrierGateEntity
  | RSUEntity
  | AreaEntity
  | SpeedControlEntity;

export type ApolloEntityType = ApolloEntity['entityType'];
```

::: tip narrowing 模式

```ts
function rename(entity: ApolloEntity, newId: string): ApolloEntity {
  switch (entity.entityType) {
    case 'lane':
      return { ...entity, id: newId };
    case 'junction':
      return { ...entity, id: newId };
    // ...
  }
}
```

所有写操作建议都通过 [`entityOps`](/architecture/entityops) 进行，避免直接 narrowing。
:::

## 顶层 Map 容器

```ts
export interface MapProjection {
  proj: string;
}
export interface MapHeader {
  version?: string;
  date?: string;
  projection?: MapProjection;
  district?: string;
  generation?: string;
  revMajor?: string;
  revMinor?: string;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  vendor?: string;
}
export interface ApolloMapProto {
  header?: MapHeader;
  crosswalks: CrosswalkEntity[];
  junctions: JunctionEntity[];
  lanes: LaneEntity[];
  stopSigns: StopSignEntity[];
  signals: SignalEntity[];
  yieldSigns: YieldSignEntity[];
  overlaps: OverlapEntity[];
  clearAreas: ClearAreaEntity[];
  speedBumps: SpeedBumpEntity[];
  roads: RoadEntity[];
  parkingSpaces: ParkingSpaceEntity[];
  pncJunctions: PNCJunctionEntity[];
  rsus: RSUEntity[];
  areas: AreaEntity[];
  barrierGates: BarrierGateEntity[];
}
```

## Editor source-info accessors

```ts
// src/types/apollo.ts:548-555
export function getSource(entity: { entityType: string }): SourceDrawInfo | undefined;
export function getSourceRect(entity: { entityType: string }): SourceRectInfo | undefined;
```

::: tip 为什么要这两个函数
`_source` / `_sourceRect` 不在所有变体上声明。直接 `entity._source` 在 narrow
之前会得到 `never`。这两个 accessor 把 cast 集中在一处，避免分散污染调用点。
:::

## 字段差异速查

| 类型              | proto2 optional 字段                           | 编辑器专用字段              |
| ----------------- | ---------------------------------------------- | --------------------------- |
| `LaneEntity`      | `length`, `speedLimit`                         | `_source`, `_userOverrides` |
| `JunctionEntity`  | `type`                                         | —                           |
| `Subsignal`       | `location`                                     | —                           |
| `StopSignEntity`  | `type`                                         | `_source`                   |
| `LaneOverlapInfo` | `startS`, `endS`, `isMerge`, `regionOverlapId` | —                           |
| `OverlapEntity`   | —                                              | `_userOverrides`            |
| `RoadEntity`      | `type`                                         | —                           |
| `CurveSegment`    | `s`, `startPosition`, `heading`, `length`      | —                           |
| `LaneBoundary`    | `length`, `virtual`                            | —                           |

## 相关文档

- [Proto Schema](/reference/proto-schema)
- [Enum Mappings](/reference/enum-mappings)
- [entityOps 防腐层](/architecture/entityops)
- [Inspector Schema](/architecture/inspector-schema)
- [Derive Engine](/architecture/derive-engine)
- [架构总览](/architecture/overview)
