# IO / proto adapter

Source: `src/io/proto/adapter.ts`.

The adapter converts decoded Apollo maps between file coordinates
(UTM ENU) and editor coordinates (WGS84 lon/lat). It does NOT touch
field names or message structure — its only job is to walk the
schema, find every `apollo.common.PointENU` sub-message, and apply a
coordinate transform.

## Main Exports

- `transformPointsInMessage(type, msg, transform)` — recursive
  PointENU walker over a `protobufjs.Type` tree.
- `apolloMapToLonLat(map, projString)` — UTM ENU → WGS84 lon/lat
  whole-map transform.
- `apolloMapFromLonLat(map, projString)` — WGS84 lon/lat → UTM ENU
  inverse transform.
- `readHeaderProjString(map)` — pull `header.projection.proj` out of
  a raw Map, normalising `string` / `Uint8Array` / `number[]` shapes.
- `entityCounts(map)` — per-bucket array length summary used by
  `ApolloMapImportInfo.counts`.

## ApolloMapInLonLat

```ts
interface ApolloMapInLonLat {
  map: Record<string, unknown>; // every PointENU now in lon/lat
  projString: string; // sanitised PROJ.4
  projection: Projection; // live helper for follow-up conversions
}
```

## Reflection Walk

`transformPointsInMessage` uses `protobufjs` type metadata. When the
current type name is `.apollo.common.PointENU`, it applies the
caller transform. Otherwise it recursively walks message fields and
repeated message arrays.

Key invariants:

- The input is not mutated; the function returns a new plain object
  tree.
- Iteration is over `type.fieldsArray`, not `Object.entries(msg)`.
  Unknown fields preserved by the decoder pass through verbatim
  because they live as raw JS keys but are not walked into.
- Optional fields skipped (`v === undefined || v === null`) preserve
  proto2 absence end-to-end.

## Import And Export

- Import calls `apolloMapToLonLat` so all `PointENU` values become
  WGS84 lon/lat.
- Export calls `apolloMapFromLonLat` so edited coordinates become
  projected meter coordinates again.
- Both reuse the same `projString` from `apolloMapStore.info.projString`
  so the round trip is byte-stable.

## readHeaderProjString

Apollo `Header.projection.proj` is a `bytes` field, so different codec
paths produce different shapes:

- `decodeMapBin` default → `Uint8Array`.
- `decodeMapText` → string (Latin-1 decoded).
- Some test fixtures embed it as `number[]`.

The helper normalises all three to a string. `null` means the header
had no projection set — the worker emits `NEEDS_PROJECTION`.

## Examples

```ts
import { decodeMapBin } from '@/io/proto/binCodec';
import { apolloMapToLonLat, readHeaderProjString } from '@/io/proto/adapter';

const obj = await decodeMapBin(bytes);
const projString = readHeaderProjString(obj) ?? UTM_PRESETS.beijing;
const { map, projection } = await apolloMapToLonLat(obj, projString);
```

## Related

- [/api/io/proto-loader](/api/io/proto-loader) — provides the
  `Map` type the walker recurses through.
- [/api/io/proto-projection](/api/io/proto-projection) —
  `makeProjection`, sanitiser, presets.
- [/api/io/proto-codec-bin](/api/io/proto-codec-bin) /
  [/api/io/proto-codec-text](/api/io/proto-codec-text) — produce the
  input plain object.
- [/api/io/proto-entity-bridge](/api/io/proto-entity-bridge) — consumes
  the projected output.
