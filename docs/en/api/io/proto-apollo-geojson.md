---
title: io / proto-apollo-geojson
description: src/io/proto/apolloGeoJson.ts — bounds computation for import preview / auto fitBounds
---

# io / proto-apollo-geojson

`src/io/proto/apolloGeoJson.ts` is a lightweight helper used by the
"import preview / auto fitBounds" path. It walks every point in a
raw Apollo Map (after lon/lat projection) and returns a WGS84
bounding box `[[minX, minY], [maxX, maxY]]`.

> Despite the filename, the file does **not** compile GeoJSON
> features today. Editor GeoJSON compilation lives in
> `src/core/geometry/compile.ts` + `apolloCompile/features.ts`. This
> module exposes only `computeApolloMapBounds`.

## Exported symbol

```ts
export function computeApolloMapBounds(
  map: RawApolloMap,
): [[number, number], [number, number]] | null;
```

> Source: `src/io/proto/apolloGeoJson.ts:1-158`.

`RawApolloMap` is a private structural type covering exactly the
shape needed for bbox computation. Each `RawXxx` carries only the
fields the sweep visits.

## Implementation

A simple min/max sweep over:

- `lane.central_curve` + `lane.left_boundary.curve` +
  `lane.right_boundary.curve`
- `crosswalk.polygon`, `junction.polygon`, `clear_area.polygon`,
  `parking_space.polygon`
- `road.section[*].boundary.outer_polygon.edge[*].curve`
- `signal.boundary` + `signal.stop_line[*]`
- `stop_sign.stop_line[*]`
- `speed_bump.position[*]`

Each point's `x` and `y` must be `number` to participate (defensive
against malformed input). Returns `null` when no point qualifies;
the caller skips `map.fitBounds` in that case.

## Usage

```ts
import { computeApolloMapBounds } from '@/io/proto/apolloGeoJson';

const bounds = computeApolloMapBounds(lonLatMap as Parameters<typeof computeApolloMapBounds>[0]);
if (bounds) {
  map.fitBounds(bounds, { padding: 64, duration: 600 });
}
```

`apolloIO.worker` calls this at the end of `runImport` and emits the
result as `IMPORT_RESULT.bounds`. The main thread stores it on
`apolloMapStore.bounds`, which triggers viewport convergence.

## See also

- [Import / Parse Base Map](/en/api/import-parse-base-map) — caller.
- [Geo / Lane Geometry](/en/api/geo-lane-geometry) — feature
  compilation lives in `core/geometry/compile.ts`, not here.
