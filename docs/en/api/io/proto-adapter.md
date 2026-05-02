---
title: io / proto-adapter
description: src/io/proto/adapter.ts — ENU↔WGS84 projection + header / counts extraction
---

# io / proto-adapter

`src/io/proto/adapter.ts` bridges the protobufjs-decoded plain
object to the projection module, performing Apollo PointENU (UTM
metres) ↔ WGS84 (lng/lat degrees) conversions in both directions.

## Exported symbols

```ts
import * as protobuf from 'protobufjs';
import type { Projection, PointXY } from './projection';

export function transformPointsInMessage(
  type: protobuf.Type,
  msg: unknown,
  transform: (p: PointXY) => PointXY,
): unknown;

export interface ApolloMapInLonLat {
  map: Record<string, unknown>;
  projString: string;
  projection: Projection;
}

export function apolloMapToLonLat(
  map: Record<string, unknown>,
  projString: string,
): Promise<ApolloMapInLonLat>;

export function apolloMapFromLonLat(
  map: Record<string, unknown>,
  projString: string,
): Promise<{ map: Record<string, unknown>; projection: Projection }>;

export function readHeaderProjString(map: Record<string, unknown>): string | null;
export function entityCounts(map: Record<string, unknown>): Record<string, number>;
```

> Source: `src/io/proto/adapter.ts:1-107`.

## `transformPointsInMessage(type, msg, transform)`

Recursively walks `msg`. When `type.fullName ===
'.apollo.common.PointENU'`, the helper calls `transform`. Otherwise
each field is resolved and recursed into; repeated fields map child
by child. Returns a new tree — the input is not mutated.

## `apolloMapToLonLat(map, projString)` / `apolloMapFromLonLat(map, projString)`

Convenience compositions over `getMapType()` + `makeProjection` +
`transformPointsInMessage`. The `to` direction returns the
projection alongside the new tree so callers can reuse it for
follow-up conversions.

## `readHeaderProjString(map)`

Extracts `map.header.projection.proj`. Tolerates `string`,
`Uint8Array`, and `number[]` encodings; returns `null` for anything
else. The worker uses `null` to trigger `NEEDS_PROJECTION`.

## `entityCounts(map)`

```ts
function entityCounts(map: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(map)) {
    if (Array.isArray(value)) out[key] = value.length;
  }
  return out;
}
```

Reports the length of every top-level repeated field — the source
of `ApolloMapImportInfo.counts`.

## Relationship to entityBridge

`adapter` only does coordinate transforms on the raw plain object;
typed entities are the next step (`entityBridge/map.ts:
apolloMapToEntities`). Splitting the two lets the worker cache the
raw lon/lat tree for lossless round-trip exports while still
serving an entity-typed view to the editor.

## See also

- [Geo / Projection](/en/api/geo-projection) — proj4 wrapper.
- [Proto / Loader](/en/api/proto-loader) — schema source.
- [io/proto-entity-bridge](/en/api/io/proto-entity-bridge) — next
  hop after `apolloMapToLonLat`.
