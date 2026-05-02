---
title: types/apollo — Apollo HD Map proto types
description: Hand-maintained TypeScript types matching modules/common_msgs/map_msgs/*.proto. Models proto2 optional fields strictly via `?:`.
---

# `types/apollo` — Apollo HD Map proto types

> Source: `src/types/apollo.ts` · 556 lines · 17 entity interfaces · proto2-strict

## Purpose

Apollo HD Map entities live in `modules/common_msgs/map_msgs/*.proto`. This file is the TypeScript mirror of those messages. **All proto2 optional fields use `?:`** — the bridge does not synthesise `0` / `{0,0}` for absent values, so a round-trip through import → export preserves "field was absent" rather than emitting spurious zero bytes on the wire.

The proto source files live in `src/proto/`; this file is hand-maintained (not generated) so it can carry comments, accessor helpers, and editor-only `_source` extensions.

## API at a glance

| Group               | Count | Members                                                                                    |
| ------------------- | ----- | ------------------------------------------------------------------------------------------ |
| Geometry primitives | 5     | `PointENU`, `ApolloPolygon`, `LineSegment`, `CurveSegment`, `Curve`                        |
| Lane support        | 6     | `LaneType`, `LaneTurn`, `LaneDirection`, `BoundaryLineType`, `LaneBoundary`, `LaneEntity`… |
| Entities            | 17    | `LaneEntity`, `JunctionEntity`, `RoadEntity`, … `SpeedControlEntity`                       |
| Overlap             | 4     | `LaneOverlapInfo`, `RegionOverlapInfo`, `ObjectOverlapInfo`, `OverlapEntity`               |
| Container           | 3     | `MapHeader`, `MapProjection`, `ApolloMapProto`                                             |
| Editor extensions   | 4     | `SourceDrawInfo`, `SourceRectInfo`, `getSource`, `getSourceRect`                           |

## Editor extensions

Non-proto, "\_"-prefixed editor fields:

### `interface SourceDrawInfo`

```ts
export interface SourceDrawInfo {
  drawTool: string; // 'drawBezier' | 'drawArc' | 'drawCatmullRom' | …
  anchors?: BezierAnchorData[]; // drawBezier
  arcPoints?: [GeoPoint, GeoPoint, GeoPoint]; // drawArc
}
```

Lives on `LaneEntity._source`, `SignalEntity._source`, etc., so a selected entity can be re-edited with the same handles used during creation (see [`geoJsonHelpers`](../lib/geo-json-helpers.md)).

### `interface SourceRectInfo`

```ts
export interface SourceRectInfo {
  p1: GeoPoint;
  p2: GeoPoint;
  rotation: number;
}
```

For rectangle-shaped Apollo entities — `ParkingSpaceEntity._sourceRect`, `CrosswalkEntity._sourceRect`, `ClearAreaEntity._sourceRect`.

### `_userOverrides`

```ts
_userOverrides?: string[];
```

Lives on `LaneEntity` / `ParkingSpaceEntity` / `OverlapEntity`. Records form-field paths the user has manually set; derive rules whose `owns` overlap this list will skip on subsequent geometry edits.

## Geometry primitives

### `type PointENU`

```ts
export type PointENU = GeoPoint;
```

Historical name retained — but every PointENU inside the editor is already WGS84 lng/lat (`x = lng, y = lat`). The wire ↔ JS projection happens in `proto-loader.ts`.

### `interface ApolloPolygon`

```ts
export interface ApolloPolygon {
  points: PointENU[];
}
```

Not necessarily convex; first/last point not necessarily equal (proto2 makes no guarantee).

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

`s` / `startPosition` / `heading` / `length` are missing on many real fields (`stop_line`, `road.section.boundary`, `lane.left/right_boundary.curve` …). Bridge **must preserve absence**.

## Lane

### Enums

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
  | 'NONE'
  | 'CITY_DRIVING'
  | 'BIKING'
  | 'SIDEWALK'
  | 'PARKING'
  | 'SHOULDER'
  | 'SHARED';

export type LaneTurn = 'NO_TURN' | 'LEFT_TURN' | 'RIGHT_TURN' | 'U_TURN';

export type LaneDirection = 'FORWARD' | 'BACKWARD' | 'BIDIRECTION';
```

### `interface LaneBoundary`

```ts
export interface LaneBoundary {
  curve: Curve;
  length?: number;
  virtual?: boolean;
  boundaryType: LaneBoundaryTypeEntry[]; // ascending s
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

  // geometry
  centralCurve: Curve;
  leftBoundary: LaneBoundary;
  rightBoundary: LaneBoundary;
  length?: number;

  // attributes
  type: LaneType;
  turn: LaneTurn;
  direction: LaneDirection;
  speedLimit?: number; // m/s, proto2 optional

  // topology (flat ID references)
  predecessorIds: string[];
  successorIds: string[];
  leftNeighborForwardIds: string[];
  rightNeighborForwardIds: string[];
  leftNeighborReverseIds: string[];
  rightNeighborReverseIds: string[];
  selfReverseLaneIds: string[];
  junctionId: string | null;
  overlapIds: string[];

  // width samples
  leftSamples: LaneSampleAssociation[];
  rightSamples: LaneSampleAssociation[];
  leftRoadSamples: LaneSampleAssociation[];
  rightRoadSamples: LaneSampleAssociation[];

  // editor extensions
  _source?: SourceDrawInfo;
  _userOverrides?: string[];
}
```

Source: `apollo.ts:118-164`.

## Junction

```ts
export type JunctionType =
  | 'UNKNOWN'
  | 'IN_ROAD'
  | 'CROSS_ROAD'
  | 'FORK_ROAD'
  | 'MAIN_SIDE'
  | 'DEAD_END';

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
  | 'UNKNOWN_STOP_SIGN'
  | 'ONE_WAY'
  | 'TWO_WAY'
  | 'THREE_WAY'
  | 'FOUR_WAY'
  | 'ALL_WAY';
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

The most complex entity — geometric and semantic intersection of multiple objects.

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

`unknown` is a pass-through variant: real Apollo maps in the wild contain overlap entries whose `overlap_info` oneof is unset (for lane↔crosswalk pairs). Without this variant the bridge would drop them and lose data on round-trip.

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

The discriminator `entityType` is a literal string, so TS narrows the union automatically when you check it.

## Top-level container

```ts
export interface MapProjection {
  proj: string; // PROJ.4 string
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

`_source` / `_sourceRect` only exist on a subset of variants; these helpers centralise the cast so call sites stay clean.

## proto2 optional summary

Bridge **must** preserve "absent" semantics for:

| Field                                                       | Where                                 |
| ----------------------------------------------------------- | ------------------------------------- |
| `CurveSegment.s / startPosition / heading / length`         | Real maps frequently omit             |
| `LaneBoundary.length`                                       | Same                                  |
| `LaneEntity.length / speedLimit`                            | Same                                  |
| `JunctionEntity.type`                                       | Same                                  |
| `Subsignal.location`                                        | Apollo comment: "now no data support" |
| `StopSignEntity.type`                                       | Same                                  |
| `RoadEntity.type`                                           | Same                                  |
| `LaneOverlapInfo.startS / endS / isMerge / regionOverlapId` | oneof skip                            |
| `ObjectOverlapInfo` `unknown` variant                       | oneof unset                           |

## Side effects

None — pure types plus two no-op accessors.

## Test coverage

No standalone test; the contract with the zod / wire layer is verified by `src/io/__tests__/protoLoader.test.ts` (round-trip preserves all fields).

## Consumers

Imported by nearly every module in the project:

- `src/lib/entityOps/*.ts` — types + casts
- `src/store/mapStore.ts` — `MapEntity` source (via `entities.ts`)
- `src/io/mapIO.ts` — wire-side format
- `src/types/inspectorSchema.ts` — Lane form types
- `src/lib/enumLabels.ts` — enum types

## Source map

| Lines   | Content                                          |
| ------- | ------------------------------------------------ |
| 11–14   | imports + `PointENU` re-export                   |
| 20–31   | `SourceDrawInfo` / `SourceRectInfo`              |
| 36–71   | Geometry primitives                              |
| 74–164  | Lane (enums + boundary + sample + entity)        |
| 168–183 | Junction                                         |
| 187–203 | Parking                                          |
| 207–252 | Signal + Subsignal                               |
| 256–262 | Crosswalk                                        |
| 266–282 | StopSign                                         |
| 286–292 | SpeedBump                                        |
| 296–302 | YieldSign                                        |
| 306–312 | ClearArea                                        |
| 316–345 | Road                                             |
| 349–398 | Overlap                                          |
| 402–424 | PNCJunction                                      |
| 428–438 | BarrierGate                                      |
| 442–447 | RSU                                              |
| 451–460 | Area                                             |
| 464–471 | SpeedControl                                     |
| 476–496 | `ApolloEntity` union + `ApolloEntityType`        |
| 500–538 | `MapProjection` / `MapHeader` / `ApolloMapProto` |
| 547–555 | `getSource` / `getSourceRect`                    |

## See also

- [`entities`](./entities.md) — `MapEntity = DrawingEntity | ApolloEntity`
- [`enumLabels`](../lib/enum-labels.md) — enum → display label
- [`entityOps`](../lib/entity-ops.md) — sole proto-aware operations entry
- `src/proto/` — original .proto files
- `ARCHITECTURE.md` "Anti-corruption layer (R2)"
