# Adding a Web Worker

Workers carry CPU-heavy work off the main thread so React stays
responsive. The codebase uses two production workers — **spatial**
(cold layer indexing + hit testing) and **apollo IO** (proto
import/export) — plus an **overlap** worker for derived geometry.
This recipe shows when to spin up a new worker, the file layout the
codebase expects, the postMessage protocol, and the gotchas that have
bitten us before.

## When to add a worker

Add a worker when **all** of these hold:

1. The work is CPU-bound (parsing, geometry, indexing, large
   array transforms) — not I/O-bound.
2. A single invocation can exceed ~16ms on a representative dataset.
3. The work has a stable, structured-clone-able request/response
   shape — no DOM access, no React refs, no class instances with
   methods.
4. The result fits in a single postMessage (or can be naturally
   chunked).

Don't add a worker for one-off ~1ms helpers or for code that needs DOM
access (e.g. SVG rasterising — `mapIcons.ts` rasterises on the main
thread because workers can't reach `<canvas>` 2D context with the
right text metrics).

## File layout

The codebase pins three files per worker, all under
`src/core/workers/`:

```text
src/core/workers/
  spatial.worker.ts       # the worker entry — runs in the worker thread
  spatialBridge.ts        # main-thread RPC bridge — class with .send() / .dispose()
  protocol.ts             # shared request/response types
  spatialState.ts         # in-worker state (cache, index, …)
  spatialRequests.ts      # request → response handler dispatch
  spatialFeatures.ts      # pure geometry → feature builders
  spatialHitTest.ts       # pure hit-test geometry
  laneJunctionGraph.ts    # in-worker derivation logic
  __tests__/
```

When adding a new worker (e.g. `routing.worker.ts`):

1. `routing.worker.ts` — the entry point. Subscribes to
   `self.onmessage` and dispatches.
2. `routingBridge.ts` — the main-thread class. Mirror the
   `SpatialWorkerBridge` shape exactly: pending request map, request
   id counter, timeout per pending request.
3. `routingProtocol.ts` (or extend `protocol.ts`) — the shared types
   for request and response messages, both directions.

Keep transformation helpers in separate `.ts` files imported from the
worker entry. This keeps the worker entry small and leaves the heavy
logic unit-testable from the main thread.

## Protocol shape

Look at `src/core/workers/protocol.ts` for the canonical pattern:

```ts
// Main → Worker
export type WorkerPublicRequest =
  | { type: 'SYNC'; requestId: string; entities: SerializedEntity[]; … }
  | { type: 'INCREMENTAL'; requestId: string; added: …; removed: …; updated: …; … }
  | { type: 'HIT_TEST'; requestId: string; point: [number, number]; radius: number };

// Worker → Main
export type WorkerResponse =
  | { type: 'COLD_READY'; requestId: string; … }
  | { type: 'COLD_DELTA'; requestId: string; changed: …; removed: string[] }
  | { type: 'HIT_RESULT'; requestId: string; hits: HitResult[] };
```

Three rules:

- **Every message carries `requestId`** so the bridge can match
  responses to their pending promises. Use a monotonic counter:
  `req_${++this.counter}`.
- **Responses are discriminated by `type`** so TypeScript narrows
  inside the bridge.
- **Internal messages** (`SYNC_BEGIN`, `SYNC_CHUNK`, `SYNC_FINISH`)
  belong to a separate `WorkerRequest` type that the bridge can use
  but external callers cannot — keep the public surface narrow.

## Bridge skeleton

`SpatialWorkerBridge` is the reference. Critical pieces:

```ts
export class SpatialWorkerBridge {
  private worker: Worker;
  private pending = new Map<string, PendingEntry>();
  private counter = 0;
  private disposed = false;

  constructor() {
    this.worker = new Worker(new URL('./spatial.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      /* resolve pending */
    };
    this.worker.onerror = (e) => {
      /* reject all pending */
    };
  }

  send<T extends WorkerResponse>(
    request: WorkerRequestPayload,
    timeout = DEFAULT_TIMEOUT,
  ): Promise<T> {
    /* ... */
  }

  dispose() {
    this.disposed = true;
    this.worker.terminate();
    this.pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new Error('Worker terminated'));
    });
    this.pending.clear();
  }
}
```

The `new URL('./your.worker.ts', import.meta.url)` constructor is
Vite-aware — it ensures the worker bundle is built and the import
resolves at runtime. Do not import the worker module by relative
path; that bypasses Vite's worker bundling.

## structuredClone boundary

Every object you pass to `postMessage` is **deep-cloned** by the
browser. Three implications:

