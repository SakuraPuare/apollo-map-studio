---
title: io / proto-loader
description: src/io/proto/loader.ts — protobufjs.Root caching and ?raw glob loader
---

# io / proto-loader

> Mirror page of [Proto / Loader](/en/api/proto-loader); duplicated
> here under the io sub-tree for navigation symmetry.

## Exported symbols

```ts
import * as protobuf from 'protobufjs';

export function loadApolloProtoRoot(): Promise<protobuf.Root>;
export function getMapType(): Promise<protobuf.Type>;
```

> Source: `src/io/proto/loader.ts:1-58`.

## Behaviour summary

- The first call traverses
  `import.meta.glob('/src/proto/**/*.proto', { query: '?raw', eager: true })`
  and registers every file in the `protobuf.Root`.
- `resolvePath` is overridden to `(_, target) => target` so
  Apollo-style `import "map_msgs/map_lane.proto"` is always
  root-relative under `src/proto/`.
- The `fetch` callback fires inside `Promise.resolve().then(...)` to
  keep protobufjs' `queued` counter from dipping to 0 mid-traversal.
  A synchronous callback regresses with "no such Type" errors.
- `getMapType()` looks up `apollo.hdmap.Map` on the cached `Root`.

## Consumers

| Module                      | Usage                                     |
| --------------------------- | ----------------------------------------- |
| `src/io/proto/binCodec.ts`  | `getMapType()` for encode / decode        |
| `src/io/proto/textCodec.ts` | same                                      |
| `src/io/proto/adapter.ts`   | reflection for `transformPointsInMessage` |

## Errors

- Missing file: `Error: Proto file not found in bundle: <name>`.
- Synchronous fetch regression: `Error: no such Type ...` from
  `protobufjs.resolveAll()`.

## Tests

`src/io/proto/__tests__/loader.test.ts` covers cold load + cache
reuse, plus a regression test for the deferred fetch callback.

## Why the deferred callback matters

`protobufjs`'s `Root.load(...)` walks proto imports asynchronously.
Internally it tracks pending fetches with a `queued` counter; when
the counter reaches 0 it triggers `resolveAll()`. A synchronous
fetch callback can fire before the import tree finishes traversing,
making `queued` momentarily 0, which calls `resolveAll()` with only
some of the types registered. The next import then fails with
`Error: no such Type 'apollo.hdmap.Map'` even though the file is
fine.

The fix is the deferred `Promise.resolve().then(done)` — the
callback always lands on a microtask, so by the time it runs
protobufjs has finished registering the dependent imports of the
current file. This is the kind of footgun that does not surface in
manual testing because hot module replacement happens to schedule
microtasks differently than a cold reload.

## Glob behaviour across runtimes

Vite, Vitest (which uses Vite's resolver), and Bun all support the
`?raw` glob suffix. Webpack does not — but Apollo Map Studio is
Vite-only, so we never need a fallback. The `eager: true` flag tells
Vite to inline the strings into the bundle rather than producing
async dynamic imports; this matters because protobufjs needs the
files synchronously available during `Root.load`.

If you ever need to debug what's in the glob, instrument:

```ts
console.log(Object.keys(PROTO_SOURCES).sort());
```

You should see ~19 entries, all rooted at `/src/proto/`.

## Coupling

This module is referenced by every codec/adapter:

- `binCodec.ts` and `textCodec.ts` use `getMapType()` to pull
  `apollo.hdmap.Map` for `decode` / `encode`.
- `adapter.ts` uses the same `Map` type to drive
  `transformPointsInMessage` reflection.
- The `apolloIO` worker imports all three, so the worker also pays
  the cold-load cost once per worker lifetime.

## See also

- [Proto / Loader](/en/api/proto-loader) — top-level mirror.
- [Proto / Codec](/en/api/proto-codec) — primary consumer.
- [io/proto-adapter](/en/api/io/proto-adapter) — reflection-driven
  PointENU walk.
- `src/proto/map_msgs/map.proto` — entry point of the Apollo
  schema.
