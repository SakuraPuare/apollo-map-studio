# Worker Protocol

Apollo Map Studio uses three worker boundaries:

| Worker           | File                                 | Responsibility                                                             |
| ---------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| Spatial worker   | `src/core/workers/spatial.worker.ts` | cold feature generation, RBush hit testing, lane junction decoration cache |
| Overlap worker   | `src/core/workers/overlap.worker.ts` | full overlap reconciliation off the main thread                            |
| Apollo IO worker | `src/io/apolloIO.worker.ts`          | protobuf decode/encode, projection, import/export round trip               |

## Spatial Worker

Public requests are defined in `src/core/workers/protocol.ts`:

- `SYNC`
- `INCREMENTAL`
- `HIT_TEST`

Large full syncs are chunked by `SpatialWorkerBridge` into:

- `SYNC_BEGIN`
- `SYNC_CHUNK`
- `SYNC_FINISH`

Responses:

- `COLD_READY`
- `COLD_GROUPS_CHUNK`
- `COLD_DELTA`
- `HIT_RESULT`

The worker state includes:

- `RBush<SpatialItem>` for bbox queries;
- `entityMap` and `itemMap`;
- per-entity `featureCache`;
- lane `decorationCache`;
- `LaneJunctionGraph`;
- pending chunked sync buffers.

## Overlap Worker

`OverlapWorkerBridge.reconcileFull(entities)` sends a snapshot of entities and
waits for a `ReconcilePatch`. The worker computes:

- changed overlap entities;
- removed overlap ids;
- stats (`pairsTested`, `pairsMatched`, created/removed counts, duration).

The store applies the patch on the main thread so zundo sees one transaction.

## Apollo IO Worker

Requests are defined in `src/io/apolloIOProtocol.ts`. The main flows are:

- `IMPORT_BIN` / `IMPORT_TEXT`
- `NEEDS_PROJECTION` / `RESOLVE_PROJECTION`
- `IMPORT_ENTITIES_CHUNK` / `IMPORT_RESULT`
- `BEGIN_EXPORT` / `EXPORT_ENTITIES_CHUNK` / `FINISH_EXPORT`
- `EXPORT_BIN_RESULT` / `EXPORT_TEXT_RESULT`
- `CLEAR`
- `PROGRESS`
- `ERROR`

The bridge owns request ids, timeouts, chunking and progress callbacks. The
worker owns heavy CPU and cached raw map state.

## Boundary Rules

- Workers receive plain structured-cloneable data only.
- Workers do not import React, Zustand stores or DOM APIs.
- Store patches are applied on the main thread.
- Long-running requests have explicit timeout/dispose handling.
- Progress is advisory; correctness must not depend on progress monotonicity.
