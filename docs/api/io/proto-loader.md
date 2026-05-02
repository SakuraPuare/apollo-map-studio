---
title: io / proto-loader
description: src/io/proto/loader.ts — protobufjs.Root 缓存与 ?raw glob 加载
---

# io / proto-loader

> 本页是 [Proto / Loader](/api/proto-loader) 的同源镜像，按 io 子目录
> 索引收口。两页内容一致，方便从不同入口跳转。

## 公开符号

```ts
import * as protobuf from 'protobufjs';

export function loadApolloProtoRoot(): Promise<protobuf.Root>;
export function getMapType(): Promise<protobuf.Type>;
```

> Source: `src/io/proto/loader.ts:1-58`

## 行为概览

- `loadApolloProtoRoot()` 首次调用时遍历 `import.meta.glob('/src/proto/**/*.proto', { query: '?raw', eager: true })`，
  把每个 `.proto` 文件的纯文本注册到 `protobuf.Root`；
- `resolvePath` 重写为 `(_, target) => target`，让 Apollo 风格的
  `import "map_msgs/map_lane.proto"` 在 `Root` 内总是被视为根相对 key；
- `fetch` 回调用 `Promise.resolve().then(...)` 延迟一拍触发 done，
  防止 protobufjs 的 `queued` 计数早于 import 树解析完成归零；
- `getMapType` 在 cached `Root` 上 `lookupType('apollo.hdmap.Map')`。

## 调用方

| 模块                        | 用法                                           |
| --------------------------- | ---------------------------------------------- |
| `src/io/proto/binCodec.ts`  | `getMapType()` 拿 `Map` 做 encode/decode       |
| `src/io/proto/textCodec.ts` | 同上                                           |
| `src/io/proto/adapter.ts`   | `transformPointsInMessage` 需要类型 reflection |

## 异常

- 资源缺失 → `Error: Proto file not found in bundle: <name>`；
- 同步 fetch 回退 → `Error: no such Type ...`（regression bug，已留
  延迟 then 防御）。

## 测试

`src/io/proto/__tests__/loader.test.ts` 覆盖冷启 / 缓存复用。
