# Store / mapStore

Source: `src/store/mapStore.ts`.

`mapStore` holds the canonical entity graph and is **the only undoable
store** in the app. Every Apollo entity, every drawing primitive, and
every overlap lives in its `entities` Map. Mutations flow through the
license editable-guard, immer drafts, and `zundo` `temporal`
middleware so undo / redo always rolls back to a consistent snapshot.

See [/architecture/state-management](/architecture/state-management)
for the R1 undo invariant (`CANCEL` before `temporal.undo()`).

## State Shape

```ts
interface MapState {
  entities: Map<string, MapEntity>;
}
```

`MapEntity` is a discriminated union over `entityType` covering Apollo
entities (`lane`, `road`, `junction`, `crosswalk`, `signal`,
`stopSign`, `yieldSign`, `speedBump`, `clearArea`, `parkingSpace`,
`pncJunction`, `rsu`, `area`, `barrierGate`, `overlap`) plus
editor-only drawing primitives (`polyline`, `catmullRom`, `bezier`,
`arc`, `rect`, `polygon`).

## Actions

```ts
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
```

### Single-entity mutations

`addEntity` and `updateEntity` run inside one immer draft:

1. `assertEditable(action)` short-circuits on read-only.
2. Write the entity to `state.entities`.
3. If `entityType` is topology-affecting (`lane` / `junction`), run
   `reconcileLaneTopologyIncremental` and merge changes.
4. Run `applyOverlapPatch` (incremental) over the accumulated dirty
   set.

`updateEntity` additionally captures the previous entity and passes
it as `previousEntities` so the topology reconciler can compare
`pred` / `succ` before / after.

### `removeEntity(id)`

The most complex mutator:

1. Editable guard.
2. Capture removed entity reference and bbox.
3. Use `getSharedSpatialIndex()` to collect spatial-neighbour lanes
   (geometry-derived overlaps that don't reference the removed id
   still need reconcile coverage).
4. Run `cascadeDeleteRefsFull` for direct reference cleanup
   (`changes`) and orphaned-overlap detection (`cascadeRemoved`).
5. Inside one immer producer: apply cleanups, delete cascade orphans,
   delete the original, run topology + overlap reconcile.
6. If the removed entity was a lane, call `invalidateLaneCaches`.

### `reparentEntity(childId, target)`

Wraps `reparent` from `@/lib/entityOps`. Returns `ReparentResult` so
callers can surface UX feedback. No topology / overlap reconcile —
reparent only touches `junctionId` / `road.section.laneIds`.

### `batchImport(entities)`

Single-transaction bulk loader: write everything, run **full**
topology reconcile, then **full** overlap reconcile. Avoids the
accumulated drift of N incremental rounds.

### `replaceImportedEntities` / `replaceImportedEntityMap`

```ts
replaceImportedEntityMap(entities) {
  const t = useMapStore.temporal.getState();
  t.pause();
  try {
    set({ entities });
    t.clear();
  } finally {
    t.resume();
  }
  resetSharedSpatialIndex();
}
```

Pause + clear undo so the post-import state is the new "initial". The
shared spatial index is reset because the previous session's entries
are stale.

### `recomputeOverlapsAsync()`

Off-thread overlap rebuild via `OverlapWorkerBridge`. Result patches
land in a single zundo transaction; the shared spatial index is
reset afterwards.

## zundo Middleware

```ts
temporal(immer(...), {
  partialize: (state) => ({ entities: state.entities }),
  limit: readHistoryLimit(),
});
```

- `partialize` keeps only `entities` in history (action methods are
  never snapshotted).
- `limit` is read once at module-load from `settingsStore`. Changes
  apply on next reload.

`useMapStore.temporal.getState()` exposes `undo`, `redo`, `pause`,
`resume`, `clear`, plus `pastStates` / `futureStates`.

## Examples

```ts
// Add an entity
useMapStore.getState().addEntity({ id: 'lane_1', entityType: 'lane' /* ... */ });

// Subscribe in a component
const count = useMapStore((s) => s.entities.size);

// Undo / redo
useMapStore.temporal.getState().undo();

// Recompute overlaps off-thread
const stats = await useMapStore.getState().recomputeOverlapsAsync();
```

## Related

- [/architecture/state-management](/architecture/state-management)
- [/api/lib/editable-guard](/api/lib/editable-guard)
- [/api/lib/entity-ops](/api/lib/entity-ops)
- [/api/store/settings-store](/api/store/settings-store) — `historyLimit` source.
- [/api/store/ui-store](/api/store/ui-store) — non-undoable UX state.
