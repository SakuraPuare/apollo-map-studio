# Geo

> Source: `src/lib/geo.ts`

## Overview

`geo.ts` is a small dependency-free module that provides geo-distance
helpers for the editor's WGS84 lon/lat coordinate space. The two
functions every Apollo entity computation needs:

1. **Polyline length in metres**, used by `LaneEntity.length` and
   any other Curve-derived length.
2. **Local metres-to-degree conversion** at a given latitude, used
   for sub-metre construction geometry like signal templates and
   parking-space heading offsets.

Apollo's `GeoPoint` uses `x = longitude (degrees)` and
`y = latitude (degrees)`. The proto-side `PointENU` is in UTM ENU
metres, but by the time this module runs the projection step has
already converted everything to lon/lat — so the helpers here
operate in degrees and return metres.

::: tip Design principle: zero deps, ~0.5% accuracy
The module deliberately does not import `turf` or `proj4`. Apollo
lanes and signals all live within a few hundred metres of the local
ENU origin, where the haversine sphere approximation has < 0.5 %
error — well below human perception and Apollo's lane-width tolerance.
The savings: one fewer dependency, no proj4 setup cost on hot paths
like `compileEntity`.
:::

## Exports

| Symbol                 | Signature                                 | Purpose                                                    |
| ---------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `haversineMeters`      | `(a: GeoPoint, b: GeoPoint) => number`    | Great-circle distance between two lon/lat points (metres). |
| `polylineLengthMeters` | `(points: readonly GeoPoint[]) => number` | Sum of haversine segments. Returns `0` for `< 2` points.   |
| `metersToDegLat`       | `() => number`                            | 1 m in degrees of latitude (constant).                     |
| `metersToDegLng`       | `(latDeg: number) => number`              | 1 m in degrees of longitude at the given latitude.         |

## Behavior

### `haversineMeters`

```ts
const lat1 = a.y * DEG_TO_RAD;
const lat2 = b.y * DEG_TO_RAD;
const dLat = (b.y - a.y) * DEG_TO_RAD;
const dLng = (b.x - a.x) * DEG_TO_RAD;
const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
```

`EARTH_RADIUS_M = 6_371_008.8` is the WGS84 mean radius. The `Math.min`
guard handles tiny floating-point overshoot above 1.0 (e.g. when both
points are nearly identical).

The function allocates nothing — every variable is a primitive scalar.
It is hot-path safe: `polylineLengthMeters` calls it `n - 1` times for
an `n`-point polyline.

### `polylineLengthMeters`

```ts
if (points.length < 2) return 0;
let total = 0;
for (let i = 1; i < points.length; i++) {
  total += haversineMeters(points[i - 1]!, points[i]!);
}
return total;
```

The 0-point and 1-point cases return 0 (consistent with proto2
`Curve` semantics — a curve with no/single segment has zero length).
Used by `applyDerive(lane)` to write `lane.length` after every
geometry edit.

### `metersToDegLat`

```ts
return 1 / ((Math.PI / 180) * EARTH_RADIUS_M);
```

This is a constant (~9.0e-6 deg/m). Latitude degrees are uniform in
metres regardless of longitude, so no parameter is needed. The
function form keeps the API symmetric with `metersToDegLng`.

### `metersToDegLng`

```ts
const cosLat = Math.cos(latDeg * DEG_TO_RAD);
if (cosLat < 1e-9) return metersToDegLat();
return 1 / ((Math.PI / 180) * EARTH_RADIUS_M * cosLat);
```

Longitude degrees shrink with latitude (`1° at the equator ≈ 111 km`,
`1° at 60°N ≈ 55 km`). The pole guard (`cosLat < 1e-9`) falls back to
the latitude conversion to avoid divide-by-zero — Apollo maps in the
arctic are not a real use case, but the guard keeps the function total.

## Examples

### Lane length update

```ts
import { polylineLengthMeters } from '@/lib/geo';

function applyLaneDerive(lane: LaneEntity): LaneEntity {
  const points = curvePoints(lane.centralCurve);
  return { ...lane, length: polylineLengthMeters(points) };
}
```

This is what `applyDerive` does inside `core/elements/derive` for
every lane mutation.

### Signal-template construction

```ts
import { metersToDegLng, metersToDegLat } from '@/lib/geo';

function buildSignalTemplate(center: GeoPoint, widthM: number, heightM: number) {
  const dLng = (metersToDegLng(center.y) * widthM) / 2;
  const dLat = (metersToDegLat() * heightM) / 2;
  return [
    { x: center.x - dLng, y: center.y - dLat },
    { x: center.x + dLng, y: center.y - dLat },
    { x: center.x + dLng, y: center.y + dLat },
    { x: center.x - dLng, y: center.y + dLat },
  ];
}
```

`metersToDegLng` / `metersToDegLat` are sufficient for sub-metre
constructions where the haversine approximation's error is dwarfed by
device precision.

### Distance for snap radius

```ts
import { haversineMeters } from '@/lib/geo';

function isWithinSnapRadius(a: GeoPoint, b: GeoPoint, radiusM: number): boolean {
  return haversineMeters(a, b) <= radiusM;
}
```

## Related

- [Geo JSON Helpers](./geo-json-helpers.md) — uses these helpers
  indirectly through Apollo entity compilation.
- [Entity Ops — Edit](./entity-ops.md#edit-edit-ts) — `applyDerive`
  uses `polylineLengthMeters` for `lane.length`.
- [/api/core/geometry/coords](/api/core/geometry/coords) — coordinate
  type definitions.
- [Projection](../io/proto-projection.md) — UTM ↔ lon/lat conversion;
  `geo.ts` operates on the lon/lat side only.
