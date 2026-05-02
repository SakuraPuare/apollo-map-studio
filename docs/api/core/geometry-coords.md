# Geometry: coords

> Source: `src/core/geometry/coords.ts`

## Overview

Trivial conversion helpers between the two point representations used
across the codebase:

- **`GeoPoint`** = `{ x, y, z? }` — store-side, matches Apollo proto field
  shape, can carry an optional Z (metres above ground).
- **`LngLat`** = `[number, number]` — runtime tuple form used by
  MapLibre and the geometry interpolation modules (Catmull-Rom, Bezier,
  arc, rect).

`coords.ts` exists because `.map((p) => [p.x, p.y])` was strewn across
hundreds of files and silently lost the optional `z`. Centralising the
conversion gives one diff-friendly place to change behaviour later
(e.g. injecting projection wiring) and a single grep target.

::: info Why two shapes
`GeoPoint` is the canonical store and IO format — it round-trips
losslessly with Apollo proto, including elevation. `LngLat` is the
canvas-layer tuple form: MapLibre's `setData`, `interpolate.ts`'s
sampling functions, and the FSM event payloads all consume
`[lng, lat]` tuples. The conversion is so cheap that every layer just
re-projects at the boundary instead of carrying both shapes through.
:::

## Exports

### Functions

#### `toLngLat(p: GeoPoint): LngLat`

```ts
function toLngLat(p: GeoPoint): LngLat {
  return [p.x, p.y];
}
```

Drops `z`. Use this whenever a function expects `[lng, lat]`.

#### `toGeoPoint(p: LngLat): GeoPoint`

```ts
function toGeoPoint(p: LngLat): GeoPoint {
  return { x: p[0], y: p[1] };
}
```

Z is **not** synthesised. The resulting `GeoPoint` has no `z` property,
which matches the Apollo proto convention of "absent z = 2D shape".

#### `pointsToCoords(points: GeoPoint[]): LngLat[]`

Map-form of `toLngLat`. The most-used helper — prefer this over inline
`.map`.

#### `coordsToPoints(coords: LngLat[]): GeoPoint[]`

Map-form of `toGeoPoint`. Used by factory and edit-points pipelines
when sample arrays come back from the interpolation modules.

## Behavior

- All four functions are pure and synchronous.
- `z` is preserved from `GeoPoint` only when explicitly carried — the
  one-way `toGeoPoint` cannot invent it.
- No projection is performed. Inputs and outputs are both lng/lat
  degrees. Projection-into-metres lives in
  `apolloCompile/projection.ts` (`projectPoint` / `unprojectPoint`).

::: warning Do not pre-project before calling
Several geometry modules apply their own cosLat correction internally
(`offsetPolylineDeg`, `decorateBoundary`, `laneTopology.classifyNeighbor`).
Passing already-projected metre-space tuples through `toGeoPoint`
breaks those internal projections silently — coordinates are never
type-checked beyond "two numbers".
:::

## Examples

Compiling a Bezier sample back to a centerline (`createLane`):

```ts
import { coordsToPoints } from '@/core/geometry/coords';
import { cubicBezier } from '@/core/geometry/interpolate';

const sampledLngLat = cubicBezier(d.anchors); // LngLat[]
const centerPts = coordsToPoints(sampledLngLat); // GeoPoint[]
return pointsToCurve(centerPts);
```

Feeding centerline coordinates into MapLibre (in `compileApolloFeatures`):

```ts
import { pointsToCoords, toLngLat } from '@/core/geometry/coords';

const coords = pointsToCoords(curvePoints(entity.centralCurve));
features.push(mkLine(coords, { ... }));
```

## Related

- [Geometry: interpolate](/api/core/geometry-interpolate) — primary `LngLat[]` consumer/producer
- [Geometry: anchorConvert](/api/core/geometry-anchor-convert) — uses `toLngLat` / `toGeoPoint` for `BezierAnchor` ↔ `BezierAnchorData`
- [Apollo compile: projection](/api/core/geometry-apollo-compile) — `projectPoint` / `unprojectPoint` for metre-space work
