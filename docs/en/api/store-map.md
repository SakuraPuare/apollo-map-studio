---
title: Store / Map
description: src/store/mapStore.ts — entities map, zundo undo, cascade delete, topology and overlap reconcile
---

# Store / Map

`src/store/mapStore.ts` is the entity-state layer for Apollo Map
Studio. A single `Map<id, MapEntity>` covers all 18 Apollo HD-map
entity types **and** the 6 drawing primitives. zundo undo, cascade
reference cleanup, lane topology recompute, and overlap reconcile all
live inside one immer producer per mutation, giving you the
**one-mutation-equals-one-zundo-transaction** invariant the rest of
the editor relies on.

## Module boundary

| Store            | Scope                                       | In zundo?                      |
| ---------------- | ------------------------------------------- | ------------------------------ |
| `mapStore`       | entity table (`Map<id, MapEntity>`)         | yes (`partialize: entities`)   |
| `apolloMapStore` | `header`, `bounds`, `info`, `lastError`     | no — import context            |
| `uiStore`        | grid / snap / cursor / layer / current zoom | no — UX preferences            |
| `settingsStore`  | history limit / map zoom / lane half-width  | no — persisted to localStorage |

## Exported symbols

```ts
import { create } from 'zustand';
import type { MapEntity } from '@/types/entities';
import type { ParentTarget, ReparentResult } from '@/lib/entityOps';

interface MapState {
  entities: Map<string, MapEntity>;
}

interface MapActions {
  addEntity(entity: MapEntity): void;
  updateEntity(id: string, entity: MapEntity): void;
  removeEntity(id: string): void;
  reparentEntity(childId: string, target: ParentTarget): ReparentResult;
  batchImport(entities: MapEntity[]): void;
  replaceImportedEntities(entities: MapEntity[]): void;
  replaceImportedEntityMap(entities: Map<string, MapEntity>): void;
  recomputeOverlapsAsync(): Promise<{
    pairsTested: number;
    pairsMatched: number;
    overlapsCreated: number;
    overlapsRemoved: number;
    durationMs: number;
  } | null>;
}

type MapStore = MapState & MapActions;

export const useMapStore: import('zustand').UseBoundStore<MapStore> & {
  temporal: ReturnType<typeof import('zundo').temporal>;
};
```

> Source: `src/store/mapStore.ts:29-264`.

## Actions

### `addEntity(entity)`

Insert a new entity, then incrementally reconcile topology and
overlaps.

| Param    | Type        | Description                   |
| -------- | ----------- | ----------------------------- |
| `entity` | `MapEntity` | Already-derived entity to add |

Side effects:

- Aborts via `assertEditable('addEntity')` when the license is
  read-only;
- Calls `reconcileLaneTopologyIncremental` when the entity type is
  `lane` or `junction`;
- Calls `applyOverlapPatch(state, dirty)` with `dirty = { entity.id }
∪ topology-rewritten ids`;
- Patch (changes + removedOverlapIds) lands in the immer draft,
  sharing the zundo transaction with the parent mutation.

```ts
useMapStore.getState().addEntity({
  id: 'lane_42',
  entityType: 'lane',
  centralCurve: {
    segments: [
      /* ... */
    ],
  },
  // ...
});
```

### `updateEntity(id, entity)`

Idempotent replace. Returns silently when the id does not already
exist — does **not** behave like addEntity.

| Param    | Type        | Description                            |
| -------- | ----------- | -------------------------------------- |
| `id`     | `string`    | Existing entity id                     |
| `entity` | `MapEntity` | Replacement entity (must keep same id) |

Special trick: passes `previousEntities = Map([[id, previous]])` to
`reconcileLaneTopologyIncremental` so it can detect lanes that **stop**
being neighbours after the edit (and remove them from `pred/succ`).

### `removeEntity(id)`

Three-phase cascade cleanup. The pre-collection of spatial neighbour
lanes is the subtle part: see the Chinese section above for the full
chain of reasoning. The summary is that overlaps reach across
geometric proximity, not just declared `overlapIds`, so we capture
neighbours **before** deleting.

```ts
useMapStore.getState().removeEntity('junction_3');
```

### `reparentEntity(childId, target)`

Re-parent a lane / road / rsu via `entityOps.reparent`.

| Param     | Type           | Description                                                 |
| --------- | -------------- | ----------------------------------------------------------- |
| `childId` | `string`       | Entity to re-parent                                         |
| `target`  | `ParentTarget` | `{ kind: 'junction' \| 'road' \| 'roadSection' \| 'none' }` |

Returns `ReparentResult`:

```ts
interface ReparentResult {
  changes: Map<string, MapEntity>;
  rejected?: string;
}
```

`rejected` is a human-readable explanation when the target type does
not accept this child kind. Empty `changes` means "no-op" (already
correctly parented).

### `batchImport(entities)`

Import-path only — does **not** assert editability. Writes everything,
runs `reconcileLaneTopology` (full mode), then `reconcileOverlaps({
mode: 'full' })`. Synchronous on the main thread; ~450ms for ~50k
entities. For larger maps callers should fan out to
`recomputeOverlapsAsync`.

### `replaceImportedEntities(entities) / replaceImportedEntityMap(map)`

Replace the entities table and clear zundo history. Mandatory after
import, otherwise the history stack pages in O(n) of import size.
The `Map` form skips one `Array.from + new Map` round trip.

### `recomputeOverlapsAsync(): Promise<stats | null>`

Off-main-thread full reconcile. Useful after large user actions or
just before exporting. Stats fields are listed in the Chinese
section above; on completion the spatial index is reset so the next
incremental edit starts from a clean rebuild.

### Temporal API (zundo)

```ts
useMapStore.temporal.getState().undo();
useMapStore.temporal.getState().redo();
useMapStore.temporal.getState().clear();
```

The history limit is bounded by `readHistoryLimit()` from
`settingsStore` (default 100). UI surfaces should always go through
`useActionDispatcher` so the FSM receives `CANCEL` first; calling
`undo()` directly mid-draw corrupts FSM `drawPoints`.

## Invariants

1. The dirty set passed to incremental reconcile must cover every
   entity whose geometry changed. Missing ids leave `SpatialIndex`
   stale and produce phantom overlaps on the next edit.
2. `SpatialIndex.bboxSig` is the geometry-change signature; non-
   geometric field changes (e.g. setting `lane.junctionId`) skip
   R-tree mutation entirely.
3. All mutators except `batchImport` gate on `assertEditable`. Trial
   builds hard-fail past expiry.

## Tests

`src/store/__tests__/mapStore.test.ts` covers:

- The R1 undo-cancel closure (`useActionDispatcher` sends CANCEL
  before `temporal.undo()`);
- Incremental reconcile drift after a sequence of mixed addEntity /
  updateEntity / removeEntity calls;
- `cascadeDeleteRefsFull` corner cases: orphan-overlap removal,
  passage stripping in pncJunction, junction unlinking on lane
  removal.
