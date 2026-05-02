---
title: io / apollo-io-bridge
description: src/io/apolloIOBridge.ts — main-thread → apolloIO.worker promise gateway
---

# io / apollo-io-bridge

`src/io/apolloIOBridge.ts` is the main-thread → `apolloIO.worker`
**promise gateway**. It wraps the `apolloIOProtocol` round trips
into four Promise-style methods, handling timeouts, worker respawn,
entity-chunk reassembly, and the `NEEDS_PROJECTION` dialog hand-off.

## Public surface

```ts
export interface ApolloImportWorkerResult {
  info: ApolloMapImportInfo;
  header: ApolloMapHeader | null;
  bounds: ApolloMapBounds | null;
  entities: MapEntity[];
  stats: ApolloImportStats;
}

class ApolloIOBridge {
  importBin(filename, bytes, onProgress?): Promise<ApolloImportWorkerResult>;
  importText(filename, bytes, onProgress?): Promise<ApolloImportWorkerResult>;
  exportBin(entities, projString, onProgress?): Promise<Uint8Array>;
  exportText(entities, projString, onProgress?): Promise<Uint8Array>;
  clear(): Promise<void>;
}

export const apolloIOBridge: ApolloIOBridge; // module singleton
```

> Source: `src/io/apolloIOBridge.ts:59-309`.

`onProgress` receives
`ApolloIOProgress = { label: string; detail?: string; progress: number | null }`;
callers usually forward to `taskProgressStore.updateTask`.

## Internal state

```ts
type PendingEntry =
  | { kind: 'import'; resolve; reject; timer; onProgress?; entities: MapEntity[] }
  | { kind: 'exportBin'; resolve; reject; timer; onProgress? }
  | { kind: 'exportText'; resolve; reject; timer; onProgress? }
  | { kind: 'clear'; resolve; reject; timer; onProgress? };
```

`pending: Map<requestId, PendingEntry>` plus a monotonic `counter`
generating ids of the form `${prefix}_${++counter}`. The worker is
spawned lazily by `ensureWorker()` on the first `post()`.

## Flow

### Import

```ts
importBin(filename, bytes, onProgress) →
  register(requestId, { kind: 'import', ..., entities: [] })
  post({ type: 'IMPORT_BIN', requestId, filename, bytes }, [bytes.buffer])
```

`bytes.buffer` is transferred to avoid copy. The worker streams
`IMPORT_ENTITIES_CHUNK × N` then `IMPORT_RESULT`; `handleMessage`
accumulates chunks into `entry.entities`.

### Export (chunked)

```ts
exportBin(entities, projString, onProgress) →
  post({ type: 'BEGIN_EXPORT', requestId, format, projString, total })
  for chunk of entities (size 2000):
    post({ type: 'EXPORT_ENTITIES_CHUNK', requestId, entities, offset, total })
    onProgress(...)                // 0.02..0.10
    await yieldToMain()            // setTimeout(0)
  post({ type: 'FINISH_EXPORT', requestId })
  ← EXPORT_BIN_RESULT { bytes }    // transferable
```

`yieldToMain()` is `new Promise(resolve => setTimeout(resolve, 0))`
to keep the React commit phase responsive during a 500k-entity
serialise loop.

### `NEEDS_PROJECTION`

```ts
if (msg.type === 'NEEDS_PROJECTION') {
  const picked = await useProjDialogStore.getState().request();
  const projString = picked ?? FALLBACK_PROJ; // UTM_PRESETS.beijing
  this.post({ type: 'RESOLVE_PROJECTION', requestId: msg.requestId, projString });
  return;
}
```

`useProjDialogStore.request()` returns `Promise<string | null>`. The
bridge collapses `null` to `UTM_PRESETS.beijing`.

### Timeouts & failures

- `register` schedules `setTimeout(..., DEFAULT_TIMEOUT_MS =
600_000)`; timeout rejects with
  `Apollo IO request timed out after 600000ms`.
- Worker `onerror` → `disposeWorker()` then reject every pending
  entry.
- Any reject path runs `clearTimeout` and `pending.delete`.

## Coupling

- Depends on `apolloIOProtocol` for message shapes.
- Depends on `useProjDialogStore` for the projection dialog.
- Depends on `proto/projection.UTM_PRESETS.beijing` as fallback.

## See also

- [io/apollo-io-protocol](/en/api/io/apollo-io-protocol) — message
  shapes.
- [io/map-io](/en/api/io/map-io) — primary consumer.
- [Import / Parse Base Map](/en/api/import-parse-base-map) and
  [Export / Base Map](/en/api/export-base-map) — orchestrating
  callers.
