---
title: Map elements
description: Catalogue of every editable Apollo HD Map element in Apollo Map Studio — geometry, fields, default tools, and inspector surface.
---

# Map elements

The 12 ToolStrip elements map to Apollo HD-Map proto types in `src/types/apollo.ts`. Four additional types (road, overlap, rsu, speedControl) are managed via the LayerTree / Inspector rather than the ToolStrip.

## Quick reference

| Element         | Geometry                            | Default tool    | Color (`elements.ts`) |
| --------------- | ----------------------------------- | --------------- | --------------------- |
| lane            | line (central curve + 2 boundaries) | drawBezier      | `#4a9eff`             |
| junction        | polygon                             | drawPolygon     | `#ffcc00`             |
| pncJunction     | polygon                             | drawPolygon     | `#ff9933`             |
| parkingSpace    | polygon (rect)                      | drawRotatedRect | `#7c5cbf`             |
| crosswalk       | polygon (rect)                      | drawRotatedRect | `#ffffff`             |
| signal          | line + polygon                      | drawBezier      | `#22cc44`             |
| stopSign        | line                                | drawBezier      | `#ff0000`             |
| speedBump       | line                                | drawBezier      | `#ffaa00`             |
| yieldSign       | line                                | drawBezier      | `#ff6600`             |
| clearArea       | polygon                             | drawRotatedRect | `#ff4466`             |
| barrierGate     | line + polygon                      | drawBezier      | `#aa66ff`             |
| area            | polygon                             | drawPolygon     | `#66aaff`             |
| road \*         | container                           | (LayerTree)     | —                     |
| overlap \*      | derived                             | (auto)          | —                     |
| rsu \*          | metadata                            | (LayerTree)     | —                     |
| speedControl \* | polygon                             | (Inspector)     | —                     |

`*` LayerTree / Inspector only.

## Element details

### Lane

```ts
interface LaneEntity {
  centralCurve: Curve;
  leftBoundary: LaneBoundary;
  rightBoundary: LaneBoundary;
  length?: number;
  type: 'NONE' | 'CITY_DRIVING' | 'BIKING' | 'SIDEWALK' | 'PARKING' | 'SHOULDER' | 'SHARED';
  turn: 'NO_TURN' | 'LEFT_TURN' | 'RIGHT_TURN' | 'U_TURN';
  direction: 'FORWARD' | 'BACKWARD' | 'BIDIRECTION';
  speedLimit?: number;
  predecessorIds;
  successorIds;
  selfReverseLaneIds;
  leftNeighborForwardIds;
  rightNeighborForwardIds;
  leftNeighborReverseIds;
  rightNeighborReverseIds;
  junctionId;
  overlapIds;
  leftSamples;
  rightSamples;
  leftRoadSamples;
  rightRoadSamples;
}
```

See [Drawing lanes](./drawing-lanes.md).

### Junction / PNC Junction

```ts
interface JunctionEntity {
  polygon;
  type?: JunctionType;
}
interface PNCJunctionEntity {
  polygon;
  passageGroups: PassageGroup[];
}
```

### ParkingSpace

```ts
interface ParkingSpaceEntity {
  polygon;
  heading: number;
  _sourceRect?: { p1; p2; rotation };
}
```

Default `drawRotatedRect`; the source rectangle drives reverse-edit (rotation handle).

### Crosswalk

```ts
interface CrosswalkEntity {
  polygon;
  _sourceRect?;
}
```

### Signal

```ts
interface SignalEntity {
  boundary: ApolloPolygon;
  subsignals: Subsignal[];
  type:
    | 'UNKNOWN_SIGNAL'
    | 'MIX_2_HORIZONTAL'
    | 'MIX_2_VERTICAL'
    | 'MIX_3_HORIZONTAL'
    | 'MIX_3_VERTICAL'
    | 'SINGLE';
  stopLines: Curve[];
  signInfo: SignInfo[];
}
```

`drawBezier` lays the stop line; SignalTemplate auto-places a standard signal box.

### StopSign / YieldSign

Both store `stopLines: Curve[]`. `StopSign` has an additional `type` enum (`ONE_WAY`/`TWO_WAY`/.../`ALL_WAY`).

### SpeedBump

`position: Curve[]`.

### ClearArea

Polygon, with `_sourceRect` for rect source.

### BarrierGate

```ts
interface BarrierGateEntity {
  type: 'ROD' | 'FENCE' | 'ADVERTISING' | 'TELESCOPIC' | 'OTHER';
  polygon;
  stopLines: Curve[];
}
```

### Area

```ts
interface AreaEntity {
  type: 'Driveable' | 'UnDriveable' | 'Custom1' | 'Custom2' | 'Custom3';
  polygon;
  name?: string;
}
```

### Road / Overlap / RSU / SpeedControl

Road groups sections that group lanes. Overlap is geometry-derived. RSU carries `junctionId` only. SpeedControl is polygon + speedLimit (m/s).

## Options table

| Field            | Where                                                                                         | Notes                                     |
| ---------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `entityType`     | every entity                                                                                  | discriminator                             |
| `polygon`        | junction, pncJunction, parkingSpace, crosswalk, clearArea, area, signal.boundary, barrierGate | `ApolloPolygon { points: PointENU[] }`    |
| `Curve`          | lane.centralCurve / boundaries / stopLines / position                                         | `segments[].lineSegment.points`           |
| `_source`        | lane / signal / stopSign / yieldSign / speedBump / barrierGate                                | preserves drawTool + anchors / arc points |
| `_sourceRect`    | parkingSpace / crosswalk / clearArea                                                          | `{ p1, p2, rotation }`                    |
| `_userOverrides` | lane / parkingSpace / overlap                                                                 | locks paths from reconcile                |
| `overlapIds`     | most entities                                                                                 | synced from reconcileOverlaps             |

## Shortcut cheatsheet

| Action         | Key / Mouse                  |
| -------------- | ---------------------------- |
| Pick element   | ToolStrip icon               |
| Pick tool      | ToolStrip secondary / letter |
| Select entity  | click                        |
| Inspector      | follows selection            |
| LayerTree jump | click tree node              |
| Delete         | `Delete`                     |

## Troubleshooting

### parkingSpace rotation lost on reload

`_sourceRect` is the rotation source. Edit via the rotation handle, not raw polygon vertices.

### Signal lacks boundary

Both boundary (signal box) and stopLines are required for dreamview compatibility.

### Area `Custom1` lost on export

Only the five `AreaType` strings round-trip; unrecognised values fall back to `Driveable`.

### Overlap missing in LayerTree

`Overlaps` group only appears when `reconcileOverlaps` produced any overlaps.

### LayerTree drag rejected

`canReparent` blocks invalid combinations. Check `console.warn('[LayerTree] reparent rejected:', ...)`.

## Source links

- `src/core/elements.ts:49-158`
- `src/types/apollo.ts:118-538`
- `src/components/layout/panels/InspectorForms.tsx`
- `src/components/layout/panels/LayerTree.tsx`
- `src/components/layout/panels/LayerTree/treeBuilder.ts`
- `src/components/layout/panels/MapOutline.tsx`

## See also

- [Drawing lanes](./drawing-lanes.md)
- [Topology](./topology.md)
- [Topology and junctions](./topology-and-junctions.md)
- [Layer tree](./layer-tree.md)
