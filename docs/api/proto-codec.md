# proto / codec

Apollo map codec 位于 `src/io/proto`，当前只编码/解码 `apollo.hdmap.Map`。源码中没有 `encodeGraph()` 或 routing graph codec。

## Binary

```ts
export async function decodeMapBin(bytes: Uint8Array): Promise<Record<string, unknown>>;
export async function encodeMapBin(obj: Record<string, unknown>): Promise<Uint8Array>;
```

`decodeMapBin()` 使用 `getMapType()` 获取 `apollo.hdmap.Map`，执行 `Map.decode(bytes)`，再用：

```ts
Map.toObject(msg, {
  longs: Number,
  enums: Number,
  defaults: false,
  arrays: true,
  objects: true,
});
```

因此 enum 在 raw map 中是 number，后续由 entity bridge 映射为字符串枚举；默认值不会主动补齐。

`encodeMapBin()` 会先 `Map.verify(obj)`，verify 返回错误字符串时直接抛出 `Map.verify failed: ...`，否则 `Map.fromObject(obj)` 后 `Map.encode(msg).finish()`。

## Text

```ts
export async function decodeMapText(text: string): Promise<Record<string, unknown>>;
export async function encodeMapText(obj: Record<string, unknown>): Promise<string>;
export function decodeMessage(type: protobuf.Type, text: string): Record<string, unknown>;
export function encodeMessage(type: protobuf.Type, msg: unknown, level = 0): string;
```

text codec 是仓库内实现的 proto text format 子集：

- message 支持 `{}` 和 `<>`。
- scalar 支持可选冒号。
- repeated scalar 支持 `[a, b]`，repeated message 通过字段重复累积数组。
- `;` 会被忽略。
- 未知字段会跳过，包含未知嵌套块和列表。
- enum 支持符号名或数字；未知 enum 符号会抛错。
- bool 支持 `true/True/t`、`false/False/f` 和数字。
- float/double 支持 `inf`、`-inf`、`nan` 和 `f/F` 后缀。
- bytes 以 quoted string 的低 8 bit 写入 `Uint8Array`。

encoder 按 schema `fieldsArray` 顺序输出，跳过 `null`、`undefined` 和 map 字段。bytes 支持 `string`、`Uint8Array` 和 number array，按 Latin-1 转义；不可见字符用三位八进制。

## Pipeline

- 导入 `.bin`：`decodeMapBin()`。
- 导入 `.txt` / `.pb.txt`：worker `TextDecoder` 后 `decodeMapText()`。
- 导出 `.bin`：`encodeMapBin()`。
- 导出 `.txt`：`encodeMapText()` 后 worker `TextEncoder`。

## Tests

覆盖测试包括 `binRoundtrip.test.ts`、`textRoundtrip.test.ts`、`curveFidelity.test.ts`、`subsignalFidelity.test.ts`、`overlapFidelity.test.ts` 和 `src/io/__tests__/endToEnd.test.ts`。
