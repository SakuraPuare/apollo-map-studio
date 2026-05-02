# Proto Codec — Binary

> Source: `src/io/proto/binCodec.ts`

## Overview

`binCodec.ts` is the thinnest possible wrapper around protobufjs's
own binary encode / decode for the Apollo `apollo.hdmap.Map` message.
It exposes two functions:

- `decodeMapBin(bytes)` — wire bytes → plain object tree.
- `encodeMapBin(obj)` — plain object tree → wire bytes.

The "plain object" shape uses snake_case field names (because the proto
root is loaded with `keepCase: true`) and is the lingua franca that
every other proto module in `src/io/proto/` operates on:

```
.bin file
   │
   ▼  decodeMapBin
plain object (snake_case, ENU coordinates)
   │
   ▼  apolloMapToLonLat        (adapter.ts)
plain object (snake_case, lon/lat coordinates)
   │
   ▼  apolloMapToEntities       (entityBridge/map.ts)
MapEntity[]
```

## Exports

| Symbol         | Signature                                                 | Purpose                                     |
| -------------- | --------------------------------------------------------- | ------------------------------------------- |
| `decodeMapBin` | `(bytes: Uint8Array) => Promise<Record<string, unknown>>` | Decode Apollo binary protobuf to JS object. |
| `encodeMapBin` | `(obj: Record<string, unknown>) => Promise<Uint8Array>`   | Encode JS object back to wire bytes.        |

## Behavior

### `decodeMapBin`

```ts
const Map = await getMapType();
const msg = Map.decode(bytes);
return Map.toObject(msg, {
  longs: Number,
  enums: Number,
  defaults: false,
  arrays: true,
  objects: true,
});
```

Each `toObject` option is deliberate:

| Option     | Value    | Why                                                                                                                                          |
| ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `longs`    | `Number` | Apollo never uses int64 ids; JS `Number` is safe and avoids importing `long.js`.                                                             |
| `enums`    | `Number` | Keeps enum fields as raw numeric tags so `entityBridge/enums.ts` can map them to discriminated string unions.                                |
| `defaults` | `false`  | **Critical for proto2 fidelity** — does NOT synthesise default values for unset optional fields; round-tripping preserves byte-equal output. |
| `arrays`   | `true`   | Repeated fields default to `[]`, simplifying downstream walkers.                                                                             |
| `objects`  | `true`   | Map fields default to `{}` (currently unused but future-proof).                                                                              |

::: warning Proto2 fidelity invariant
Setting `defaults: false` is what makes the editor's
"import → export → diff" round-trip lossless. Apollo's reference
maps frequently leave optional fields like `lane.length`,
`lane.speed_limit`, `road.type` unset. Synthesising `0` on import
would re-emit those zeros on export and diverge the bytes from the
source.
:::

### `encodeMapBin`

```ts
const Map = await getMapType();
const err = Map.verify(obj);
if (err) throw new Error(`Map.verify failed: ${err}`);
const msg = Map.fromObject(obj);
return Map.encode(msg).finish();
```

`Map.verify(obj)` runs protobufjs's structural check before encoding.
Failures throw with the field path that violated the schema —
catching the error in the worker turns into an `ERROR` IO response
the bridge reports to the user.

`fromObject` rebuilds the protobufjs message instance from the plain
JS dictionary; `encode().finish()` serialises to wire bytes.

### Async-only API

Both exports are async because `getMapType()` awaits the proto-root
promise. The first call pays the proto-load cost (~5-30ms cold);
subsequent calls hit the cached `Promise<Root>` and resolve
synchronously-ish (still through a microtask).

## Examples

### Inside the Apollo IO worker (`apolloIO.worker.ts`)

```ts
import { decodeMapBin, encodeMapBin } from './proto/binCodec';

// import path
const obj = await decodeMapBin(bytes);
const projected = await apolloMapToLonLat(obj, projString);
const entities = apolloMapToEntities(projected.map);
post({ type: 'IMPORT_RESULT', requestId, ... });

// export path (after collecting entities from main thread)
const baseMap = { header: importedHeader, ... };
const withEntities = entitiesToApolloMap(baseMap, entities);
const utm = await apolloMapFromLonLat(withEntities, projString);
const bytes = await encodeMapBin(utm.map);
post({ type: 'EXPORT_BIN_RESULT', requestId, bytes });
```

### Round-trip test pattern

```ts
import { readFileSync } from 'fs';
import { decodeMapBin, encodeMapBin } from '@/io/proto/binCodec';

it('round-trips byte-equal', async () => {
  const input = new Uint8Array(readFileSync('fixtures/borregas_ave/base_map.bin'));
  const obj = await decodeMapBin(input);
  const output = await encodeMapBin(obj);
  expect(output).toEqual(input); // proto2 fidelity contract
});
```

## Related

- [Proto Loader](./proto-loader.md) — `getMapType()` upstream.
- [Text Codec](/api/io/proto-codec-text) — text-proto sibling that operates
  on the same plain-object shape.
- [Adapter](/api/io/proto-adapter) — projection step between decode and
  entity-bridge.
- [Entity Bridge](/api/io/proto-entity-bridge) — proto plain object ↔
  `MapEntity[]`.
- [Editor Meta](/api/io/proto-editor-meta) — sub-tree the codec preserves
  but does not interpret.
