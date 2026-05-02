# Workers / overlap

Sources:

- `src/core/workers/overlap.worker.ts`
- `src/core/workers/overlapBridge.ts`
- `src/core/elements/overlap/*`

The overlap worker runs full overlap reconciliation off the main thread.

## Bridge

```ts
const bridge = new OverlapWorkerBridge();
const patch = await bridge.reconcileFull(entities);
bridge.dispose();
```

The bridge:

- creates a module worker;
- assigns request ids;
- rejects on timeout;
- converts serialized `changes` and `removedOverlapIds` back to `Map` and
  `Set`;
- terminates pending requests on dispose or worker error.

## Store Integration

`mapStore.recomputeOverlapsAsync()` sends the current entity snapshot to the
worker, then applies the returned patch inside one `set()` call. It resets the
main-thread shared spatial index afterward so subsequent incremental edits do
not use stale worker-side state.

## Output

The patch includes:

- `changes: Map<string, MapEntity>`;
- `removedOverlapIds: Set<string>`;
- `stats` with pairs tested/matched, created/removed and duration.
