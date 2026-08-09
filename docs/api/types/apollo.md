---
title: types/apollo — Apollo HD Map proto 类型
description: 从 modules/common_msgs/map_msgs/*.proto 推导的全部 Apollo HD Map TypeScript 类型；entity union、proto2 optional 严格表达。
---

# `types/apollo` — Apollo HD Map proto 类型

> 源码：`src/types/apollo.ts` · 556 行 · 17 个实体接口 · proto2 严格映射

## 用途

Apollo HD Map 的所有实体定义在 `modules/common_msgs/map_msgs/*.proto`。本文件是这些 proto 消息的 TypeScript 镜像，**proto2 optional 字段全部用 `?:` 表达**——bridge 不会把缺失字段合成 `0`/`{0,0}`，避免 round-trip 时往 wire 写入虚假数据。

proto 源文件复制到 `src/proto/`；本文件由人工维护以保留注释 / 风格，不是自动生成（动机：proto-loader.ts 完成 wire ↔ JS 转换，TS 类型仅服务于 UI）。

## 公共 API 概览

| 类别        | 数量 | 摘要                                                                           |
| ----------- | ---- | ------------------------------------------------------------------------------ |
| 几何基础    | 5    | `PointENU`, `ApolloPolygon`, `LineSegment`, `CurveSegment`, `Curve`            |
| Lane        | 6    | `LaneType`, `LaneTurn`, `LaneDirection`, `BoundaryLineType`, `LaneEntity`, ... |
| 实体        | 17   | `LaneEntity`, `JunctionEntity`, `RoadEntity`, ..., `SpeedControlEntity`        |
| Overlap     | 4    | `LaneOverlapInfo`, `RegionOverlapInfo`, `ObjectOverlapInfo`, `OverlapEntity`   |
| Container   | 3    | `MapHeader`, `MapProjection`, `ApolloMapProto`                                 |
| Editor 扩展 | 4    | `SourceDrawInfo`, `SourceRectInfo`, `getSource`, `getSourceRect`               |

## Editor 扩展字段

非 Apollo proto 的"编辑器内部"字段，命名前缀 `_`：

### `interface SourceDrawInfo`

```ts
export interface SourceDrawInfo {
  drawTool: string; // 'drawBezier' | 'drawArc' | 'drawCatmullRom' | ...
  anchors?: BezierAnchorData[]; // drawBezier
  arcPoints?: [GeoPoint, GeoPoint, GeoPoint]; // drawArc
}
```

挂在 `LaneEntity._source` / `SignalEntity._source` 等。让选中后的实体能用同一套控制柄编辑（参见 [`geoJsonHelpers`](../lib/geo-json-helpers.md)）。

### `interface SourceRectInfo`

```ts
export interface SourceRectInfo {
  p1: GeoPoint;
  p2: GeoPoint;
  rotation: number;
}
```

挂在 `ParkingSpaceEntity._sourceRect` / `CrosswalkEntity._sourceRect` / `ClearAreaEntity._sourceRect`。

### `_userOverrides` 字段

```ts
_userOverrides?: string[];
```

存在于 `LaneEntity` / `ParkingSpaceEntity` / `OverlapEntity`。记录用户在 Inspector 手动改过的字段路径——后续几何编辑触发的派生规则（`core/elements/derive`）会跳过 `owns` 与该列表相交的派生项。

## 几何基础

### `type PointENU`

```ts
export type PointENU = GeoPoint;
```

历史命名沿用 Apollo 的 ENU 坐标——但编辑器内部所有 PointENU 已被转换为 WGS84 经纬度（`x = lng, y = lat`）。proto-loader.ts 在 wire ↔ JS 边界做投影变换。

### `interface ApolloPolygon`

```ts
export interface ApolloPolygon {
  points: PointENU[];
}
```

不一定凸；首尾不强制相同（proto2 不保证）。

### `interface LineSegment` / `CurveSegment` / `Curve`

```ts
export interface LineSegment {
  points: PointENU[];
}

export interface CurveSegment {
  lineSegment: LineSegment;
  s?: number; // proto2 optional
  startPosition?: PointENU; // proto2 optional
  heading?: number; // proto2 optional
  length?: number; // proto2 optional
}

export interface Curve {
  segments: CurveSegment[];
}
```

`s` / `startPosition` / `heading` / `length` 在真实 Apollo 地图里很多字段缺失——`stop_line`、`road.section.boundary`、`lane.left/right_boundary.curve` 等。**Bridge 必须 preserve 缺失** — `?:` 在 wire ↔ JS round-trip 中保留"用户未写入"语义，不合成 0。

## Lane

### Enum 类型

```ts
export type BoundaryLineType =
  | 'UNKNOWN'
  | 'DOTTED_YELLOW'
  | 'DOTTED_WHITE'
  | 'SOLID_YELLOW'
  | 'SOLID_WHITE'
  | 'DOUBLE_YELLOW'
  | 'CURB';

export type LaneType =
  'NONE' | 'CITY_DRIVING' | 'BIKING' | 'SIDEWALK' | 'PARKING' | 'SHOULDER' | 'SHARED';

export type LaneTurn = 'NO_TURN' | 'LEFT_TURN' | 'RIGHT_TURN' | 'U_TURN';

export type LaneDirection = 'FORWARD' | 'BACKWARD' | 'BIDIRECTION';
```

### `interface LaneBoundary`

```ts
export interface LaneBoundary {
  curve: Curve;
  length?: number; // proto2 optional
  virtual?: boolean;
  boundaryType: LaneBoundaryTypeEntry[]; // s 升序
}
```

### `interface LaneSampleAssociation`

```ts
export interface LaneSampleAssociation {
  s: number;
  width: number;
}
```

### `interface LaneEntity`

```ts
export interface LaneEntity {
  id: string;
  entityType: 'lane';

  // 几何
  centralCurve: Curve;
  leftBoundary: LaneBoundary;
  rightBoundary: LaneBoundary;
  length?: number;

  // 属性
  type: LaneType;
  turn: LaneTurn;
  direction: LaneDirection;
  speedLimit?: number; // m/s, proto2 optional

  // 拓扑（扁平 ID 引用）
  predecessorIds: string[];
  successorIds: string[];
  leftNeighborForwardIds: string[];
  rightNeighborForwardIds: string[];
  leftNeighborReverseIds: string[];
  rightNeighborReverseIds: string[];
  selfReverseLaneIds: string[];
  junctionId: string | null;
  overlapIds: string[];

  // 宽度采样
  leftSamples: LaneSampleAssociation[];
  rightSamples: LaneSampleAssociation[];
  leftRoadSamples: LaneSampleAssociation[];
  rightRoadSamples: LaneSampleAssociation[];

  // 编辑器扩展
  _source?: SourceDrawInfo;
  _userOverrides?: string[];
}
```

文件位置：`apollo.ts:118-164`。

## Junction

### `type JunctionType`

```ts
export type JunctionType =
  'UNKNOWN' | 'IN_ROAD' | 'CROSS_ROAD' | 'FORK_ROAD' | 'MAIN_SIDE' | 'DEAD_END';
```

### `interface JunctionEntity`

```ts
export interface JunctionEntity {
  id: string;
  entityType: 'junction';
  polygon: ApolloPolygon;
  type?: JunctionType; // proto2 optional
  overlapIds: string[];
}
```

## Parking Space / Lot

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

## Signal / Subsignal

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
  location?: PointENU; // proto2 optional, "now no data support"
}

export type SignalType =
  | 'UNKNOWN_SIGNAL'
  | 'MIX_2_HORIZONTAL'
  | 'MIX_2_VERTICAL'
  | 'MIX_3_HORIZONTAL'
  | 'MIX_3_VERTICAL'
  | 'SINGLE';

export type SignInfoType = 'None' | 'NO_RIGHT_TURN_ON_RED';

export interface SignInfo {
  type: SignInfoType;
}

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

简洁形态，省略以减少冗余：

```ts
export interface CrosswalkEntity {
  id;
  entityType: 'crosswalk';
  polygon;
  overlapIds;
  _sourceRect?;
}
export interface StopSignEntity {
  id;
  entityType: 'stopSign';
  stopLines;
  type?;
  overlapIds;
  _source?;
}
export interface SpeedBumpEntity {
  id;
  entityType: 'speedBump';
  position: Curve[];
  overlapIds;
  _source?;
}
export interface YieldSignEntity {
  id;
  entityType: 'yieldSign';
  stopLines;
  overlapIds;
  _source?;
}
export interface ClearAreaEntity {
  id;
  entityType: 'clearArea';
  polygon;
  overlapIds;
  _sourceRect?;
}

export type StopSignType =
  'UNKNOWN_STOP_SIGN' | 'ONE_WAY' | 'TWO_WAY' | 'THREE_WAY' | 'FOUR_WAY' | 'ALL_WAY';
```

## Road

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

## Overlap

最复杂的实体——多对象交集的几何 + 语义。

```ts
export interface LaneOverlapInfo {
  startS?: number; // proto2 optional
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

`unknown` 变体的存在解释参见类型注释：Apollo 在野地图存在 `overlap_info` oneof 未设置的 lane↔crosswalk 对，bridge 不能直接丢弃，否则 round-trip 丢数据。

## PNC Junction

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
```

## BarrierGate / RSU / Area / SpeedControl

```ts
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
  speedLimit: number; // m/s
}
```

## Apollo entity union

```ts
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

判别符 `entityType` 是字面量类型——TS 编译器自动 narrow union。

## Top-level container

```ts
export interface MapProjection {
  proj: string; // PROJ.4 字符串
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

## Source-info accessors

```ts
export function getSource(entity: { entityType: string }): SourceDrawInfo | undefined {
  return (entity as { _source?: SourceDrawInfo })._source;
}

export function getSourceRect(entity: { entityType: string }): SourceRectInfo | undefined {
  return (entity as { _sourceRect?: SourceRectInfo })._sourceRect;
}
```

`_source` / `_sourceRect` 只在部分 union 变体上存在；这两个 accessor 把"边界 cast"集中起来，减少 call-site 的 `as` 噪音。

## proto2 optional 总结

bridge 必须 preserve "absent" 语义的字段（清单）：

| 字段                                                        | 出处                                 |
| ----------------------------------------------------------- | ------------------------------------ |
| `CurveSegment.s / startPosition / heading / length`         | 真实地图普遍缺失                     |
| `LaneBoundary.length`                                       | 同上                                 |
| `LaneEntity.length / speedLimit`                            | 同上                                 |
| `JunctionEntity.type`                                       | 同上                                 |
| `Subsignal.location`                                        | Apollo 注释明确"now no data support" |
| `StopSignEntity.type`                                       | 同上                                 |
| `RoadEntity.type`                                           | 同上                                 |
| `LaneOverlapInfo.startS / endS / isMerge / regionOverlapId` | oneof 跳过场景                       |
| `ObjectOverlapInfo` `unknown` 变体                          | overlap_info oneof 未设置            |

## 副作用

无 —— 纯类型 + 两个无副作用 accessor。

## 测试覆盖

无独立测试文件；与 zod schema 的契约由 `src/io/__tests__/protoLoader.test.ts` 校验（round-trip 不丢字段）。

## 调用方

被项目几乎所有模块 import：

- `src/lib/entityOps/*.ts` — 类型 + cast
- `src/store/mapStore.ts` — `MapEntity` 来源（再次经 `entities.ts` 中转）
- `src/io/mapIO.ts` — wire 端的格式
- `src/types/inspectorSchema.ts` — Lane 等表单的类型
- `src/lib/enumLabels.ts` — enum 类型

## 源码索引

| 行      | 内容                                                                  |
| ------- | --------------------------------------------------------------------- |
| 11–14   | imports + `PointENU` re-export                                        |
| 20–31   | `SourceDrawInfo` / `SourceRectInfo`                                   |
| 36–71   | 几何基础 (`ApolloPolygon` / `LineSegment` / `CurveSegment` / `Curve`) |
| 74–164  | Lane（含 enum + Boundary + Sample + Entity）                          |
| 168–183 | Junction                                                              |
| 187–203 | Parking                                                               |
| 207–252 | Signal + Subsignal                                                    |
| 256–262 | Crosswalk                                                             |
| 266–282 | StopSign                                                              |
| 286–292 | SpeedBump                                                             |
| 296–302 | YieldSign                                                             |
| 306–312 | ClearArea                                                             |
| 316–345 | Road                                                                  |
| 349–398 | Overlap                                                               |
| 402–424 | PNCJunction                                                           |
| 428–438 | BarrierGate                                                           |
| 442–447 | RSU                                                                   |
| 451–460 | Area                                                                  |
| 464–471 | SpeedControl                                                          |
| 476–496 | `ApolloEntity` union + `ApolloEntityType`                             |
| 500–538 | `MapProjection` / `MapHeader` / `ApolloMapProto`                      |
| 547–555 | `getSource` / `getSourceRect`                                         |

## 参见

- [`entities`](./entities.md) —— `MapEntity = DrawingEntity | ApolloEntity`
- [`enumLabels`](../lib/enum-labels.md) —— enum → 显示名
- [`entityOps`](../lib/entity-ops.md) —— proto-aware 操作的唯一入口
- `src/proto/` —— 原始 .proto 文件
- `ARCHITECTURE.md` "Anti-corruption layer (R2)" —— 设计动机
