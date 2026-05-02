# Workers: protocol

> Source: `src/core/workers/protocol.ts`

## Overview

Message types shared between the main thread and the spatial worker.
The overlap worker has its own narrower protocol (defined inline in
`overlap.worker.ts`); this module is exclusively the spatial worker's.

Three classes of message:

- **Requests** — main → worker. Either a public request (`SYNC`,
  `INCREMENTAL`, `HIT_TEST`) or a chunked-sync envelope
  (`SYNC_BEGIN`, `SYNC_CHUNK`, `SYNC_FINISH`).
- **Responses** — worker → main. `COLD_GROUPS_CHUNK` / `COLD_READY` for
  full sync, `COLD_DELTA` for incremental, `HIT_RESULT` for picks.
- **Shared shapes** — `EntityFeatureGroup`, `HitResult`,
  `SerializedEntity`.

::: info Why a separate types file
Both `spatial.worker.ts` (worker) and `spatialBridge.ts` (main thread)
need these types, and the worker file has to be a pure module without
DOM-only imports. Putting the protocol in its own file keeps both ends
honest about what gets postMessage'd.
:::

## Exports

### Types

#### `SerializedEntity`

```ts
type SerializedEntity = MapEntity;
```

Alias clarifying that the entity goes through the structured-clone
boundary. Currently identical to `MapEntity` — the alias exists to
flag any future divergence.

#### `WorkerPublicRequest`

```ts
type WorkerPublicRequest =
  | { type: 'SYNC'; requestId: string; entities: SerializedEntity[]; excludeId?: string | null }
  | {
      type: 'INCREMENTAL';
      requestId: string;
      added: SerializedEntity[];
      removed: string[];
      updated: SerializedEntity[];
      excludeId?: string | null;
    }
  | { type: 'HIT_TEST'; requestId: string; point: [number, number]; radius: number };
```

Three message kinds the bridge exposes via `send()`. Every request
carries a `requestId` so responses can be correlated with their
caller's promise.

| Field       | Notes                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| `excludeId` | hot-layer's actively-edited entity — the worker omits it from the cold output so the hot layer can render it |
| `point`     | `[lng, lat]`                                                                                                 |
| `radius`    | lng-degrees (caller pre-converted from pixels via `pixelsToMeters`)                                          |

#### `WorkerRequest`

```ts
type WorkerRequest =
  | WorkerPublicRequest
  | { type: 'SYNC_BEGIN'; requestId: string; total: number; excludeId?: string | null }
  | {
      type: 'SYNC_CHUNK';
      requestId: string;
      entities: SerializedEntity[];
      offset: number;
      total: number;
    }
  | { type: 'SYNC_FINISH'; requestId: string };
```

The internal envelope that includes the chunked-sync sub-protocol.
Bridge sends `SYNC_BEGIN` → many `SYNC_CHUNK` → `SYNC_FINISH` when the
full SYNC payload exceeds `SYNC_ENTITY_CHUNK_SIZE = 2000`. Yields to
main between chunks so the postMessage clone doesn't block UI input.

#### `EntityFeatureGroup`

```ts
interface EntityFeatureGroup {
  id: string; // entity id, or '__unkeyed' for ungrouped
  features: GeoJSON.Feature[];
}
```

Per-entity feature list. The main thread keys its cold-layer cache by
entity id and merges these on `COLD_DELTA` messages.

#### `WorkerResponse`

```ts
type WorkerResponse =
  | {
      type: 'COLD_GROUPS_CHUNK';
      requestId: string;
      groups: EntityFeatureGroup[];
      offset: number;
      total: number;
    }
  | {
      type: 'COLD_READY';
      requestId: string;
      featureCollection?: GeoJSON.FeatureCollection;
      groups: EntityFeatureGroup[];
    }
  | { type: 'COLD_DELTA'; requestId: string; changed: EntityFeatureGroup[]; removed: string[] }
  | { type: 'HIT_RESULT'; requestId: string; hits: HitResult[] };
```

Notes:

- `COLD_GROUPS_CHUNK` is emitted _only_ by the worker when the response
  to a SYNC has more than `COLD_GROUP_CHUNK_SIZE = 1000` groups. The
  bridge buffers chunks under the request id, then merges them when
  the terminal `COLD_READY` arrives (with `groups: []`,
  `featureCollection: undefined`).
- `COLD_DELTA` is the P1 incremental optimisation: ship only the
  per-entity feature groups that changed, instead of cloning the full
  feature collection on every edit.
- `HIT_RESULT.hits` is sorted by tier (signals/icons on top, junctions
  at the bottom) then by distance. See [Workers: spatial](/api/core/workers-spatial).

#### `HitResult`

```ts
interface HitResult {
  id: string;
  entityType: string;
  distance: number; // lng-degrees, comparable to request.radius
}
```

## Behavior

- Every request must carry a `requestId`; the bridge uses it to track
  pending promises and correlate chunks.
- `COLD_GROUPS_CHUNK` does not resolve the bridge promise — only the
  terminal `COLD_READY` does. Chunks accumulate under
  `entry.chunks` in the bridge.
- `COLD_DELTA` is single-shot (no chunking) — incremental edits never
  produce enough features to need it.
- `excludeId` is purely advisory; the worker's cache still holds
  features for that entity so a subsequent SYNC that drops the
  exclusion can serve them without recomputation.

::: warning postMessage clone cost
Every entity in `WorkerPublicRequest` is structured-cloned across the
worker boundary. For a 50k-entity SYNC, the clone alone is ~150 ms on
modern hardware. This is why:

- The bridge chunks SYNC payloads above 2k entities and yields to main
  between chunks.
- The bridge breaks `COLD_READY` responses with > 1k groups into
  `COLD_GROUPS_CHUNK` messages so each one fits within a frame.
- Incremental edits never round-trip the full FC — `COLD_DELTA` ships
  only the affected entities.
  :::

## Examples

Sending a HIT_TEST from main:

```ts
const result = await bridge.send<HitResult & { type: 'HIT_RESULT' }>({
  type: 'HIT_TEST',
  point: [121.5, 31.2],
  radius: pixelsToMeters(8, 31.2, zoom) / 111320, // metres → lng-degrees
});
```

Worker responding to an INCREMENTAL request:

```ts
respond({
  type: 'COLD_DELTA',
  requestId: req.requestId,
  changed: [{ id: lane.id, features: compiled }, ...affectedNeighbours],
  removed: [...req.removed],
});
```

## Related

- [Workers: spatial](/api/core/workers-spatial) — the worker that consumes / produces these messages
- [Workers: overlap](/api/core/workers-overlap) — uses its own narrower protocol
- [Architecture: cold/hot layers](/architecture/cold-hot-layers)
