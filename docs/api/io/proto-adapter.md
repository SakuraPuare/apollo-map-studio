---
title: io / proto-adapter
description: src/io/proto/adapter.ts — ENU↔WGS84 投影 + header / counts 提取
---

# io / proto-adapter

`src/io/proto/adapter.ts` 把 protobufjs 解码出的 plain object 与
projection 模块串起来，实现 Apollo PointENU（UTM 米）↔ WGS84
（lng/lat 度）的双向变换。

## 公开符号

```ts
import * as protobuf from 'protobufjs';
import type { Projection, PointXY } from './projection';

export function transformPointsInMessage(
  type: protobuf.Type,
  msg: unknown,
  transform: (p: PointXY) => PointXY,
): unknown;

export interface ApolloMapInLonLat {
  /** Decoded Map message; every PointENU is in WGS84 lon/lat (x=lon, y=lat). */
  map: Record<string, unknown>;
  projString: string; // sanitized
  projection: Projection; // for follow-up conversions
}

export function apolloMapToLonLat(
  map: Record<string, unknown>,
  projString: string,
): Promise<ApolloMapInLonLat>;

export function apolloMapFromLonLat(
  map: Record<string, unknown>,
  projString: string,
): Promise<{ map: Record<string, unknown>; projection: Projection }>;

export function readHeaderProjString(map: Record<string, unknown>): string | null;
export function entityCounts(map: Record<string, unknown>): Record<string, number>;
```

> Source: `src/io/proto/adapter.ts:1-107`

## `transformPointsInMessage(type, msg, transform)`

递归遍历 `msg`，每碰到 `apollo.common.PointENU` sub-message 就调
`transform` 替换。返回**新树**，不修改输入。

`type.fullName === '.apollo.common.PointENU'` 是判定条件 —— 对每个
field 调 `field.resolve()` 后看 `field.resolvedType` 是否还是 Type。
repeated 字段会逐个 map 子元素。

```ts
const Map = await getMapType();
const out = transformPointsInMessage(Map, decodedMap, (p) => proj.toLonLat(p));
```

## `apolloMapToLonLat(map, projString)`

闭环 helper：

1. `getMapType()` 拿到 `Map` 类型；
2. `makeProjection(projString)` 构造投影器；
3. `transformPointsInMessage(Map, map, (p) => projection.toLonLat(p))`；
4. 返回 `{ map: lonLatTree, projString: sanitized, projection }`。

import 路径用这条；`apolloIO.worker` 缓存返回的 `map` 树作为
`cachedRawLonLatMap`，导出时再变回 ENU。

## `apolloMapFromLonLat(map, projString)`

镜像 helper，给导出路径用。

## `readHeaderProjString(map)`

提取 `map.header.projection.proj`，处理三种来源：

| 类型         | 解析                              |
| ------------ | --------------------------------- |
| `string`     | 直接返回                          |
| `Uint8Array` | UTF-8 decode                      |
| `number[]`   | 逐字节 `String.fromCharCode` 拼接 |
| 其它         | `null`                            |

返回 `null` 时 worker 会发 `NEEDS_PROJECTION` 给主线程让用户选投影。

## `entityCounts(map)`

```ts
function entityCounts(map: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(map)) {
    if (Array.isArray(value)) out[key] = value.length;
  }
  return out;
}
```

简易计数器，给 `ApolloMapImportInfo.counts` 用。每个 repeated 字段的
长度（lane / road / signal …）都会出现在结果 record 里。

## 与 entityBridge 的关系

adapter 处理的是「raw proto plain object 在两套坐标空间之间互转」，
不涉及到 entity 化；`entityBridge/map.ts:apolloMapToEntities` 才把
adapter 输出的 lon/lat plain object 翻成 `MapEntity[]`。两者解耦
让 worker 在 import 时可以缓存原始 lon/lat 树（用于无损 round-trip
导出），而 entity 化结果交给 store 编辑。
