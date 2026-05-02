---
title: io / proto-entity-bridge
description: src/io/proto/entityBridge.ts + entityBridge/* — Apollo proto plain object ↔ MapEntity 双向桥
---

# io / proto-entity-bridge

`src/io/proto/entityBridge.ts` 是 Apollo proto plain object 与
`MapEntity` 之间的双向桥。它通过 re-export 把多个子模块组成统一表面，
内部按 entity 类型拆分到子文件，方便逐个维护。

## 顶层 facade（src/io/proto/entityBridge.ts）

```ts
export {
  convertPolygonFromProto,
  convertPolygonToProto,
  curveFromProto,
  curveToProto,
  unwrapId,
  unwrapIdArray,
  wrapId,
  wrapIdArray,
} from './entityBridge/common';

export {
  entityToRawLane,
  entityToRawRoad,
  rawLaneToEntity,
  rawRoadToEntity,
} from './entityBridge/laneRoad';

export { apolloMapToEntities, entitiesToApolloMap } from './entityBridge/map';

export { entityToRawOverlap, rawOverlapToEntity } from './entityBridge/overlap';

export {
  entityToRawArea,
  entityToRawBarrierGate,
  entityToRawClearArea,
  entityToRawCrosswalk,
  entityToRawJunction,
  entityToRawParkingSpace,
  entityToRawPNCJunction,
  entityToRawRSU,
  entityToRawSignal,
  entityToRawSpeedBump,
  entityToRawStopSign,
  entityToRawYieldSign,
  rawAreaToEntity,
  rawBarrierGateToEntity,
  rawClearAreaToEntity,
  rawCrosswalkToEntity,
  rawJunctionToEntity,
  rawParkingSpaceToEntity,
  rawPNCJunctionToEntity,
  rawRSUToEntity,
  rawSignalToEntity,
  rawSpeedBumpToEntity,
  rawStopSignToEntity,
  rawYieldSignToEntity,
} from './entityBridge/simpleEntities';
```

> Source: `src/io/proto/entityBridge.ts:1-44`

## 子模块详情

### `entityBridge/common.ts`

```ts
export interface RawId {
  id?: string;
}
export interface RawPoint {
  x?: number;
  y?: number;
  z?: number;
}
export interface RawPolygon {
  point?: RawPoint[];
}
export interface RawLineSegment {
  point?: RawPoint[];
}
export interface RawCurveSegment {
  line_segment?: RawLineSegment;
  s?: number;
  start_position?: RawPoint;
  heading?: number;
  length?: number;
}
export interface RawCurve {
  segment?: RawCurveSegment[];
}

export function unwrapId(idMsg: RawId | undefined): string | null;
export function wrapId(id: string): RawId;
export function unwrapIdArray(arr: RawId[] | undefined): string[];
export function wrapIdArray(ids: string[]): RawId[];
export function pointFromProto(p: RawPoint): PointENU;
export function pointToProto(p: PointENU): RawPoint;
export function convertPolygonFromProto(p: RawPolygon | undefined): ApolloPolygon;
export function convertPolygonToProto(p: ApolloPolygon): RawPolygon;
export function curveFromProto(c: RawCurve | undefined): Curve;
export function curveToProto(c: Curve): RawCurve;
export function curveArrayFromProto(arr: RawCurve[] | undefined): Curve[];
export function curveArrayToProto(arr: Curve[]): RawCurve[];
```

`pointFromProto / pointToProto` 在 `z === undefined` 时不写入 `z=0`，
保住 round-trip wire fidelity。

### `entityBridge/enums.ts`

提供 13 张数字 ↔ 字符串映射表（`LANE_TYPE / LANE_TURN / LANE_DIRECTION
/ JUNCTION_TYPE / ROAD_TYPE / BOUNDARY_EDGE_TYPE / STOP_SIGN_TYPE /
SIGNAL_TYPE / SUBSIGNAL_TYPE / SIGN_INFO_TYPE / PASSAGE_TYPE /
BARRIER_GATE_TYPE / AREA_TYPE / LANE_BOUNDARY_LINE_TYPE`）以及配套的
`*_INV` 反向映射，并暴露三个工具：

```ts
export function enumFromProto<T extends string>(
  table: Record<number, T>,
  v: number | undefined,
  fallback: T,
): T;
export function enumFromProtoOptional<T extends string>(
  table: Record<number, T>,
  v: number | undefined,
): T | undefined;
export function enumToProto<T extends string>(table: Record<T, number>, v: T): number;
```

`enumFromProtoOptional` 用于 `road.type / junction.type / stop_sign.type`
等"未设值时不要 synthesise 0"的字段。

### `entityBridge/laneRoad.ts`

```ts
export interface RawLane {
  /* 24 field 协议结构 */
}
export interface RawRoad {
  /* sections + junction_id + type */
}
export function rawLaneToEntity(raw: RawLane): LaneEntity | null;
export function entityToRawLane(e: LaneEntity): RawLane;
export function rawRoadToEntity(raw: RawRoad): RoadEntity | null;
export function entityToRawRoad(e: RoadEntity): RawRoad;
```

实现里把 `central_curve / left_boundary / right_boundary /
boundary_type / left_sample / right_sample / left_road_sample /
right_road_sample / overlap_id / predecessor_id / successor_id /
left_neighbor_forward_lane_id / right_neighbor_forward_lane_id /
left_neighbor_reverse_lane_id / right_neighbor_reverse_lane_id /
self_reverse_lane_id / junction_id / type / turn / direction /
length / speed_limit` 全部双向化。

### `entityBridge/overlap.ts`

```ts
export interface RawOverlap {
  id?: RawId;
  object?: RawObjectOverlapInfo[];
  region_overlap?: RawRegionOverlapInfo[];
}
export function rawOverlapToEntity(raw: RawOverlap): OverlapEntity | null;
export function entityToRawOverlap(e: OverlapEntity): RawOverlap;
```

支持 13 种 ObjectOverlapInfo 子分支（lane / signal / stopSign /
crosswalk / junction / yieldSign / clearArea / speedBump / parkingSpace
/ pncJunction / rsu / area / barrierGate）+ "unknown" 透传分支。

### `entityBridge/simpleEntities.ts` 与子目录

```ts
// simpleEntities.ts re-exports basic / misc / pncJunction / signal
export * from './simpleEntities/basic';
export * from './simpleEntities/misc';
export * from './simpleEntities/pncJunction';
export * from './simpleEntities/signal';
```

- `basic.ts`：crosswalk / junction / clearArea / parkingSpace / stopSign
  / yieldSign / speedBump（以及对应 Raw 类型）。
- `misc.ts`：barrierGate / rsu / area。
- `pncJunction.ts`：pncJunction + passage groups。
- `signal.ts`：signal + subsignal + signInfo。

每个文件都遵循 `raw<Entity>ToEntity` / `entityToRaw<Entity>` 对称
导出。

### `entityBridge/map.ts`

```ts
export function apolloMapToEntities(map: RawApolloMap): MapEntity[];
export function entitiesToApolloMap(
  baseMap: Record<string, unknown>,
  entities: MapEntity[],
): Record<string, unknown>;
```

`BRIDGES` 数组（15 行）定义了 entity 类型与 proto field 的对应关系，
按"出现顺序"决定导出 entities 的稳定排序。`apolloMapToEntities` 顺序
遍历 `BRIDGES` × 各自的 `map[field]` 数组；
`entitiesToApolloMap` 把 `entities` 按 `entityType` 分桶，再按
`BRIDGES` 顺序写回。

## 不变量

- 所有 `raw<Entity>ToEntity` 在 id 缺失时返回 `null`，`apolloMapToEntities`
  用 `pushIfNotNull` 跳过；
- `entityToRaw<Entity>` 不会主动 synthesise proto2 缺省值（参考
  `enumFromProtoOptional` 注释），避免 `road.type=0 / junction.type=0`
  这类 phantom byte 在 round-trip 里漏出来；
- `lane.junctionId` 在导出时若为 `null` 直接不写 `junction_id` 字段。
