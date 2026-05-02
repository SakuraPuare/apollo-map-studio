# Geometry: hitTest

> Source: `src/core/geometry/hitTest.ts`

## Overview

Distance helpers for picking entities from a cursor position. Two
parallel APIs:

- **Pure euclidean** (`pointToPolylineDist`, `pointToPolygonDist`) — treats
  `(lng, lat)` as the same unit space. Fast, but high-latitude shapes
  appear elongated north-south because 1 lng-degree is shorter than 1
  lat-degree above the equator. Kept for backwards compatibility +
  unit-test assertions.
- **Latitude-corrected** (`pointToPolylineDistGeo`,
  `pointToPolygonDistGeo`) — caller supplies `cosLat`; internally
  `Δlat` is multiplied by `1/cosLat` to bring it into the same unit as
  `Δlng`. The returned distance is in _lng-degree_ space, directly
  comparable to a pixel-derived radius. Used by the spatial worker's
  hit test.

The R4 bug fix that motivated the split: at latitude 40° the original
metric was wrong by a factor of ~1.31 in the lat direction, which made
hover priority ranking flicker between adjacent overlay entities.

::: info Sign convention for the correction
The correction is applied as "scale `Δlat` up to lng-units" rather than
"scale `Δlng` down to lat-units" so that the returned value's quantum
matches what callers already pass as `radius` (a pixel-to-lng-degree
conversion). Caller-side zero-diff for cold-layer code that already
threshold-checks against a lng-degree radius.
:::

## Exports

### Functions

#### `pointToPolylineDist(point, coords): number`

Pure-euclidean distance from a point to the closest segment in
`coords`. Returns `Infinity` if `coords` has fewer than 2 points.

#### `pointInPolygon(point, polygon): boolean`

Ray-casting point-in-polygon. The polygon may be open (caller does not
need to repeat the first point at the end). Used by both this module's
distance helpers and by `laneTopology` (re-imported).

#### `pointToPolygonDist(point, polygon): number`

Returns `0` when the point is inside the polygon; otherwise the
euclidean distance to the closest boundary segment. Auto-closes the
ring if the last point doesn't equal the first.

#### `pointToPolylineDistGeo(point, coords, cosLat): number`

Latitude-corrected distance. `cosLat` should be `cos(midLat × π/180)` —
either the polyline's mid-latitude or the cursor latitude (errors at
viewport scale are negligible).

Defensive clamp: `cosLat` < 1e-6 (very high latitudes, near the
poles) falls back to ≈1e-6 to avoid division-by-zero. The
spatial worker's hit test always feeds the cursor latitude, which makes
the cosLat near-zero only when the cursor is over the pole — which the
map UI doesn't allow.

#### `pointToPolygonDistGeo(point, polygon, cosLat): number`

Latitude-corrected polygon distance. Topology check
(`pointInPolygon`) is unit-agnostic and reuses the euclidean version.

## Behavior

- All distances are non-negative.
- Empty `coords` returns `Infinity` for polylines, `Infinity` for
  polygons (after the inside check).
- The geo variants treat `cosLat` as a per-call constant — no
  per-vertex correction. This is exact for the topology check and a
  uniform stretch for the distance metric, which is what we want.
- `pointInPolygon` uses the half-open ray convention (`pi.y > py !==
pj.y > py`) which automatically skips horizontal edges and handles
  vertices on the ray cleanly.

::: warning Mixing the two APIs is a footgun
A polygon built from one set of coordinates compared to a point with
mismatched units returns nonsense. Pick one variant for the call site
and stay there. Within the worker, every hit test goes through the geo
variants; outside the worker, callers stick with the euclidean ones.
:::

## Examples

Spatial worker hit test (`spatialHitTest.ts`):

```ts
import { pointToPolylineDistGeo, pointToPolygonDistGeo } from '@/core/geometry/hitTest';

const cosLat = Math.max(Math.cos((py * Math.PI) / 180), 1e-6);
for (const candidate of state.tree.search(box)) {
  const coords = entityRenderCoords(entity);
  const distance = isAreaEntity(entity)
    ? pointToPolygonDistGeo(lngLat, coords, cosLat)
    : pointToPolylineDistGeo(lngLat, coords, cosLat);
  if (distance <= r) results.push({ id, entityType, distance });
}
```

Inside `laneTopology` (uses only the topology check, not distance):

```ts
import { pointInPolygon } from './hitTest';

if (pointInPolygon(line[0]!, polyMut)) return true;
```

## Related

- [Workers: spatial](/api/core/workers-spatial) — primary consumer of the geo variants
- [Geometry: laneTopology](/api/core/geometry-lane-topology) — uses `pointInPolygon` for junction detection
- [Overlap: intersect](/api/core/elements-overlap#intersect-ts) — has its own copy of `pointInPolygon` working in `GeoPoint` form
