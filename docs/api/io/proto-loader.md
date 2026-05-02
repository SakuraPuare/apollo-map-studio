# Proto Loader

> Source: `src/io/proto/loader.ts`

## Overview

`loader.ts` is responsible for materialising a fully-resolved
`protobufjs.Root` from the bundled Apollo `.proto` files, then exposing
the root (and a convenience accessor for the top-level
`apollo.hdmap.Map` type) to the rest of the IO stack.

Every other module in `io/proto/` ultimately calls `getMapType()` —
`binCodec`, `textCodec`, `adapter`, `editorMeta`, and the entityBridge
all need the schema.

The loader has three jobs:

1. **Bundle** every `.proto` under `src/proto/` as raw text using Vite's
   `import.meta.glob` so the schema is available offline (no network
   round-trip in browser, no filesystem access in tests).
2. **Resolve imports** correctly — Apollo proto files use root-relative
   import paths (`import "map_msgs/map_lane.proto"`), but protobufjs
   defaults to directory-relative resolution which would yield
   `map_msgs/map_msgs/map_lane.proto`.
3. **Cache** the resolved root so subsequent `loadApolloProtoRoot()`
   calls return the same `Promise<Root>` and avoid re-parsing ~50 proto
   files on every IO request.

## Exports

| Symbol                | Signature                      | Purpose                                         |
| --------------------- | ------------------------------ | ----------------------------------------------- |
| `loadApolloProtoRoot` | `() => Promise<protobuf.Root>` | Lazy-load and cache the resolved Apollo schema. |
| `getMapType`          | `() => Promise<protobuf.Type>` | Convenience accessor for `.apollo.hdmap.Map`.   |

## Behavior

### Bundling proto sources

```ts
const PROTO_SOURCES = import.meta.glob('/src/proto/**/*.proto', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
```

`eager: true` + `query: '?raw'` resolves to a synchronous map of
`/src/proto/...` keys → raw text contents at bundle time. Vite inlines
the strings into the JS bundle. Vitest reuses the same Vite resolver,
so unit tests work in Node without any filesystem access.

### Custom `resolvePath`

```ts
root.resolvePath = (_origin, target) => target;
```

protobufjs normally joins import paths against the origin file's
directory. Apollo's tree uses root-relative imports, so the override
treats every target as a key into the bundled glob.

### Custom `fetch`

```ts
root.fetch = (filename, callback) => {
  const key = `/src/proto/${filename.replace(/^\/+/, '')}`;
  const text = PROTO_SOURCES[key];
  Promise.resolve().then(() => {
    if (text !== undefined) callback(null, text);
    else callback(new Error(`Proto file not found in bundle: ${filename} (key=${key})`));
  });
};
```

::: warning Deferred callback is mandatory
The `Promise.resolve().then(...)` is not cosmetic — it is correctness.
protobufjs counts pending fetches with an internal `queued` counter.
If the fetch callback fires synchronously, the counter dips to 0
mid-import-tree-walk, which triggers `resolveAll()` before all imports
have been loaded → `no such Type` errors during type resolution. The
deferred microtask defends against this by guaranteeing the callback
runs after `root.load` has finished registering the import.
:::

### Caching

```ts
let cached: Promise<protobuf.Root> | null = null;
export function loadApolloProtoRoot() {
  if (cached) return cached;
  // ... build root ...
  cached = root.load('map_msgs/map.proto', { keepCase: true });
  return cached;
}
```

The cache holds the **promise**, not the resolved root. Concurrent
callers during the first load all observe the same in-flight promise
and resolve together. A failed load is not invalidated — to retry you
must reload the module (e.g. via Vite HMR).

### `keepCase: true`

The `load` option `keepCase: true` preserves snake_case field names
exactly as they appear in `.proto` (`central_curve`, not
`centralCurve`). This is the convention the rest of the codebase
relies on:

- `binCodec.toObject` / `fromObject` use raw JSON with snake_case keys.
- `textCodec` decoder/encoder operates on snake_case field names
  matching the wire format directly.
- `editorMeta` reads/writes `editor_meta` with `geometry_kind`.

The `entityBridge` is the single boundary that translates snake_case
proto fields into camelCase `MapEntity` fields.

### `getMapType`

```ts
export async function getMapType(): Promise<protobuf.Type> {
  const root = await loadApolloProtoRoot();
  return root.lookupType('apollo.hdmap.Map');
}
```

Returns the `protobuf.Type` for `apollo.hdmap.Map` — the entry point
for every `decode` / `encode` / `toObject` / `fromObject` call in the
codecs.

## Examples

### Decoding a binary map (from `binCodec.ts`)

```ts
import { getMapType } from './loader';

export async function decodeMapBin(bytes: Uint8Array) {
  const Map = await getMapType();
  const msg = Map.decode(bytes);
  return Map.toObject(msg, {
    longs: Number,
    enums: Number,
    defaults: false,
    arrays: true,
    objects: true,
  });
}
```

### Decoding a text map (from `textCodec.ts`)

```ts
import { getMapType } from './loader';
import { decodeMessage } from './textCodec/decoder';

export async function decodeMapText(text: string) {
  const Map = await getMapType();
  return decodeMessage(Map, text);
}
```

### Walking nested types (from `adapter.ts`)

```ts
const Map = await getMapType();
const transformed = transformPointsInMessage(Map, map, (p) => projection.toLonLat(p));
```

The walker recurses through `Map.fieldsArray`, calling `field.resolve()`
to materialise nested types — only possible because `resolveAll()` ran
inside `root.load(...)`.

## Related

- [Bin Codec](./proto-codec-bin.md) — `decodeMapBin` / `encodeMapBin`.
- [Text Codec](/api/io/proto-codec-text) — `decodeMapText` /
  `encodeMapText`.
- [Adapter](/api/io/proto-adapter) — projection walker that consumes the
  schema's nested types.
- [Editor Meta](/api/io/proto-editor-meta) — reads `editor_meta` proto
  field via the same root.
- [Entity Bridge](/api/io/proto-entity-bridge) — the snake-case ↔
  camelCase boundary.
