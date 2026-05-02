---
title: geo — lng/lat geographic measurement helpers
description: Haversine distance, polyline length, metres ↔ degrees conversion. Zero dependencies, pure functions.
---

# `geo` — lng/lat geographic measurement helpers

> Source: `src/lib/geo.ts` · 58 lines · zero deps · pure functions

## Purpose

The editor stores WGS84 longitude/latitude (`GeoPoint = { x: lng, y: lat }`). Many proto fields (`Lane.length`, `leftSamples` widths, etc.) are physical metres — we need a degrees → metres converter.

`geo` provides a small set of sharp helpers:

- Haversine (spherical) distance — < 0.5 % error at lane scale (a few km)
- Polyline total length
- Metres ↔ degrees conversions for tiny shapes (e.g. a 1.5 m signal box)

Trade-offs:

- **No turf** — a 2 MB dependency just for distance/length is overkill.
- **Spherical, not WGS84 ellipsoid** — the difference at editor scales is < 5 cm.
- **Lives outside `core/geometry/coords`** — that module owns projections / coordinate systems; this module owns "distance".

## Public API

| Symbol                 | Kind | Signature                                 | Summary                                      |
| ---------------------- | ---- | ----------------------------------------- | -------------------------------------------- |
| `haversineMeters`      | fn   | `(a: GeoPoint, b: GeoPoint) => number`    | Great-circle distance (m)                    |
| `polylineLengthMeters` | fn   | `(points: readonly GeoPoint[]) => number` | Sum of segment lengths (m)                   |
| `metersToDegLat`       | fn   | `() => number`                            | 1 m → degrees of latitude                    |
| `metersToDegLng`       | fn   | `(latDeg: number) => number`              | 1 m → degrees of longitude at given latitude |

## Detailed entries

### Constants

```ts
const EARTH_RADIUS_M = 6_371_008.8; // WGS84 mean radius
const DEG_TO_RAD = Math.PI / 180;
```

`6_371_008.8` is the WGS84 equal-area mean radius — about 9 m more accurate than 6 371 000.

### `haversineMeters(a, b): number`

```ts
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const lat1 = a.y * DEG_TO_RAD;
  const lat2 = b.y * DEG_TO_RAD;
  const dLat = (b.y - a.y) * DEG_TO_RAD;
  const dLng = (b.x - a.x) * DEG_TO_RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
```

Classic haversine. The `Math.min(1, ...)` is numerical-robustness padding — fp drift can push `sqrt(h)` above 1, which would make `asin` return NaN.

Accuracy:

- Urban scale (< 5 km): < 0.1 % error.
- Inter-city (> 100 km): still < 1 %.
- Editor use cases all sit in the first bucket.

Source: `geo.ts:22-29`.

### `polylineLengthMeters(points): number`

```ts
export function polylineLengthMeters(points: readonly GeoPoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1]!, points[i]!);
  }
  return total;
}
```

Sums per-segment haversine. The early `< 2` return handles the lane-with-one-point edge case without an out-of-bounds crash.

Used by:

- `LaneEntity.length` derive rule (`core/elements/derive/lane`)
- Inspector "Length" readonly row
- Length-threshold validation in zod schemas

### `metersToDegLat(): number`

```ts
export function metersToDegLat(): number {
  return 1 / ((Math.PI / 180) * EARTH_RADIUS_M);
}
```

Returns the latitude (degrees) covered by 1 metre. Earth radius times 1 radian = arc length in metres; 1 m / (radians-per-degree × radius) → degrees per metre.

Result ≈ `8.99e-6` (≈ 0.000009° per metre).

### `metersToDegLng(latDeg): number`

```ts
export function metersToDegLng(latDeg: number): number {
  const cosLat = Math.cos(latDeg * DEG_TO_RAD);
  if (cosLat < 1e-9) return metersToDegLat();
  return 1 / ((Math.PI / 180) * EARTH_RADIUS_M * cosLat);
}
```

Longitude scales with latitude (1° at the equator ≈ 111 km; 1° near the pole → 0). When `cos(lat)` is near zero (pole) we degrade to the latitude scaling rather than divide by zero.

Used for tiny local shapes (< 100 m) like the `signalTemplate` boxes — a full proj4 round-trip would be overkill.

## Side effects

- **None.** All functions are pure.
- No store, no console, no IO.

## Test coverage

`src/lib/__tests__/geo.test.ts`:

