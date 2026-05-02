# Core / SpatialWorkerBridge

Source: `src/core/workers/spatialBridge.ts`.

`SpatialWorkerBridge` wraps `spatial.worker.ts` with request ids, timeout
handling, chunked full syncs and chunk merging.

The canonical worker details are in [Workers / spatial](/en/api/core/workers-spatial).
