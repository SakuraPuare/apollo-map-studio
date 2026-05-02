---
title: io / proto-codec-bin
description: src/io/proto/binCodec.ts — binary protobuf codec for Apollo HD-map
---

# io / proto-codec-bin

`src/io/proto/binCodec.ts` is the binary protobuf entry for Apollo
HD-map. The file itself is 23 lines, but its two functions sit on
the critical path for every import / export.

## Exported symbols

```ts
export function decodeMapBin(bytes: Uint8Array): Promise<Record<string, unknown>>;
export function encodeMapBin(obj: Record<string, unknown>): Promise<Uint8Array>;
```

> Source: `src/io/proto/binCodec.ts:1-23`.

## `decodeMapBin(bytes)`

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

| Option            | Setting                    | Reason                                              |
| ----------------- | -------------------------- | --------------------------------------------------- |
| `longs: Number`   | int64 → JS number          | Apollo fields never overflow 53-bit precision       |
| `enums: Number`   | numeric enum values        | aligned with `entityBridge/enums.ts`'s `*_INV` maps |
| `defaults: false` | unset fields stay absent   | preserves round-trip wire fidelity                  |
| `arrays: true`    | repeated → empty array     | removes null guards downstream                      |
| `objects: true`   | sub-message → empty object | same                                                |

## `encodeMapBin(obj)`

```ts
const Map = await getMapType();
const err = Map.verify(obj);
if (err) throw new Error(`Map.verify failed: ${err}`);
const msg = Map.fromObject(obj);
return Map.encode(msg).finish();
```

`Map.verify` is protobufjs' generated sanity check; a non-empty
return becomes `Error: Map.verify failed: <reason>`.

## Consumers

- `src/io/apolloIO.worker.ts` — both `runImport` and `runExport`.
- `src/io/proto/textCodec.ts` does not depend on binCodec but shares
  `getMapType()`.

## Tests

`src/io/proto/__tests__/binRoundtrip.test.ts` round-trips the upstream
`map_data/sunnyvale_loop` fixture and asserts byte equality (modulo
`apollo.hdmap.Map.editor_meta`).

## See also

- [Proto / Loader](/en/api/proto-loader) — schema source.
- [io/proto-codec-text](/en/api/io/proto-codec-text) — text format
  counterpart.
- [Import / Parse Base Map](/en/api/import-parse-base-map) and
  [Export / Base Map](/en/api/export-base-map) — full pipelines.
