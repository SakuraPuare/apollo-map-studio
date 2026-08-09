---
title: workers/spatial — Cold Layer Worker
description: Main cold-layer Web Worker — maintains the RBush spatial index, feature cache, decoration cache, and LaneJunctionGraph; serves SYNC / INCREMENTAL / HIT_TEST.
---

# `workers/spatial` — Cold Layer Worker

> Source (thin dispatcher): `src/core/workers/spatial.worker.ts`
> State: `spatialState.ts` (SpatialState factory + insert/remove/sync)
> Request handling: `spatialRequests.ts` (`handleRequest`)
> Feature build: `spatialFeatures.ts` (`buildFeatureCollection` / `groupFeaturesByEntity`)
> Hit test: `spatialHitTest.ts` (`hitTest` + `PICK_TIER`)
> Main-thread bridge: `spatialBridge.ts` (`SpatialWorkerBridge`)
> Tests: `src/core/workers/__tests__/spatial.worker.test.ts` (~15 KB)

## Purpose & Invariants

`spatial.worker.ts` moves cold-layer feature compilation + RBush hit testing
into a Web Worker so that the main thread does not jank at 50k-entity scale.
The worker file itself is a thin dispatcher (10 lines + chunked respond);
all logic lives in `spatialState` / `spatialRequests` / `spatialFeatures` /
`spatialHitTest`.

Worker-local state `SpatialState`:

```ts
interface SpatialState {
  tree: RBush<SpatialItem>; // spatial index
  entityMap: Map<string, MapEntity>; // id → entity
  itemMap: Map<string, SpatialItem>; // id → bbox node
  featureCache: Map<string, GeoJSON.Feature[]>; // id → compiled cold features
  decorationCache: Map<string, GeoJSON.Feature[]>; // id → boundary decoration features
  junctionGraph: LaneJunctionGraph; // endpoint → dependent lane ids
  pendingSyncs: Map<string, { entities; total; excludeId? }>; // chunked SYNC
  laneCount: number;
}
```

### Invariants

1. **One worker instance.** `spatialBridge` constructs one worker reused for
   the session.
2. **State lives in the worker.** Main thread synchronizes through
   postMessage; no shared memory (SharedArrayBuffer not currently used —
   cross-isolate cloning is the protocol cost).
3. **`featureCache` caches `compileColdFeatures(entity)` results per entity.**
   On edit, only mutated entities recompile; unchanged entities reuse their
   features.
4. **`decorationCache` is the Phase E lever.** Boundary decoration is
   cached separately; `INCREMENTAL` decorates only affected lanes.
5. **`junctionGraph` is maintained by `addLane`/`removeLane`.** Inserts
   `[startKey, endKey]` on lane mutations; cleans entries on delete.

## Worker protocol (high level)

```mermaid
sequenceDiagram
    participant M as Main thread (SpatialWorkerBridge)
    participant W as spatial.worker

    Note over M,W: full SYNC
    M->>W: SYNC_BEGIN(total, excludeId)
    M->>W: SYNC_CHUNK(entities[0..2000])
    M->>W: SYNC_CHUNK(entities[2000..4000])
    M->>W: SYNC_FINISH
    W->>W: syncEntities (build tree + featureCache + junctionGraph)
    W->>W: buildFeatureCollection
    alt groups <= 1000
        W-->>M: COLD_READY(groups)
    else many groups
        W-->>M: COLD_GROUPS_CHUNK(groups[0..1000], offset, total)
        W-->>M: COLD_GROUPS_CHUNK(groups[1000..], ...)
        W-->>M: COLD_READY(groups: [], featureCollection: undefined)
    end

    Note over M,W: incremental
    M->>W: INCREMENTAL(added, removed, updated, excludeId?)
    W->>W: collectPreMutationDependents (old lane dependents)
    W->>W: applyIncrementalMutations
    W->>W: collectPostMutationDependents (new lane dependents)
    W->>W: buildFeatureCollection(affected)
    W-->>M: COLD_DELTA(changed, removed)

    Note over M,W: hit test
    M->>W: HIT_TEST(point, radius)
    W->>W: tree.search + pointToPolyline/PolygonDistGeo
    W-->>M: HIT_RESULT(hits sorted by PICK_TIER + distance)
```

Full message types are documented in [workers/protocol](./workers-protocol).

## handleRequest dispatch (spatialRequests.ts)

```ts
function handleRequest(state: SpatialState, req: WorkerRequest, respond: Respond) {
  switch (req.type) {
    case 'SYNC':
      handleSync(state, req, respond);
    case 'SYNC_BEGIN':
      handleSyncBegin(state, req);
    case 'SYNC_CHUNK':
      handleSyncChunk(state, req);
    case 'SYNC_FINISH':
      handleSyncFinish(state, req, respond);
    case 'INCREMENTAL':
      handleIncremental(state, req, respond);
    case 'HIT_TEST':
      respond({ type: 'HIT_RESULT', hits: hitTest(state, req.point, req.radius) });
  }
}
```

