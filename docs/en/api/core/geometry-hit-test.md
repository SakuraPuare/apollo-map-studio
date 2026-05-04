---
title: geometry/hitTest — Hit Testing
description: Latitude-compensated point-to-polyline / polygon distance for correct high-latitude hit-test ranking.
---

# `geometry/hitTest` — Hit Testing

> Source: `src/core/geometry/hitTest.ts`
> Tests: `src/core/geometry/__tests__/hitTest.test.ts` (~9.3 KB)

## Purpose & Invariants

`hitTest` exposes latitude-compensated point-to-polyline / polygon
nearest-distance pure functions. The caller passes `cosLat`; the function scales
Δlat by `1/cosLat` to "equivalent lng-degree space", matching the caller's
lng-degree radius. Worker `hitTest` uses this flavour.

`pointInPolygon` is topology-only (ray casting).

### Invariants (after the R4 fix)

1. **Caller-side distance and radius must live in the same space.**
   - Geo: scaled-degree space; radius still in degrees (caller unchanged)
2. **Extreme latitudes** — `cosLat → 0` falls back to `Math.max(cosLat, 1e-6)`
   to avoid division by zero.
3. **Polygon closure auto-handled** — `pointToPolygonDistGeo` implicitly
   appends `[last, first]` when first ≠ last.

## Public API

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

- `pointToPolylineDistGeo`: start / end / mid nearest, empty array → ∞, single-point degeneracy.
- `pointInPolygon`: inside, outside, vertex, on-edge, horizontal edge no-flip.
- `pointToPolygonDistGeo`: inside = 0, outside = distance, auto-closure.
- Geo flavour at low latitudes (equator) ≈ Euclidean.
- Geo flavour at high latitudes (lat 60°) deviates significantly (≈ cos60° = 0.5 factor).
- `cosLat → 0` polar fallback.

## Complexity

| Function                 | Complexity |
| ------------------------ | ---------- |
| `pointToPolylineDistGeo` | O(P-1)     |
| `pointInPolygon`         | O(P)       |
| `pointToPolygonDistGeo`  | O(P)       |

Worker hitTest narrows candidates via RBush; at 50k-entity scale, a
hit-neighborhood is ~10 candidates × 30 vertices each ≈ 300 evaluations,
< 0.5 ms.

## See also

- [workers/spatial](./workers-spatial) — `spatialHitTest.ts` calls the Geo flavour
- [geometry/snap](./geometry-snap) — vertex / edge distance comparison (Euclidean
  degrees projected to meters)
- [geometry/validation](./geometry-validation) — `polygonSelfIntersects` is a
  separate predicate