- Known-pair haversine (Beijing → Shanghai ≈ 1067 km, < 0.5 % error)
- `polylineLengthMeters` returns 0 for empty / single-point arrays
- `metersToDegLat`, `metersToDegLng` degenerate behaviour at equator and pole

## Consumers

- `src/core/elements/derive/rules/lane.ts` — `lane.length = polylineLengthMeters(centralCurve)`
- `src/core/geometry/apolloCompile/signalTemplate.ts` — signal box metres-to-degrees
- `src/core/geometry/coords.ts` — fallback path
- Inspector "Length" readonly row

## Design alternatives

| Choice                 | Alternative                     | Rationale                                                   |
| ---------------------- | ------------------------------- | ----------------------------------------------------------- |
| Spherical haversine    | WGS84 ellipsoid (vincenty)      | Sub-5-cm difference at editor scales; vincenty is 50+ lines |
| Constant earth radius  | Per-coordinate ellipsoid radius | Same — WGS84 mean is already accurate enough                |
| Local m↔deg conversion | proj4 round-trip                | proj4 ≈ 200 KB; signalTemplate is a handful of points       |

## Source map

| Lines | Content                |
| ----- | ---------------------- |
| 12    | `import GeoPoint`      |
| 14–17 | Constants              |
| 22–29 | `haversineMeters`      |
| 35–42 | `polylineLengthMeters` |
| 49–51 | `metersToDegLat`       |
| 53–57 | `metersToDegLng`       |

## Numeric stability details

### Why `Math.min(1, Math.sqrt(h))`

```ts
return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
```

Mathematically `0 ≤ h ≤ 1`, so `sqrt(h) ≤ 1` and `asin(sqrt(h))` is well-defined. Floating-point drift can land `h` at `1.0000000000000002`; `Math.sqrt` returns `≈1.0000000001`; `Math.asin(>1) === NaN`. The clamp keeps `asin` happy.

### `cosLat < 1e-9` degeneration

```ts
export function metersToDegLng(latDeg: number): number {
  const cosLat = Math.cos(latDeg * DEG_TO_RAD);
  if (cosLat < 1e-9) return metersToDegLat();
  return 1 / ((Math.PI / 180) * EARTH_RADIUS_M * cosLat);
}
```

At latitude 90° `cos(90°) ≈ 6e-17` (not exactly 0), which would explode to `Infinity`. The `< 1e-9` cutoff falls back to the latitude scaling — a conservative default since "longitude span at the pole" is undefined anyway. The threshold corresponds to lat ≈ 89.99999994°, which never occurs in practice.

## Comparison with turf

A turf-based replacement would look like:

```ts
import { distance, length } from '@turf/turf';
distance([lng1, lat1], [lng2, lat2], { units: 'meters' });
```

But:

- Adds ~1.5 MB bundle (modular turf still ≥ 600 KB).
- Accepts `[lng, lat]` arrays — needs an adapter from our `{x, y}` shape.
- No metres → degrees inverse.

`geo.ts`'s 4 functions cover every need.

## Sample integration tests

```ts
// __tests__/geo.test.ts
import { haversineMeters, polylineLengthMeters, metersToDegLng } from '@/lib/geo';

const beijing = { x: 116.4074, y: 39.9042 };
const shanghai = { x: 121.4737, y: 31.2304 };

it('Beijing → Shanghai ≈ 1067 km', () => {
  const m = haversineMeters(beijing, shanghai);
  expect(m).toBeGreaterThan(1_065_000);
  expect(m).toBeLessThan(1_070_000);
});

it('polyline empty', () => {
  expect(polylineLengthMeters([])).toBe(0);
  expect(polylineLengthMeters([beijing])).toBe(0);
});

it('equator 1 m ≈ 8.99e-6° longitude', () => {
  expect(metersToDegLng(0)).toBeCloseTo(8.99e-6, 8);
});

it('60°N 1 m ≈ 1.79e-5° longitude', () => {
  // cos(60°) = 0.5 → degrees-per-metre doubles
  expect(metersToDegLng(60)).toBeCloseTo(1.798e-5, 7);
});
```

## See also

- `core/geometry/coords` — Mercator projection / coordinate-system fundamentals
- `core/elements/derive/lane` — actual `lane.length` derive rule
- [`entities` types](../types/entities.md) — `GeoPoint` definition
- `core/geometry/signalTemplate` — m↔deg consumer
- `src/lib/__tests__/geo.test.ts` — unit tests
