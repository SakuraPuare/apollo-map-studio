---
title: Apollo Types
description: Field-level reference for every exported TypeScript type and interface in src/types/apollo.ts.
---

# Apollo Types

This page expands every exported type and interface in `src/types/apollo.ts`
(~556 lines). The TypeScript layer mirrors the [Proto Schema](/en/reference/proto-schema)
one-to-one but adds:

- Editor-only fields (`_source`, `_sourceRect`, `_userOverrides`) that ride
  through proto2 unknown-field retention.
- Discriminated unions (`ApolloEntity`, `ObjectOverlapInfo`) for ergonomic
  narrowing.
- Annotated proto2 `optional` rules captured directly in the TS comments.

::: tip Convention

- Line refs such as `src/types/apollo.ts:42-58` point at real positions in
  the current commit.
- Types appear in the same order as in the source file so cross-checking is
  trivial.
  :::

## File map

| Region                    | Lines   | Contents                                                |
| ------------------------- | ------- | ------------------------------------------------------- |
| Editor extensions         | 11–32   | `SourceDrawInfo`, `SourceRectInfo`                      |
| `map_geometry.proto`      | 33–70   | `ApolloPolygon`, `LineSegment`, `CurveSegment`, `Curve` |
| `map_lane.proto`          | 72–164  | Full Lane stack                                         |
| `map_junction.proto`      | 166–183 | `JunctionType`, `JunctionEntity`                        |
| `map_parking_space.proto` | 185–203 | `ParkingSpaceEntity`, `ParkingLotEntity`                |
| `map_signal.proto`        | 205–252 | `Subsignal`, `SignInfo`, `Signal` family                |
| `map_crosswalk.proto`     | 254–262 | `CrosswalkEntity`                                       |
| `map_stop_sign.proto`     | 264–282 | `StopSignType`, `StopSignEntity`                        |
| `map_speed_bump.proto`    | 284–292 | `SpeedBumpEntity`                                       |
| `map_yield_sign.proto`    | 294–302 | `YieldSignEntity`                                       |
| `map_clear_area.proto`    | 304–312 | `ClearAreaEntity`                                       |
| `map_road.proto`          | 314–345 | `BoundaryEdge` ~ `RoadEntity`                           |
| `map_overlap.proto`       | 347–398 | Overlap family                                          |
| `map_pnc_junction.proto`  | 400–424 | PNC junctions                                           |
| `map_barrier_gate.proto`  | 426–438 | BarrierGate                                             |
| `map_rsu.proto`           | 440–447 | RSU                                                     |
| `map_area.proto`          | 449–460 | Area                                                    |
| `map_speed_control.proto` | 462–471 | SpeedControl                                            |
| Apollo unions             | 473–497 | `ApolloEntity`, `ApolloEntityType`                      |
| `map.proto` top-level     | 499–538 | `MapProjection`, `MapHeader`, `ApolloMapProto`          |
| Editor accessors          | 540–555 | `getSource()`, `getSourceRect()`                        |

## Editor extensions

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

| Field                      | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `SourceDrawInfo.drawTool`  | Originating tool id (`polyline`, `bezier`, `catmull-rom`, `arc`, ...).     |
| `SourceDrawInfo.anchors`   | Bezier / Catmull-Rom anchor list, allowing handle-editing on re-selection. |
| `SourceDrawInfo.arcPoints` | Three points for an arc (start / mid / end).                               |
| `SourceRectInfo`           | Diagonal corners plus rotation for a rectangle, supporting rotate-edit.    |

## Geometric primitives

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

::: warning proto2 optional rule
`s / startPosition / heading / length` are all `optional`:

- Do not synthesise `0` or `{x:0,y:0}` when missing — re-encode would write
  spurious wire bytes.
- Preserve `undefined` for genuinely absent values.
  :::

## Lane family

### Boundary types

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
A list of field paths the user has manually overridden via the inspector.
The derive engine respects this list and does **not** clobber those paths
during auto-recomputation. See [Derive Engine](/en/architecture/derive-engine).
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

## Signal family

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

## Road family

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

## Overlap family

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

::: warning Why the `unknown` variant
Some real Apollo maps omit the `overlap_info` oneof on `lane↔crosswalk`
overlap entries. The previous bridge dropped these silently, losing data
on round-trip. The `unknown` variant exists purely to pass these entries
through.
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

## Apollo entity union

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

::: tip Narrowing pattern

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

Prefer routing all writes through [`entityOps`](/en/architecture/entityops)
rather than narrowing inline.
:::

## Top-level Map container

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

::: tip Why these helpers exist
`_source` and `_sourceRect` are not declared on every union variant.
Reading `entity._source` before narrowing yields `never`. These accessors
isolate the cast in one place rather than scattering it across call sites.
:::

## Field-difference cheatsheet

| Type              | proto2 optional fields                         | Editor-only fields          |
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

## Related pages

- [Proto Schema](/en/reference/proto-schema)
- [Enum Mappings](/en/reference/enum-mappings)
- [entityOps anti-corruption layer](/en/architecture/entityops)
- [Inspector schema](/en/architecture/inspector-schema)
- [Derive engine](/en/architecture/derive-engine)
- [Architecture overview](/en/architecture/overview)
