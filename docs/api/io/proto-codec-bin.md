---
title: io / proto-codec-bin
description: src/io/proto/binCodec.ts — Apollo HD-map 二进制 protobuf 编解码
---

# io / proto-codec-bin

`src/io/proto/binCodec.ts` 是 Apollo HD-map 二进制 protobuf 的编解码
入口。文件本身只有 23 行，但它的两个函数承载着每次导入/导出走的
关键路径。

## 公开符号

```ts
export function decodeMapBin(bytes: Uint8Array): Promise<Record<string, unknown>>;
export function encodeMapBin(obj: Record<string, unknown>): Promise<Uint8Array>;
```

> Source: `src/io/proto/binCodec.ts:1-23`

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

参数解释：

| 选项              | 设置                   | 原因                                                  |
| ----------------- | ---------------------- | ----------------------------------------------------- |
| `longs: Number`   | int64 → JS number      | Apollo HD-map 字段不会触发 64-bit overflow            |
| `enums: Number`   | enum 数字              | 与 `entityBridge/enums.ts` 的 `*_INV` 映射一致        |
| `defaults: false` | 不补缺省值             | 保证 round-trip fidelity（重写时不写多余 wire bytes） |
| `arrays: true`    | repeated 必返回数组    | 下游遍历不必 null guard                               |
| `objects: true`   | sub-message 必返回对象 | 同上                                                  |

## `encodeMapBin(obj)`

```ts
const Map = await getMapType();
const err = Map.verify(obj);
if (err) throw new Error(`Map.verify failed: ${err}`);
const msg = Map.fromObject(obj);
return Map.encode(msg).finish();
```

`Map.verify` 是 protobufjs 在 schema 上预生成的 sanity check
函数；不通过则抛 `Map.verify failed: <reason>`。

## 调用方

二进制 codec 的 caller 集中在：

- `src/io/apolloIO.worker.ts` — `runImport` / `runExport`；
- `src/io/proto/textCodec.ts` 不依赖 binCodec，但共用
  `getMapType()`。

## 测试

`src/io/proto/__tests__/binRoundtrip.test.ts` 把官方 `map_data/sunnyvale_loop`
做 decode → encode round-trip，断言字节级等价（除掉
`apollo.hdmap.Map.editor_meta` 这种 round-trip 不会被引入的字段）。
