---
title: Proto / Loader
description: src/io/proto/loader.ts — protobufjs.Root caching and Apollo HD-map schema loader
---

# Proto / Loader

`src/io/proto/loader.ts` loads the Apollo HD-map proto schema using
`protobufjs`. All `.proto` files are bundled with Vite's `?raw` glob,
so runtime is fully offline and Vitest reuses the same mechanism on
Node.

## Exported symbols

```ts
import * as protobuf from 'protobufjs';

export function loadApolloProtoRoot(): Promise<protobuf.Root>;
export function getMapType(): Promise<protobuf.Type>;
```

> Source: `src/io/proto/loader.ts:1-58`.

## `loadApolloProtoRoot()`

Returns the cached `protobuf.Root` once `load('map_msgs/map.proto')`
has completed. The first call pays the parse cost (~5–15 ms);
subsequent calls return the cached promise.

Implementation notes:

- **Glob injection** —
  `import.meta.glob('/src/proto/**/*.proto', { query: '?raw', eager: true })`
  embeds every proto file into the bundle. Works in Vite and Vitest.
- **`resolvePath` override** — Apollo proto imports look like
  `map_msgs/map_lane.proto`, root-relative under `src/proto/`. The
  default protobufjs resolver would join with the importing file's
  directory and yield `map_msgs/map_msgs/…`. We override to
  `(_, target) => target`.
- **Deferred fetch callback** — `done(...)` runs inside
  `Promise.resolve().then(...)` so protobufjs' internal `queued`
  counter never dips to 0 mid-traversal. A synchronous callback
  triggers a premature `resolveAll()` and surfaces as "no such
  Type" errors.

```ts
const root = await loadApolloProtoRoot();
const Map = root.lookupType('apollo.hdmap.Map');
```

## `getMapType()`

Convenience: `(await loadApolloProtoRoot()).lookupType('apollo.hdmap.Map')`.
Used by `binCodec`, `textCodec`, and `adapter`.

```ts
const Map = await getMapType();
const obj = Map.toObject(Map.decode(bytes));
```

## Why `?raw` instead of pbjs codegen

- **No extra build step.** Editing a proto only requires `vite`,
  no `pbjs` invocation.
- **Reflection at runtime.** `Map.fields`, `field.resolvedType`
  remain available, which is what `apolloMapToLonLat` needs to walk
  every PointENU recursively.
- **Bundle size.** `?raw` strings plus a single `protobuf.Root` is
  ~150 KB gzipped; pre-generated JSON is no smaller and loses
  reflection.

## Flow

```mermaid
sequenceDiagram
  participant Caller as binCodec / textCodec / adapter
  participant Loader as loadApolloProtoRoot
  participant pbjs as protobufjs.Root
  participant Bundle as PROTO_SOURCES (?raw glob)

  Caller->>Loader: getMapType()
  alt cached
    Loader-->>Caller: Promise<Type> (cached)
  else cold
    Loader->>pbjs: new Root(); resolvePath = (_,t) => t
    Loader->>pbjs: root.load('map_msgs/map.proto', { keepCase: true })
    pbjs->>Bundle: fetch(filename)
    Bundle-->>pbjs: file text via deferred Promise.resolve().then(...)
    pbjs-->>Loader: resolveAll() done
    Loader->>Loader: cache root
    Loader-->>Caller: lookupType('apollo.hdmap.Map')
  end
```

## Errors

| Cause                                   | Surface                                                  |
| --------------------------------------- | -------------------------------------------------------- |
| Missing file in `PROTO_SOURCES`         | `Error: Proto file not found in bundle: <name>`          |
| Synchronous fetch callback (regression) | `Error: no such Type ...` from `protobufjs.resolveAll()` |
| Invalid PROJ string upstream            | Surfaced in `adapter.ts`, not here                       |

## Tests

`src/io/proto/__tests__/loader.test.ts` covers cold load and cache
reuse, plus a regression test for the deferred fetch callback.

## See also

- [Proto / Codec](/en/api/proto-codec) — `decodeMapBin`/`Text` and
  `encodeMapBin`/`Text` use `getMapType()`.
- [io/proto-adapter](/en/api/io/proto-adapter) — walks the loaded
  type tree to apply projection transforms recursively.
- [Proto / Schema](/en/api/proto-schema) — index of the `.proto`
  files this loader pulls.