### `handleIncremental` details

```mermaid
flowchart TD
    A[INCREMENTAL request] --> B[affected = empty Set]
    B --> C[collectPreMutationDependents]
    C --> D[applyIncrementalMutations:<br/>removeEntity / updated → remove+insert / addEntity]
    D --> E[collectPostMutationDependents]
    E --> F[deltaIds = affected ∪ updated.id ∪ added.id - removed]
    F --> G[fc = buildFeatureCollection state, excludeId, affected]
    G --> H[changed = groupFeaturesByEntity fc.features filter g.id in deltaIds]
    H --> I[respond COLD_DELTA changed, removed]
```

`affected` includes endpoint-sharing lanes (pre + post) so decoration is
refreshed for every visibly affected lane. `deltaIds` is the set of entity
groups returned to the main thread.

## buildFeatureCollection (spatialFeatures.ts)

```mermaid
flowchart TD
    BF[buildFeatureCollection] --> IN[inputFeatures = featureCache flat excluding excludeId]
    IN --> LC{laneCount < 1?}
    LC -->|yes| EMPTY[clear decorationCache;<br/>return inputFeatures]
    LC -->|no| INC{affectedLaneIds?}
    INC -->|incremental| DA[decorateOnly = affectedLaneIds]
    INC -->|full| DB[decorateOnly = null]
    DA --> SJ[applyLaneJunctions stitch + decorate]
    DB --> SJ
    SJ -->|incremental| CL1[clear cache for affected;<br/>fill cache for affected]
    SJ -->|full| CL2[clear all decoration cache;<br/>fill cache for all decorated]
    CL1 --> AC[append cached decoration of unaffected]
    CL2 --> RV[return featureCollection]
    AC --> RV
```

## hitTest (spatialHitTest.ts)

```mermaid
flowchart TD
    H[HIT_TEST point, radius] --> CL[cosLat = max cos py, 1e-6]
    CL --> RB[tree.search bbox padded by r and r·cosLat]
    RB --> CD[for each candidate]
    CD --> EC[entityRenderCoords entity]
    EC --> AR{isAreaEntity?}
    AR -->|yes| PG[pointToPolygonDistGeo]
    AR -->|no| PL[pointToPolylineDistGeo]
    PG --> CK{<= r?}
    PL --> CK
    CK -->|yes| AD[push HitResult]
    AD --> S[sort by PICK_TIER then distance]
    S --> R[return HitResult]
```

`PICK_TIER` (`spatialHitTest.ts:13-31`):

| tier        | entityType                                                       |
| ----------- | ---------------------------------------------------------------- |
| 0           | signal / stopSign / yieldSign / rsu / barrierGate / speedControl |
| 1           | crosswalk / speedBump / parkingSpace                             |
| 2           | lane / road / overlap                                            |
| 3           | clearArea / junction / pncJunction / parkingLot / area           |
| 9 (default) | other                                                            |

Lower tier wins, so a click on a signal icon is never stolen by the junction
polygon underneath.

## SpatialWorkerBridge (spatialBridge.ts)

Main-thread façade:

- `send(request, timeout?)` → `Promise<WorkerResponse>`
- Each request has a `requestId`; a pending Map tracks resolve/reject + timer.
- `SYNC` with > 2000 entities is automatically chunked (`postChunkedSync`),
  yielding to the main task loop between chunks.
- `mergeChunks` combines `COLD_GROUPS_CHUNK` and `COLD_READY` into a single
  response.
- `dispose()` clears pending and terminates the worker.

Default timeout = 120 s (a 50k-entity cold sync can take > 10 s; 12× headroom).

## Complexity

| Operation | Complexity |
| ----------- | ------------------------------------------------------------- | -------- | ------------------------------- |
| SYNC | O(N + L·B); N=entities, L=lanes, B=boundary segments per lane |
| INCREMENTAL | O( | affected | ·B + Δentities·feature_compile) |
| HIT_TEST | O(log N + k·V); k=candidates, V=avg vertices |

## Test coverage

`spatial.worker.test.ts` covers:

- SYNC: tree.search returns the right candidate count.
- SYNC_BEGIN/CHUNK/FINISH: chunked sync correctness.
- INCREMENTAL: added / removed / updated combinations produce correct changed sets.
- HIT_TEST: clicking on a lane returns the lane (not the underlying junction).
- excludeId: does not appear in the feature collection.
- Endpoint-shared lane modifications include the peer in `affected` (junctionGraph).

## See also

- [workers/protocol](./workers-protocol) — full message types
- [workers/junction-graph](./workers-junction-graph) — `LaneJunctionGraph` internals
- [geometry/laneJunctions](./geometry-lane-junctions) — `applyLaneJunctions`
- [geometry/hitTest](./geometry-hit-test) — `pointToPolylineDistGeo` /
  `pointToPolygonDistGeo`
- [hooks/useColdLayer](/en/api/hooks/use-cold-layer) — main-thread caller of
  `SpatialWorkerBridge.send`
