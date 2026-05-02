# Export Engine

The current export engine is the Apollo IO worker, not a separate
`buildBaseMap.ts` / `buildSimMap.ts` / `buildRoutingMap.ts` implementation.
It round-trips an imported Apollo `base_map` by keeping the decoded raw map in
the worker, replacing the editable entity arrays, projecting coordinates back
to the imported CRS, then encoding binary or text protobuf.

## Entry Points

User-facing commands:

- `exportApolloBin()` in `src/io/mapIO.ts`
- `exportApolloText()` in `src/io/mapIO.ts`

Both commands require an import context in `apolloMapStore.info`. Exporting a
new map from an empty editor is intentionally unsupported today because the
worker needs an imported raw Apollo map as the round-trip base.

```text
ActionDispatcher
  -> mapIO.exportApolloBin / exportApolloText
  -> apolloIOBridge.exportBin / exportText
  -> apolloIO.worker BEGIN_EXPORT + chunks + FINISH_EXPORT
  -> entitiesToApolloMap()
  -> apolloMapFromLonLat()
  -> encodeMapBin() / encodeMapText()
  -> downloadBlob()
```

## Worker Cache

On import, `apolloIO.worker.ts` stores:

```ts
let cachedRawLonLatMap: Record<string, unknown> | null = null;
```

The cached map has every Apollo `PointENU` transformed to editor lon/lat
coordinates. Export starts from this cached tree so fields not represented by
`MapEntity` can survive a round trip. The editor then overwrites supported
arrays (`lane`, `road`, `signal`, `overlap`, etc.) through
`entitiesToApolloMap(baseMap, processed.entities)`.

If no import has happened, export throws:

```text
No imported Apollo map is cached in the IO worker.
```

`mapIO` catches the error and surfaces it through `apolloMapStore.lastError`.

## Chunked Entity Transfer

`apolloIOBridge` sends export entities in chunks of 2,000:

1. `BEGIN_EXPORT` with format, projection string and expected total.
2. Repeated `EXPORT_ENTITIES_CHUNK` messages.
3. `FINISH_EXPORT`.

The bridge yields with `setTimeout(0)` between chunks so the renderer can
paint progress. The worker validates that the received entity count matches
the declared total before encoding.

## Pre-Encode Processing

Before writing proto, the worker calls the same processing path used after
import:

```ts
const processed = applyImportTopology(entities);
```

That function:

1. Builds a `Map<string, MapEntity>`.
2. Runs full `reconcileLaneTopology()`.
3. Runs full `reconcileOverlaps()` with a fresh `SpatialIndex`.
4. Applies removed/changed overlap patch entries.

Export therefore serializes a self-consistent topology/overlap snapshot even
if the latest edits only performed incremental reconciliation on the main
thread.

## Entity Bridge

`entitiesToApolloMap()` in `src/io/proto/entityBridge/map.ts` maps the current
entity list into Apollo top-level arrays:

| Entity type    | Apollo field    |
| -------------- | --------------- |
| `crosswalk`    | `crosswalk`     |
| `junction`     | `junction`      |
| `lane`         | `lane`          |
| `stopSign`     | `stop_sign`     |
| `signal`       | `signal`        |
| `yieldSign`    | `yield`         |
| `overlap`      | `overlap`       |
| `clearArea`    | `clear_area`    |
| `speedBump`    | `speed_bump`    |
| `road`         | `road`          |
| `parkingSpace` | `parking_space` |
| `pncJunction`  | `pnc_junction`  |
| `rsu`          | `rsu`           |
| `area`         | `ad_area`       |
| `barrierGate`  | `barrier_gate`  |

The bridge pre-seeds every supported field with an empty array so deleted
entity types are removed from the exported proto rather than leaving stale
items from the cached base map.

## Projection

Editor geometry is stored as WGS84 lon/lat. Apollo map files store `PointENU`
in the coordinate reference system described by `header.projection.proj`.

Export calls:

```ts
apolloMapFromLonLat(merged, projString);
```

That recursively walks the protobuf type tree and transforms every
`.apollo.common.PointENU` message with `makeProjection(projString).fromLonLat`.
The same sanitized PROJ string used at import is retained in
`apolloMapStore.info.projString` and passed back to the worker.

## Binary And Text Encoding

Binary output:

- `encodeMapBin()` loads the Apollo `Map` protobuf type.
- `Map.verify()` catches structural errors.
- `Map.encode(...).finish()` returns a `Uint8Array`.

Text output:

- `encodeMapText()` walks fields in proto declaration order.
- Repeated fields are emitted as repeated blocks.
- Enum numbers are written as enum names when known.
- Bytes and strings use escaped quoted strings.

`mapIO` copies the returned bytes before constructing a `Blob`, avoiding
detached-buffer failures when a worker transfer was involved.

## Unsupported Exports

These older document/API names do not exist in current master:

- `buildBaseMap`
- `buildSimMap`
- `buildRoutingMap`
- `encodeGraph`

The current product exports Apollo base map only, in binary or text-proto
form. Sim map and routing map generation would require new source modules and
tests; the docs should not imply they are already implemented.

## Verification

Relevant tests:

- `src/io/__tests__/endToEnd.test.ts`
- `src/io/proto/__tests__/binRoundtrip.test.ts`
- `src/io/proto/__tests__/textRoundtrip.test.ts`
- `src/io/proto/__tests__/editorMeta.test.ts`
- `src/io/proto/__tests__/overlapFidelity.test.ts`
- `src/io/proto/__tests__/subsignalFidelity.test.ts`
- `src/io/proto/__tests__/curveFidelity.test.ts`
- `src/io/proto/__tests__/mapDataPerformance.test.ts`
