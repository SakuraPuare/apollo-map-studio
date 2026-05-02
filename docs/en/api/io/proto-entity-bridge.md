---
title: io / proto-entity-bridge
description: src/io/proto/entityBridge.ts + entityBridge/* — bidirectional bridge between Apollo proto and MapEntity
---

# io / proto-entity-bridge

`src/io/proto/entityBridge.ts` is the bidirectional bridge between
the Apollo proto plain object and `MapEntity`. The top-level file is
a flat re-export; the implementation is split per entity type so
each file stays maintainable.

## Top-level facade

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

> Source: `src/io/proto/entityBridge.ts:1-44`.

## Sub-modules

### `entityBridge/common.ts`

Shared raw shapes (`RawId`, `RawPoint`, `RawPolygon`, `RawLineSegment`,
`RawCurveSegment`, `RawCurve`) and helpers:

```ts
export function unwrapId(idMsg): string | null;
export function wrapId(id): RawId;
export function unwrapIdArray(arr): string[];
export function wrapIdArray(ids): RawId[];
export function pointFromProto(p): PointENU;
export function pointToProto(p): RawPoint;
export function convertPolygonFromProto(p): ApolloPolygon;
export function convertPolygonToProto(p): RawPolygon;
export function curveFromProto(c): Curve;
export function curveToProto(c): RawCurve;
export function curveArrayFromProto(arr): Curve[];
export function curveArrayToProto(arr): RawCurve[];
```

`pointFromProto` / `pointToProto` preserve `z` absence so a
round-tripped point that lacked `z` on the wire stays absent on
re-encode.

### `entityBridge/enums.ts`

13 numeric ↔ string maps (`LANE_TYPE`, `LANE_TURN`,
`LANE_DIRECTION`, `JUNCTION_TYPE`, `ROAD_TYPE`,
`BOUNDARY_EDGE_TYPE`, `STOP_SIGN_TYPE`, `SIGNAL_TYPE`,
`SUBSIGNAL_TYPE`, `SIGN_INFO_TYPE`, `PASSAGE_TYPE`,
`BARRIER_GATE_TYPE`, `AREA_TYPE`, `LANE_BOUNDARY_LINE_TYPE`) and
their `*_INV` reverses, plus:

```ts
export function enumFromProto<T extends string>(table, v, fallback): T;
export function enumFromProtoOptional<T extends string>(table, v): T | undefined;
export function enumToProto<T extends string>(table, v): number;
```

`enumFromProtoOptional` is required for fields where proto2's `= 0`
default is meaningful and must not be synthesised on export.

### `entityBridge/laneRoad.ts`

```ts
export interface RawLane {
  /* full 24-field shape */
}
export interface RawRoad {
  /* sections + junction_id + type */
}

export function rawLaneToEntity(raw: RawLane): LaneEntity | null;
export function entityToRawLane(e: LaneEntity): RawLane;
export function rawRoadToEntity(raw: RawRoad): RoadEntity | null;
export function entityToRawRoad(e: RoadEntity): RawRoad;
```

Carries every lane/road field bidirectionally — central curve,
boundaries, boundary types, samples, neighbour id arrays, junction
id, length, speed_limit, type, turn, direction, road sections +
boundaries.

### `entityBridge/overlap.ts`

```ts
export interface RawOverlap {
  /* ... */
}
export function rawOverlapToEntity(raw): OverlapEntity | null;
export function entityToRawOverlap(e): RawOverlap;
```

Supports 13 `ObjectOverlapInfo` sub-branches plus an `unknown`
pass-through for Apollo maps where the oneof arrives unset.

### `entityBridge/simpleEntities.ts` + folder

```ts
export * from './simpleEntities/basic'; // crosswalk / junction / clearArea / parkingSpace / stopSign / yieldSign / speedBump
export * from './simpleEntities/misc'; // barrierGate / rsu / area
export * from './simpleEntities/pncJunction'; // pncJunction + passage groups
export * from './simpleEntities/signal'; // signal + subsignal + signInfo
```

Each sub-file follows the symmetric `raw<Entity>ToEntity` /
`entityToRaw<Entity>` pair.

### `entityBridge/map.ts`

```ts
export function apolloMapToEntities(map: RawApolloMap): MapEntity[];
export function entitiesToApolloMap(
  baseMap: Record<string, unknown>,
  entities: MapEntity[],
): Record<string, unknown>;
```

Internal `BRIDGES` array maps proto fields to entityType discriminators
and is the only place to register a new entity. `apolloMapToEntities`
iterates `BRIDGES`, then each `map[field]`. `entitiesToApolloMap`
buckets by `entityType` and writes every bucket back in `BRIDGES`
order, pre-seeding empty buckets so unused entity types still emit
`[]`.

## Invariants

- `raw<Entity>ToEntity` returns `null` for id-missing entries;
  `apolloMapToEntities` filters with `pushIfNotNull`.
- `entityToRaw<Entity>` does not synthesise proto2 default values —
  see `enumFromProtoOptional` for the why.
- `lane.junction_id` is omitted when `lane.junctionId === null`,
  preserving round-trip equivalence.

## See also

- [Proto / Schema](/en/api/proto-schema) — schema layout.
- [io/proto-adapter](/en/api/io/proto-adapter) — produces the plain
  object this module consumes.
- [Store / Map](/en/api/store-map) — eventual destination of the
  typed `MapEntity[]`.
