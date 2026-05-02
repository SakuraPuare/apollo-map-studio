---
title: Export / Sim Map
description: 当前未实现的 sim_map 派生流水线占位文档
---

# Export / Sim Map

::: warning 当前版本未实现
源代码中没有 `buildSimMap()`、降采样 pass、或 `sim_map.bin` 导出
入口。这一页是占位文档：保留 URL 与侧边栏顺序，待 sim_map 派生上游
实现后再回填。
:::

## 当前替代

如果你在搜 `buildSimMap` 类似函数，请改看：

- [Export / Base Map](/api/export-base-map) — `exportApolloBin` /
  `exportApolloText` 是当前唯一的 Apollo HD-map 导出入口，
  写出 `base_map.bin` / `base_map.txt`；
- [io/apollo-io-bridge](/api/io/apollo-io-bridge) — worker 桥接层；
- [io/apollo-io-protocol](/api/io/apollo-io-protocol) — worker IPC
  契约，`BEGIN_EXPORT.format` 现仅支持 `'bin' | 'txt'`，未来加
  `'sim'` 时需要扩展。

Apollo 上游的 sim_map / routing_map 通常由 dreamview / Apollo 的
`map_tool` 在导出 base_map 之后离线派生。Apollo Map Studio 当前
不复制这部分能力。

## 计划中的 API（草案）

未来在 worker 里加一条派生分支后，预计公开形如：

```ts
// 草案，未实现
export function exportApolloSimMap(): Promise<void>;

interface SimMapDeriveOptions {
  /** 折线降采样阈值（米），默认 0.5 */
  simplifyToleranceM?: number;
  /** 是否丢掉 stop_line 等 sim_map 不需要的字段，默认 true */
  stripExtras?: boolean;
}
```

变更点：

- `apolloIOProtocol.ApolloIORequest.BEGIN_EXPORT.format` 扩展为
  `'bin' | 'txt' | 'sim'`；
- `apolloIO.worker.runExport` 新增 `format === 'sim'` 分支：
  - `applyImportTopology` 后用 Ramer-Douglas-Peucker 简化 lane
    centerline；
  - 删除 `signal.subsignal.location`、`overlap.region_overlap` 这种
    sim_map 不需要的 heavy field；
  - 走 `encodeMapBin` 输出。
- `mapIO.ts` 暴露 `exportApolloSimMap()`，命名遵循
  `exportApollo<X>` 命名约定。

## 何时落地？

无 SLA。若你正在做 sim_map 集成，先在 issue 区开 RFC 描述实际场景，
再决定 stripping 策略。
