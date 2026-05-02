# Proto Apollo GeoJSON

> Source: `src/io/proto/apolloGeoJson.ts`

## Overview

`apolloGeoJson.ts` is a read-only view that walks a decoded Apollo
HD-map (in WGS84 lon/lat — see [Adapter](./proto-adapter.md)) and
extracts geometry suitable for downstream tools that don't speak
Apollo proto. It is **not** the rendering path the editor uses (that
goes through `entityBridge` + the cold layer). It exists for two
narrower needs:

1. **Bounding-box computation on import.** `mapIO` needs to fit the
   viewport to the imported map's extent before the cold layer has
   compiled features. `computeApolloMapBounds` walks every reachable
   point in the proto tree and returns the WGS84 bbox.
2. **Future export to GeoJSON-consuming tools.** The shape of the
   helpers is set up to be extended into a per-entity-type
   `FeatureCollection` builder for QGIS / external diff tooling.

The module is **pure** — no DOM, no store dependency, no React. It
operates on the same plain-object shape produced by `binCodec` /
`textCodec` after `apolloMapToLonLat` projection.

## Exports

| Symbol                   | Signature                                                 | Purpose                                      |
| ------------------------ | --------------------------------------------------------- | -------------------------------------------- |
| `computeApolloMapBounds` | `(map: RawApolloMap) => [[lng, lat], [lng, lat]] \| null` | WGS84 bounding box of every reachable point. |

The internal `RawApolloMap` interface is intentionally narrow — only
the proto fields whose geometry contributes to the bbox are typed.
Fields the editor doesn't render (e.g. `parking_island`, `signal_v2`)
are ignored without error.

## Behavior

### `computeApolloMapBounds`

```ts
let minX = Infinity,
  minY = Infinity,
  maxX = -Infinity,
  maxY = -Infinity;
const visit = (p) => {
  if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return;
  if (p.x < minX) minX = p.x;
  if (p.x > maxX) maxX = p.x;
  if (p.y < minY) minY = p.y;
  if (p.y > maxY) maxY = p.y;
};
```

The walker traverses every PointENU reachable from these proto fields:

| Proto path                                                                            | Geometry kind |
| ------------------------------------------------------------------------------------- | ------------- |
| `lane[].central_curve.segment[].line_segment.point[]`                                 | polyline      |
| `lane[].left_boundary.curve.segment[].line_segment.point[]`                           | polyline      |
| `lane[].right_boundary.curve.segment[].line_segment.point[]`                          | polyline      |
| `crosswalk[].polygon.point[]`                                                         | polygon       |
| `junction[].polygon.point[]`                                                          | polygon       |
| `clear_area[].polygon.point[]`                                                        | polygon       |
| `parking_space[].polygon.point[]`                                                     | polygon       |
| `road[].section[].boundary.outer_polygon.edge[].curve.segment[].line_segment.point[]` | polyline      |
| `signal[].boundary.point[]`                                                           | polygon       |
| `signal[].stop_line[].segment[].line_segment.point[]`                                 | polyline      |
| `stop_sign[].stop_line[].segment[].line_segment.point[]`                              | polyline      |
| `speed_bump[].position[].segment[].line_segment.point[]`                              | polyline      |

Coverage is intentionally generous — including the road outer polygon
and signal boundary helps fit the viewport even when the lane network
is sparse.

### Defensive parsing

Every accessor uses optional chaining and `?? []` so the walker never
crashes on partial input:

```ts
const visitCurve = (c) => {
  for (const seg of c?.segment ?? []) {
    for (const pt of seg.line_segment?.point ?? []) visit(pt);
  }
};
```

A map missing every geometry field returns `null` (no finite bounds).

### Return shape

```ts
if (!Number.isFinite(minX)) return null;
return [
  [minX, minY],
  [maxX, maxY],
];
```

The shape matches MapLibre's `LngLatBounds` constructor:
`[[swLng, swLat], [neLng, neLat]]`. The bounds are in WGS84 lon/lat
because the input map should already have been projected by
`apolloMapToLonLat`.

### Performance

The walker is single-pass and allocation-free per point. On the
borregas_ave reference map (~3 K lanes, ~2 K junctions) the function
runs in ~5 ms in the worker. It runs once per import inside the IO
worker, so there is no perf budget on the main thread.

## Examples

### Inside the import worker

```ts
import { decodeMapBin } from './proto/binCodec';
import { apolloMapToLonLat } from './proto/adapter';
import { computeApolloMapBounds } from './proto/apolloGeoJson';

const raw = await decodeMapBin(bytes);
const { map: lonLatMap, projString } = await apolloMapToLonLat(raw, headerProj);
const bounds = computeApolloMapBounds(lonLatMap);
postMessage({
  type: 'IMPORT_RESULT',
  requestId,
  info: { filename, projString, ... },
  header: lonLatMap.header,
  bounds,  // → ApolloLayer.fitBounds(...)
});
```

### Fit viewport on import

```ts
import { useApolloMapStore } from '@/store/apolloMapStore';

useApolloMapStore.subscribe((s) => {
  if (s.bounds) map.fitBounds(s.bounds, { padding: 40, duration: 500 });
});
```

### Standalone usage on a fixture

```ts
import { computeApolloMapBounds } from '@/io/proto/apolloGeoJson';

const map = JSON.parse(await fs.readFile('borregas-decoded.json', 'utf8'));
const bbox = computeApolloMapBounds(map);
console.log(bbox); // [[-122.0144, 37.4055], [-122.0079, 37.4093]]
```

## Related

- [Proto Adapter](./proto-adapter.md) — produces the lon/lat-projected
  map this walker consumes.
- [Bin Codec](./proto-codec-bin.md) / [Text Codec](./proto-codec-text.md) —
  produce the input plain-object shape.
- [Apollo Map Store](../store/apollo-map-store.md) — destination of the
  `bounds` payload (via `setImported`).
- [Map IO](./map-io.md) — orchestration that triggers the bbox
  computation.
