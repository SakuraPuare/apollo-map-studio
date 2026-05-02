# IO / proto projection

Source: `src/io/proto/projection.ts`.

Wraps `proj4` for the Apollo-specific case: every imported `.bin` /
`.txt` map declares (or omits) a PROJ.4 string in
`Header.projection.proj`, and the editor needs forward and inverse
conversions between that local CRS and WGS84 lon/lat for rendering.

This page mirrors [Geo / Projection](/api/geo-projection) for callers
working inside the IO namespace.

## Exports

- `sanitizeProjString(s)` — strip Apollo's `{...}` template
  placeholders that proj4 rejects.
- `makeProjection(projString)` — build a `Projection` with `toLonLat`
  / `fromLonLat` and the sanitised `projString`.
- `utmProjString(zone, hemisphere?)` — compose a UTM PROJ string from
  zone + hemisphere.
- `utmZoneFromLon(lonDeg)` — infer the zone for a given longitude.
- `UTM_PRESETS` — `{ sunnyvale, beijing, shanghai, shenzhen }`.

## Projection Interface

```ts
interface PointXY {
  x: number;
  y: number;
  z?: number;
}

interface Projection {
  readonly projString: string;
  toLonLat(p: PointXY): PointXY; // UTM ENU → WGS84 lon/lat
  fromLonLat(p: PointXY): PointXY; // WGS84 lon/lat → UTM ENU
}
```

`makeProjection()` builds the bidirectional conversion between Apollo
`PointENU` meter coordinates and WGS84 lon/lat editor coordinates. The
two inner proj4 transformers are constructed once and reused — a
critical perf detail since real Apollo imports call them millions of
times. `z` (elevation) passes through unprojected.

## Sanitiser

Apollo's reference Sunnyvale / garage maps embed PROJ strings with
literal `{}` around numeric arguments (`+lat_0={37.413082}`). proj4
rejects them. `sanitizeProjString` strips the braces; `makeProjection`
calls it transparently.

## UTM Presets

`UTM_PRESETS` covers ~95 % of public Apollo reference maps:

- `sunnyvale` → UTM zone 10N (Bay Area).
- `beijing`, `shenzhen` → UTM zone 50N.
- `shanghai` → UTM zone 51N.

`apolloIOBridge` falls back to `UTM_PRESETS.beijing` when the
projection picker is cancelled.

## Round-trip Contract

The projection string is stored in `apolloMapStore.info.projString`
after import and reused during export so coordinates land back at
their original UTM values byte-for-byte.

## Examples

```ts
import { makeProjection, UTM_PRESETS, utmZoneFromLon } from '@/io/proto/projection';

const proj = makeProjection(UTM_PRESETS.beijing);
const lonLat = proj.toLonLat({ x: 587456.12, y: 4140822.45 });
const back = proj.fromLonLat(lonLat);

const zone = utmZoneFromLon(116.4); // → 50
```

## Related

- [/api/io/proto-adapter](/api/io/proto-adapter) — primary consumer
  via `apolloMapToLonLat` / `apolloMapFromLonLat`.
- [/api/io/apollo-io-bridge](/api/io/apollo-io-bridge) — uses
  `UTM_PRESETS.beijing` as cancellation fallback.
- [/api/store/apollo-map-store](/api/store/apollo-map-store) — stores
  the effective `projString`.
- [/api/store/proj-dialog-store](/api/store/proj-dialog-store) —
  surfaces presets to the user.
