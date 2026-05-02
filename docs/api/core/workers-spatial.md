# Workers / spatial

Sources:

- `src/core/workers/spatial.worker.ts`
- `src/core/workers/spatialBridge.ts`
- `src/core/workers/protocol.ts`
- `src/core/workers/spatialState.ts`
- `src/core/workers/spatialRequests.ts`
- `src/core/workers/spatialFeatures.ts`
- `src/core/workers/spatialHitTest.ts`

The spatial worker owns cold-layer feature generation and worker-backed hit
testing.

## Requests

- `SYNC`
- `SYNC_BEGIN`
- `SYNC_CHUNK`
- `SYNC_FINISH`
- `INCREMENTAL`
- `HIT_TEST`

`SpatialWorkerBridge` automatically chunks full syncs above 2,000 entities.

## Responses

- `COLD_READY`
- `COLD_GROUPS_CHUNK`
- `COLD_DELTA`
- `HIT_RESULT`

Chunked group responses are merged by the bridge before resolving.

## State

The worker keeps:

- `RBush` bbox tree;
- `entityMap`;
- `itemMap`;
- per-entity cold feature cache;
- lane boundary decoration cache;
- `LaneJunctionGraph`;
- pending chunk buffers.

## Hit Testing

`spatialHitTest.ts` queries the RBush by a padded bbox, then computes precise
distance to candidate line/polygon geometry. Results are sorted by pick tier
then distance.
