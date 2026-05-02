# Spatial Index

Spatial indexing appears in two places:

- `src/core/workers/spatialState.ts` for render/hit-test worker state.
- `src/core/elements/overlap/spatialIndex.ts` for overlap reconciliation.

Both exist to avoid scanning every entity for every query, but they serve
different pipelines.

## Render Hit Testing

The spatial worker stores one `RBush<SpatialItem>` entry per entity. Each item
contains bbox, id and entity type. `HIT_TEST` requests:

1. Query the RBush by a point-radius bbox.
2. Load candidate entities from `entityMap`.
3. Measure point-to-polyline or point-to-polygon distance.
4. Sort by pick tier and distance.

Pick tier mirrors visual priority: symbols such as signals beat lanes, and
large areas such as junctions lose ties.

## Overlap Reconciliation

Overlap code uses its own spatial index to find geometric candidate pairs for
lane/object overlap detection. The shared main-thread index is reset after
large worker recomputes so stale state cannot poison the next incremental
edit.

## Cache Invalidation

On entity removal, `mapStore.removeEntity()` collects spatial neighbor lanes
before deleting the entity. This matters when deleting a non-lane object whose
nearby lanes must lose overlap references even though those lanes did not
directly reference the removed id before reconcile.
