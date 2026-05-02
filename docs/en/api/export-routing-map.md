---
title: Export / Routing Map
description: Placeholder doc for the planned routing_map derivation pipeline
---

# Export / Routing Map

::: warning Not implemented
The codebase has no `buildRoutingMap()`, `encodeGraph()`,
`TopoGraph`, or `routing_map.bin` export entry. This page is a
placeholder so the URL and sidebar position remain stable when the
feature lands.
:::

## What exists today

- [Export / Base Map](/en/api/export-base-map) — current Apollo
  HD-map exporter; emits `base_map.bin` / `base_map.txt`.
- [io/apollo-io-bridge](/en/api/io/apollo-io-bridge) — worker
  bridge.
- Apollo upstream's routing_map is normally produced offline by
  `map_tool/routing_map_generator` from base_map. Apollo Map Studio
  does not yet replicate that pipeline.

## Planned API (draft)

```ts
// Draft. Not implemented.
export function exportApolloRoutingMap(): Promise<void>;

interface RoutingMapDeriveOptions {
  includeRoadGraph?: boolean; // default true
  emitVirtualLanes?: boolean; // default false
}
```

Implementation outline:

1. Extend
   `apolloIOProtocol.ApolloIORequest.BEGIN_EXPORT.format` to
   `'bin' | 'txt' | 'sim' | 'routing'`.
2. Reuse the existing topology derivation under
   `core/elements/derive` (currently fronts pred/succ) to emit
   RouteSegment / RouteEdge structures.
3. If a fully Apollo-compatible `routing_map.bin` is a goal, add
   `routing.proto` schema files under `src/proto/routing/` and let
   `loader.ts`'s glob pull them in.
4. Decide on virtual-lane emission policy: production routing_map
   files include synthetic lane nodes for junction internals so the
   planner can model lane-change costs through intersections;
   editor users will likely want this as a per-export option.
5. Add `exportApolloRoutingMap()` to `mapIO.ts`, mirroring the
   existing `exportApolloBin` / `exportApolloText` shape.

## Why a worker?

A routing_map derivation visits every lane in the network and emits
a graph with lane-cardinality node count plus pred/succ-cardinality
edge count. On a 50k-lane map this is ~50k nodes and ~150k edges,
which is fine off-thread but blocks the UI for 2–4 s if run on the
main thread. The pipeline already lives in the worker for base_map
exports — adding a routing branch reuses the same dispatch.

## Module relationships

- [Geo / Lane Geometry](/en/api/geo-lane-geometry) — endpoint
  alignment + pred/succ derivation feed the routing graph.
- [Geo / Overlap Calc](/en/api/geo-overlap-calc) — overlap itself
  is not in the routing graph, but `pncJunction.passages` constrain
  routing decisions and need to round-trip cleanly.
- [Store / Map](/en/api/store-map) — ground-truth state before
  derivation.
- `src/core/elements/derive/` — existing topology derivation hook
  point.
- [Proto / Schema](/en/api/proto-schema) — `routing.proto` will
  need to live here once added.

## Open questions

- Does the editor consume routing_map output, or is this strictly
  for downstream Apollo? If editor-only, the format can be JSON;
  if Apollo-compatible, we need the upstream `routing.proto` schema
  in-tree.
- Should `_userOverrides` flow into routing? Today they only affect
  overlap rendering — but a future user wanting to pin "this lane
  must be virtual in routing_map" would need a new override path.
- Versioning: routing_map files are typically tied to a base_map
  build id. We should put that into header metadata or sidecar.

## Timeline

No SLA. Apollo 9.0's upstream generator already covers this; the
cost-benefit of replicating it in-editor is an open question. Open
an RFC issue if you need it for a concrete deployment.

## See also

- [Export / Sim Map](/en/api/export-sim-map) — same status
  (planned).
- [Export / Base Map](/en/api/export-base-map) — what to use today.
- [io/apollo-io-protocol](/en/api/io/apollo-io-protocol) — the
  message that needs to grow when routing_map ships.
- [io/apollo-io-bridge](/en/api/io/apollo-io-bridge) — worker
  promise gateway that will gain the routing branch.
- `src/core/elements/derive/` — derivation utilities to reuse.
- `src/io/apolloIO.worker.ts` — where the new branch will run.
- Apollo upstream `modules/map/tools/map_routing_generator.cc` —
  the canonical implementation we'd be matching.
