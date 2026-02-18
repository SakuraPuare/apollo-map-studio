# geo/overlapCalc

Spatial intersection detection between lanes and other map elements, producing `ApolloOverlap` proto objects.

## computeAllOverlaps

```ts
function computeAllOverlaps(params: {
  lanes: LaneFeature[]
  crosswalks: CrosswalkFeature[]
  signals: SignalFeature[]
  stopSigns: StopSignFeature[]
  junctions: JunctionFeature[]
  clearAreas: ClearAreaFeature[]
  speedBumps: SpeedBumpFeature[]
}): ComputedOverlap[]
```

Iterates all lane × element pairs and detects spatial intersections. Returns one `ComputedOverlap` per detected overlap.

**Returns**

Each `ComputedOverlap` contains:

```ts
interface ComputedOverlap {
  overlap: ApolloOverlap // ready-to-include proto object
  laneOverlapIds: Record<string, string[]> // laneId → overlap ID list
}
```

`laneOverlapIds` is a cumulative map built across all overlaps — `buildBaseMap` uses it to populate `ApolloLane.overlap_id[]`.

---

## Intersection methods by element type

### Lane vs Polygon (crosswalk, clear area)

```ts
const polyLine = turf.polygonToLine(polygon) as Feature<LineString>
const intersections = turf.lineIntersect(centerLine, polyLine)
```

For each intersection point, `nearestPointOnLine` computes `s` on the centerline. The overlap s-range is `[min(s), max(s)]`.

### Lane vs Line (signal stop line, stop sign, speed bump)

```ts
const intersections = turf.lineIntersect(centerLine, stopLine)
```

Single intersection → s-point ± 0.5 m, clamped to `[0, laneLength]`.

### Lane vs Junction

```ts
const midPt = turf.point(centerLine.geometry.coordinates[Math.floor(n / 2)])
const inside = turf.booleanPointInPolygon(midPt, junction.polygon)
```

If inside: s-range = `[0, laneLength]` (entire lane is in junction).

---

## ComputedOverlap

```ts
interface ComputedOverlap {
  overlap: ApolloOverlap
  laneOverlapIds: Record<string, string[]>
}
```

The `overlap.object` array contains exactly two entries:

1. The lane, with `laneOverlapInfo: { startS, endS, isMerge: false }`
2. The other element, with the appropriate `*OverlapInfo: {}` field set

**Overlap ID format:** `overlap_N` where N increments from 1 per `computeAllOverlaps` call (counter resets on each call).
