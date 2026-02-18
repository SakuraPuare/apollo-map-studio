# export/buildSimMap

Produces a downsampled `ApolloMap` for Dreamview visualization, porting `sim_map_generator.cc`.

## buildSimMap

```ts
function buildSimMap(baseMap: ApolloMap): ApolloMap
```

Takes a fully-built base map and returns a new `ApolloMap` with:

- All lane curves downsampled (fewer points)
- `left_sample`, `right_sample`, `left_road_sample`, `right_road_sample` removed from all lanes
- All non-lane elements preserved unchanged

**Example**

```ts
const base = await buildBaseMap(state)
const sim = buildSimMap(base)
const bytes = await encodeMap(sim)
downloadBinary(bytes, 'sim_map.bin')
```

---

## downsampleByAngle

```ts
function downsampleByAngle(
  points: number[][],
  threshold?: number // default: Math.PI / 180 (1°)
): number[][]
```

Removes intermediate points whose bearing change from the previous to the next point is below `threshold`. Always keeps the first and last point.

**Algorithm (from `points_downsampler.h`)**

```
for i in 1..n-2:
  delta_heading = |bearing(points[i-1]→points[i]) - bearing(points[i]→points[i+1])|
  if delta_heading >= threshold: keep points[i]
```

---

## downsampleByDistance

```ts
function downsampleByDistance(
  points: number[][],
  normalInterval?: number, // default: 5 m
  steepInterval?: number // default: 1 m
): number[][]
```

Keeps one point per `normalInterval` meters. On steep curves (heading change > π/4 = 45°), uses `steepInterval` instead to preserve curve fidelity.

---

## Application scope

Both passes are applied to every `CurveSegment.lineSegment.point[]` in:

- `lane.central_curve`
- `lane.left_boundary.curve`
- `lane.right_boundary.curve`

This reduces the point count of a typical city-driving lane from ~100+ points (1 m sampling) to ~20–30 points, significantly reducing the sim_map file size and Dreamview rendering load.
