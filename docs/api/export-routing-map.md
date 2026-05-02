---
title: Export / Routing Map
description: 当前未实现的 routing_map 派生流水线占位文档
---

# Export / Routing Map

::: warning 当前版本未实现
代码库中**没有** `buildRoutingMap()`、`encodeGraph()`、`TopoGraph`、
或 `routing_map.bin` 导出入口。这一页是占位文档，等 routing_map 派生
落地后再回填。
:::

## 当前替代

- [Export / Base Map](/api/export-base-map) — 现有 Apollo HD-map 导出
  入口；写出 `base_map.bin` / `base_map.txt`。
- [io/apollo-io-bridge](/api/io/apollo-io-bridge) — worker 桥接层。
- Apollo 上游 routing_map 一般用 `map_tool/routing_map_generator`
  在 base_map 之上离线生成；本编辑器暂不复制该流水线。

## 计划中的 API（草案）

```ts
// 草案，未实现
export function exportApolloRoutingMap(): Promise<void>;

interface RoutingMapDeriveOptions {
  /** 是否包含 RoadGraph（路-级拓扑），默认 true */
  includeRoadGraph?: boolean;
  /** 是否在 lane 之间生成虚拟连接边（virtual lane），默认 false */
  emitVirtualLanes?: boolean;
}
```

要点：

- `apolloIOProtocol` 扩展 `BEGIN_EXPORT.format` 到
  `'bin' | 'txt' | 'sim' | 'routing'`；
- worker 内部调用 `core/elements/derive` 已有的拓扑派生工具
  （目前用于 lane.predecessor/successor），输出 RouteSegment / RouteEdge
  等；
- 如果未来要做完整 Apollo `routing_map.bin`，还需引入 routing.proto
  schema 文件到 `src/proto/routing/`，并在 `loader.ts` 的 glob 范围里
  覆盖到。

## 与其他模块的关系

- [Geo / Lane Geometry](/api/geo-lane-geometry) — 提供 lane 端点对齐
  与 pred/succ；routing_map 派生的输入；
- [Geo / Overlap Calc](/api/geo-overlap-calc) — overlap 不直接进入
  routing_map，但 `pncJunction.passages` 会作为 routing 决策的次级
  约束；
- [Store / Map](/api/store-map) — 派生前 reconcile 的 ground truth。

## 何时落地？

无 SLA。Apollo 9.0 routing_map 上游有较成熟的生成器，编辑器复刻成本
较高，建议先在 issue 区开 RFC 评估必要性。
