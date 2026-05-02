---
title: Export / Sim Map
description: Placeholder doc for the planned sim_map derivation pipeline
---

# Export / Sim Map

::: warning Not implemented
There is no `buildSimMap()`, downsample pass, or `sim_map.bin`
export entry in the codebase yet. This page exists so the URL and
sidebar position can stay stable when the feature lands.
:::

## What exists today

If you came here searching for `buildSimMap` or similar:

- [Export / Base Map](/en/api/export-base-map) — `exportApolloBin` /
  `exportApolloText` are the only Apollo HD-map exporters today,
  emitting `base_map.bin` / `base_map.txt`.
- [io/apollo-io-bridge](/en/api/io/apollo-io-bridge) — main-thread
  → worker promise gateway.
- [io/apollo-io-protocol](/en/api/io/apollo-io-protocol) — worker
  IPC contract. `BEGIN_EXPORT.format` only accepts `'bin' | 'txt'`.

Apollo upstream typically derives `sim_map` / `routing_map` offline
from `base_map` via `map_tool` after the editor exports. Apollo Map
Studio does not duplicate that derivation yet.

## Planned API (draft)

```ts
// Draft. Not implemented.
export function exportApolloSimMap(): Promise<void>;

interface SimMapDeriveOptions {
  simplifyToleranceM?: number; // default 0.5 m
  stripExtras?: boolean; // default true
  /** Drop overlap/region polygons; sim consumers don't read them. */
  dropRegions?: boolean; // default true
}
```

Implementation outline:

1. Extend
   `apolloIOProtocol.ApolloIORequest.BEGIN_EXPORT.format` to
   `'bin' | 'txt' | 'sim'`.
2. Add a `runDerive` branch in `apolloIO.worker.runExport` for
   `format === 'sim'`:
   - reuse `applyImportTopology()` for reconcile;
   - simplify lane centerlines via Ramer-Douglas-Peucker (typical
     tolerance 0.5 m);
   - strip fields sim_map consumers ignore (e.g.
     `signal.subsignal.location`, region polygons);
   - encode via `encodeMapBin`.
3. `mapIO.ts` exposes `exportApolloSimMap()` for parity with the
   existing `exportApollo<X>` helpers.

## Why a worker?

sim_map derivation simplifies every lane centerline. On a 50k-lane
map with ~30 vertices per lane, that's 1.5M vertices to walk through
RDP — acceptable in 1–2 s but blocks the main thread. The existing
`apolloIO.worker` is already structured for exactly this kind of
heavy serialise loop, so the natural home is a new `runDerive`
branch alongside `runExport`.

## Open questions

- How aggressive should RDP be? Apollo upstream uses 0.5 m, but
  highway-only deployments could push to 1 m without affecting
  routing accuracy.
- Should the editor still keep `subsignal.location` for visual
  preview, or is sim_map fully read-only?
- What's the story for `editor_meta`? sim_map files aren't usually
  re-imported into the editor — they should probably skip
  `editor_meta` to save bytes.

## Timeline

No SLA. Open an RFC issue with the concrete consumer before
starting work — the field-stripping policy depends on what
downstream tool will read the file.

## See also

- [Export / Routing Map](/en/api/export-routing-map) — same status
  (planned).
- [Export / Base Map](/en/api/export-base-map) — what to use today.
- [io/apollo-io-protocol](/en/api/io/apollo-io-protocol) — the
  message shape that needs to grow when sim_map ships.
- [io/apollo-io-bridge](/en/api/io/apollo-io-bridge) — worker
  promise gateway that will gain the sim branch.
- `src/io/apolloIO.worker.ts` — where the new branch will run.
- Apollo upstream `modules/map/tools/sim_map_generator.cc` — the
  reference implementation we'd be matching.
