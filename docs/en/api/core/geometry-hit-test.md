---
title: geometry/hitTest — Hit Testing
description: Point-to-polyline / polygon distance in two flavours — pure Euclidean degree space (legacy) and latitude-compensated (worker hitTest); ensures correct ranking at high latitudes.
---

# `geometry/hitTest` — Hit Testing

> Source: `src/core/geometry/hitTest.ts`
> Tests: `src/core/geometry/__tests__/hitTest.test.ts` (~9.3 KB)

## Purpose & Invariants

`hitTest` exposes two flavours of point-to-polyline / polygon nearest-distance
pure functions:

1. **Pure Euclidean degree space** (`pointToPolylineDist` /
   `pointToPolygonDist`): treats `(lng, lat)` as a 2D Euclidean point. Error
   is small near the equator but at lat 40° east-west distances are off by
   cos40° ≈ 0.766. **Legacy** — kept for tests and backward compatibility.
2. **Latitude-compensated** (`pointToPolylineDistGeo` /
   `pointToPolygonDistGeo`): the caller passes `cosLat`; the function scales
   Δlat by `1/cosLat` to "equivalent lng-degree space", matching the caller's
   lng-degree radius. Worker `hitTest` uses this flavour.

`pointInPolygon` is topology-only (ray casting) and shared by both flavours.

### Invariants (after the R4 fix)

1. **Caller-side distance and radius must live in the same space.**
   - Euclidean: degree space; radius in degrees
   - Geo: scaled-degree space; radius still in degrees (caller unchanged)
2. **Extreme latitudes** — `cosLat → 0` falls back to `Math.max(cosLat, 1e-6)`
   to avoid division by zero.
3. **Polygon closure auto-handled** — `pointToPolygonDist(Geo)` implicitly
   appends `[last, first]` when first ≠ last.

## Public API

### `pointToPolylineDist(point, coords): number` (legacy Euclidean)

```ts
let min = Infinity;
for (let i = 0; i < coords.length - 1; i++) {
  const d = pointToSegmentDist(
    point[0],
    point[1],
    coords[i][0],
    coords[i][1],
    coords[i + 1][0],
    coords[i + 1][1],
  );
  if (d < min) min = d;
}
return min;
```

Degree-space Euclidean.
(`hitTest.ts:47-56`)

### `pointInPolygon(point, polygon): boolean`

Classic ray-casting (half-open):

```ts
for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
  if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
    inside = !inside;
  }
}
```

`yi > py !== yj > py` implies `yi !== yj`, so the divisor is safe and
horizontal edges are auto-skipped (no inside flip).
(`hitTest.ts:59-72`)

### `pointToPolygonDist(point, polygon): number`

Inside → 0; outside → distance to the (auto-closed) ring.
(`hitTest.ts:75-82`)

### `pointToPolylineDistGeo(point, coords, cosLat): number`

Latitude-compensated.

```ts
function pointToSegmentDistGeo(...) {
  const dy = (by - ay) * invCosLat;     // Δlat scaled into lng space
  const dx = bx - ax;                   // Δlng unchanged
  // ... then standard Euclidean + segment projection
}
```

Distance return value is in lng-degree units, directly comparable to
`pixelToRadius(px)`'s degree radius. Extreme `cosLat ≈ 0` clamps to `1e-6`
(degenerates back to Euclidean).
(`hitTest.ts:118-130`)

### `pointToPolygonDistGeo(point, polygon, cosLat): number`

`pointInPolygon` containment + `pointToPolylineDistGeo` boundary.
(`hitTest.ts:136-143`)

## Math background (why scale dy)

Web-Mercator per-pixel lng step = `360 / (512 · 2^zoom)` (independent of lat).
Per-pixel lat step = lng step × cos(lat) (smaller at high latitudes).

So one `pixelToRadius(px)` is both an lng radius `r` and a lat radius
`r/cosLat`. Equivalently: **multiplying Δlat by 1/cosLat** lets the result be
compared directly to `r`. That is the Geo flavour's core trick.

Choosing "scale dy" over "compress dx" keeps the returned distance in the
caller's lng-degree units (zero caller change).

## Usage contrast

```ts
// Main thread (hot-layer min-distance ranking)
const d = pointToPolylineDist(cursor, lineCoords);
// d unit = degree-Euclidean; under-estimates at high latitudes

// Worker hit test (lng-degree radius)
const cosLat = Math.max(Math.cos((point.y * Math.PI) / 180), 1e-6);
const d = pointToPolylineDistGeo(cursor, lineCoords, cosLat);
const r = pixelToRadius(8, currentZoom);
if (d <= r) {
  /* hit */
}
```

## Test coverage

`hitTest.test.ts` covers:

- `pointToPolylineDist`: start / end / mid nearest, empty array → ∞, single-point degeneracy.
- `pointInPolygon`: inside, outside, vertex, on-edge, horizontal edge no-flip.
- `pointToPolygonDist`: inside = 0, outside = distance, auto-closure.
- Geo flavour at low latitudes (equator) ≈ Euclidean.
- Geo flavour at high latitudes (lat 60°) deviates significantly (≈ cos60° = 0.5 factor).
- `cosLat → 0` polar fallback.

## Complexity

| Function               | Complexity |
| ---------------------- | ---------- |
| `pointToSegmentDist*`  | O(1)       |
| `pointToPolylineDist*` | O(P-1)     |
| `pointInPolygon`       | O(P)       |
| `pointToPolygonDist*`  | O(P)       |

Worker hitTest narrows candidates via RBush; at 50k-entity scale, a
hit-neighborhood is ~10 candidates × 30 vertices each ≈ 300 evaluations,
< 0.5 ms.

## See also

- [workers/spatial](./workers-spatial) — `spatialHitTest.ts` calls the Geo flavour
- [geometry/snap](./geometry-snap) — vertex / edge distance comparison (Euclidean
  degrees projected to meters)
- [geometry/validation](./geometry-validation) — `polygonSelfIntersects` is a
  separate predicate