- **No functions, no class instances with methods.** An entity that
  carries a `compile()` method gets stripped. Stick to plain data.
- **No shared mutability.** Mutating the entity on one side does not
  reflect on the other. Treat each side's copy as immutable.
- **Cost scales with size.** Cloning 50k features per draw click
  shows up in profiles. Use INCREMENTAL deltas (`COLD_DELTA`) to ship
  only what changed, not the entire feature collection.

`SpatialWorkerBridge.postChunkedSync` chunks large SYNC payloads to
avoid blowing out the postMessage budget on 50k+ entity maps. If your
worker's request can grow unbounded, mirror that pattern.

## Transferables

For payloads that include `ArrayBuffer` / `MessagePort` /
`OffscreenCanvas` / `ImageBitmap`, pass them as **transferables** to
hand ownership over instead of cloning:

```ts
const buffer = new ArrayBuffer(1_000_000);
worker.postMessage({ type: 'INGEST', buffer }, [buffer]);
// `buffer` is detached on the main thread — accessing .byteLength now
// throws. Transfer is one-way and one-shot.
```

The spatial worker doesn't currently use transferables because its
data is plain JSON-shaped; the apollo IO worker uses `ArrayBuffer`
transferables for the binary `.bin` payload to avoid cloning a few MB
on every import.

## Cancellation

The bridges in this codebase do not implement explicit per-request
cancellation — they rely on **request-id supersession**. Pattern:

```ts
private latestRequestId: string | null = null;

async sync(entities: Entity[]) {
  const reqId = `req_${++this.counter}`;
  this.latestRequestId = reqId;
  const result = await this.send({ type: 'SYNC', entities });
  if (this.latestRequestId !== reqId) {
    // a newer SYNC has been issued — drop this result
    return;
  }
  // apply result
}
```

For hard cancellation (long-running parses), terminate and respawn
the worker — `dispose()` then re-construct. This is a heavy hammer;
only do it when the worker is genuinely stuck.

## Worker-side lifecycle

The worker entry is small:

```ts
// src/core/workers/routing.worker.ts
import type { WorkerRequest, WorkerResponse } from './routingProtocol';
import { handleRequest } from './routingRequests';
import { createRoutingState } from './routingState';

const state = createRoutingState();

function respond(msg: WorkerResponse) {
  postMessage(msg);
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  handleRequest(state, e.data, respond);
};
```

`handleRequest` is a pure dispatcher — switch on `request.type`,
mutate `state` in place, call `respond` with the result. Keep all
geometry / parsing logic in separate modules so they can be unit
tested from the main thread without spinning up a worker.

## Testing

Workers are awkward to spin up in Vitest. The convention:

- **Unit-test the helpers, not the worker entry.** `spatialFeatures.ts`,
  `spatialHitTest.ts`, `laneJunctionGraph.ts` all test cleanly without
  a worker.
- **Bridge tests use a `vi.fn()`-shaped fake worker.** Don't try to
  load the real bundled worker; mock the `Worker` constructor.
- **Integration tests run end-to-end at the hook level.**
  `useColdLayer` tests instantiate the real bridge in jsdom-with-worker
  setup.

## Common mistakes

- **Importing main-thread modules from the worker entry.** If a
  module pulls in zustand, react, or anything DOM-aware, the worker
  bundle blows up at import time. Keep the dependency tree disciplined
  — only `core/`, `types/`, `config/` are safe.
- **Forgetting `requestId` on a response.** The bridge's pending map
  never resolves and the timeout fires after `DEFAULT_TIMEOUT`
  (120s in the spatial bridge). Symptom: hang followed by a generic
  timeout error.
- **Returning DOM types** (e.g. an `HTMLImageElement`). They're not
  structured-clone-able — postMessage throws synchronously.
- **Holding state on the bridge instead of in the worker.** State
  belongs **inside** the worker so it survives between messages and
  the main thread can stay stateless. The bridge only tracks pending
  promises.

## Verification

1. `pnpm typecheck` — protocol types are referenced from both ends.
2. `pnpm test` — helper tests pass.
3. `pnpm dev` — DevTools → Sources → look for the worker bundle
   under `worker.js?worker_file&type=module`. Network panel shows the
   worker request when the bridge instantiates.
4. Profiler: a 60fps interaction should not show your worker's
   handler on the main thread flame chart.

## Cross-references

- [/architecture/overview](../architecture/overview.md) — cold-layer
  pipeline diagram
- [/api/core](../api/core/) — `SpatialWorkerBridge` API
- [debugging-the-map-pipeline](./debugging-the-map-pipeline.md) — how
  to trace a worker round-trip
