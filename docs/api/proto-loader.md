---
title: Proto / Loader
description: src/io/proto/loader.ts — protobufjs.Root 缓存与 Apollo HD-map schema 加载
---

# Proto / Loader

`src/io/proto/loader.ts` 用 `protobufjs` 加载 Apollo HD-map schema。
所有 Apollo proto 文件以 `?raw` glob 形式打包进 bundle，运行期完全
离线（无网络往返），同时让 Vitest 在 Node 下复用同一份资源。

## 公开符号

```ts
import * as protobuf from 'protobufjs';

export function loadApolloProtoRoot(): Promise<protobuf.Root>;
export function getMapType(): Promise<protobuf.Type>;
```

> Source: `src/io/proto/loader.ts:1-58`

## `loadApolloProtoRoot(): Promise<protobuf.Root>`

返回（缓存的）`protobuf.Root`，已 `load('map_msgs/map.proto')` 完毕。
首次调用触发 import 树解析，约 5–15ms 一次性成本；之后所有调用复用。

实现要点：

- **glob 注入**：`import.meta.glob('/src/proto/**/*.proto', { query: '?raw', eager: true })`
  在 build 时把所有 `.proto` 内容嵌入产物。Vite 与 Vitest 都支持。
- **resolvePath 重写**：Apollo 的 import 是 `map_msgs/map_lane.proto`
  这种相对 `src/proto/` 根的路径，protobufjs 默认 `resolvePath` 会和
  原 file 的目录拼成 `map_msgs/map_msgs/...`。`resolvePath` 重写为
  `(_, target) => target` 让 target 始终被视为根相对 key。
- **fetch 回调**：从 `PROTO_SOURCES` 字典里取，加 `Promise.resolve().then(...)`
  延迟一拍触发回调 —— 否则同步触发会让 protobufjs 的 `queued` 计数
  在 import 树没遍历完时归零，提前 `resolveAll()` 抛 "no such Type"。

## `getMapType(): Promise<protobuf.Type>`

便利封装：`(await loadApolloProtoRoot()).lookupType('apollo.hdmap.Map')`，
是 binCodec / textCodec / adapter 共用的入口。

## 为什么走 ?raw 而不是 protobufjs CLI 预生成

- **零额外构建**：proto 改动后只跑 vite 即可，不需要 `pbjs` 步骤；
- **运行期可读**：`Map.fields`、`field.resolvedType` 全部可用，
  `apolloMapToLonLat` 才能递归遍历点位；
- **分发体积**：`?raw` 字符串 + 单一 `protobuf.Root` 实例，~150KB
  压缩后；预生成 JSON 同样大且失去 reflection。

## 流程示意

```mermaid
sequenceDiagram
  participant Caller as binCodec / textCodec / adapter
  participant Loader as loadApolloProtoRoot
  participant pbjs as protobufjs.Root
  participant Bundle as PROTO_SOURCES (?raw glob)

  Caller->>Loader: getMapType()
  alt cached
    Loader-->>Caller: Promise<Type>（已缓存）
  else cold
    Loader->>pbjs: new Root(); resolvePath = (_,t) => t
    Loader->>pbjs: root.load('map_msgs/map.proto', { keepCase: true })
    pbjs->>Bundle: fetch(filename)
    Bundle-->>pbjs: file text via Promise.resolve().then(...)
    pbjs-->>Loader: resolveAll() done
    Loader->>Loader: cache root
    Loader-->>Caller: lookupType('apollo.hdmap.Map')
  end
```

## 异常路径

- 资源不存在：`fetch` 回调返回
  `new Error('Proto file not found in bundle: ${filename}')`，
  `protobufjs` 把这条传播到 `root.load` 的 reject。
- 同步回调：见上面的 `Promise.resolve().then(...)` 注释；如果改实现
  务必保留延迟。

## 测试

`src/io/proto/__tests__/loader.test.ts` 覆盖冷启 / 重复调用复用
缓存的路径。
