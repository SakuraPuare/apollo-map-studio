# geo/laneGeometry

Lane boundary computation, width sampling, and heading calculations using `@turf/turf`.

## computeBoundaries

```ts
function computeBoundaries(
  centerLine: Feature<LineString>,
  widthMeters: number
): {
  left: Feature<LineString>
  right: Feature<LineString>
}
```

Computes left and right boundary lines by offsetting the centerline by `±widthMeters/2`.

Uses `turf.lineOffset(centerLine, distance, { units: 'meters' })`.

**Parameters**

| Name          | Type                  | Description               |
| ------------- | --------------------- | ------------------------- |
| `centerLine`  | `Feature<LineString>` | Lane centerline in WGS84  |
| `widthMeters` | `number`              | Full lane width in meters |

**Example**

```ts
const { left, right } = computeBoundaries(lane.centerLine, lane.width)
// left and right are LineString features parallel to centerLine
```

---

## computeLaneSamples

```ts
function computeLaneSamples(
  centerLine: Feature<LineString>,
  halfWidthMeters: number
): LaneSampleAssociation[]
```

Returns a `LaneSampleAssociation[]` sampled every 1 m along the centerline. Each sample stores `{ s, width }` where `s` is the arc-length position and `width` is `halfWidthMeters` (constant for uniform-width lanes).

Used to populate `ApolloLane.left_sample` and `right_sample`.

---

## sampleLineEveryMeter

```ts
function sampleLineEveryMeter(line: Feature<LineString>): Array<[number, number]>
```

Returns an array of `[lng, lat]` coordinates sampled every 1 m along the line using `turf.along`. Includes the start and end points.

---

## computeStartHeading

```ts
function computeStartHeading(centerLine: Feature<LineString>): number
```

Returns the bearing (degrees, 0 = north, clockwise) from the first to the second coordinate of the centerline. Used to set `CurveSegment.heading` in the exported proto.

---

## buildLanePolygon

```ts
function buildLanePolygon(left: Feature<LineString>, right: Feature<LineString>): Feature<Polygon>
```

Constructs a filled polygon from left and right boundary lines. The polygon is formed by:

1. Left boundary coordinates (start → end)
2. Right boundary coordinates (end → start, reversed)
3. Closing back to the left boundary start

Used by `MapEditor` to render the lane fill layer.

---

## laneMidpointInfo

```ts
function laneMidpointInfo(line: Feature<LineString>): { point: Feature<Point>; bearing: number }
```

Returns the midpoint of the line and the bearing at that point. Used by `MapEditor` to position and orient direction-arrow symbols.

---

## pointToS

```ts
function pointToS(line: Feature<LineString>, point: Feature<Point>): number
```

Returns the arc-length `s` (meters from start) of the nearest point on `line` to `point`. Wraps `turf.nearestPointOnLine(line, point).properties.location * turf.length(line)`.

---

## lineEndpoints

```ts
function lineEndpoints(line: Feature<LineString>): {
  start: [number, number]
  end: [number, number]
}
```

Returns the first and last coordinates of a `LineString` feature.
