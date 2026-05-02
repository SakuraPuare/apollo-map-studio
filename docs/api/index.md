---
title: API 参考
description: Apollo Map Studio 模块级 API 索引：store / io / proto / geo / hooks 全景图与分层约束
---

# API 参考 / API Reference

本节是 Apollo Map Studio 的模块级 API 文档。每一页对应一个公开的源文件
或子目录，列出全部导出符号、TypeScript 完整签名、参数表、典型用法
和异常路径。

> 与 [Architecture](/architecture/) 配合阅读：架构文档讲分层约束和数据流，
> 本节讲每个模块的契约。

## 模块全景

```
┌─────────────────────────────────────────────────────────────┐
│ components/   ← UI: layout, panels, map (React 19)          │
├─────────────────────────────────────────────────────────────┤
│ hooks/        ← FSM 接线 / 事件路由 / cold·hot 层调度          │
├─────────────────────────────────────────────────────────────┤
│ store/        ← Zustand: mapStore + uiStore + zundo 撤销     │
├─────────────────────────────────────────────────────────────┤
│ lib/          ← entityOps adapter、geo helpers、schemas      │
├─────────────────────────────────────────────────────────────┤
│ core/         ← FSM、几何、worker、action registry            │
└─────────────────────────────────────────────────────────────┘
                  │
                  ↓
            io/proto/  ← Apollo HD-map 编解码 + ENU↔WGS84 投影
            io/        ← apollo IO worker bridge + file pickers
            proto/     ← *.proto schema 源（vite ?raw glob 加载）
```

进口规则：上层可以 import 下层，下层不能反向 import 上层。
`types/`、`config/` 是纯类型/常量，可被任意层引用。

## 顶层 API（必读）

| 模块                                                  | 源文件                                          | 概览                               |
| ----------------------------------------------------- | ----------------------------------------------- | ---------------------------------- |
| [Store / Map](/api/store-map)                         | `src/store/mapStore.ts`                         | entities Map + zundo undo + 级联   |
| [Store / UI](/api/store-ui)                           | `src/store/uiStore.ts`                          | grid / snap / layer / connect 模式 |
| [Geo / Projection](/api/geo-projection)               | `src/lib/geo.ts` + `src/io/proto/projection.ts` | haversine + proj4 ENU↔WGS84        |
| [Geo / Lane Geometry](/api/geo-lane-geometry)         | `src/core/geometry/*`                           | interpolate / topology / junctions |
| [Geo / Overlap Calc](/api/geo-overlap-calc)           | `src/core/elements/overlap/*`                   | reconcile / R-tree / pairTable     |
| [Proto / Loader](/api/proto-loader)                   | `src/io/proto/loader.ts`                        | protobufjs.Root 缓存 + glob ?raw   |
| [Proto / Codec](/api/proto-codec)                     | `src/io/proto/binCodec.ts` + `textCodec.ts`     | bin / txt 编解码统一入口           |
| [Proto / Schema](/api/proto-schema)                   | `src/proto/**/*.proto`                          | Apollo HD-map proto2 schema 索引   |
| [Export / Base Map](/api/export-base-map)             | `src/io/mapIO.ts` + worker                      | exportApolloBin / Text → 文件下载  |
| [Export / Sim Map](/api/export-sim-map)               | （计划中：未实现）                              | sim_map 派生流水线占位             |
| [Export / Routing Map](/api/export-routing-map)       | （计划中：未实现）                              | routing_map 派生流水线占位         |
| [Import / Parse Base Map](/api/import-parse-base-map) | `src/io/mapIO.ts` + worker                      | pickAndImportApollo 全流程         |
| [Hooks index](/api/hooks)                             | `src/hooks/*`                                   | 事件路由 / 层调度 hooks 列表       |

## IO 子目录

| 模块                                                    | 源文件                          | 一行概述                        |
| ------------------------------------------------------- | ------------------------------- | ------------------------------- |
| [io/map-io](/api/io/map-io)                             | `src/io/mapIO.ts`               | Apollo 文件路径粘合层           |
| [io/apollo-io-bridge](/api/io/apollo-io-bridge)         | `src/io/apolloIOBridge.ts`      | 主线程到 worker 的 Promise 网关 |
| [io/apollo-io-protocol](/api/io/apollo-io-protocol)     | `src/io/apolloIOProtocol.ts`    | worker IPC 消息契约             |
| [io/file-io](/api/io/file-io)                           | `src/io/fileIO.ts`              | `<input>` 选择器 + Blob 下载    |
| [io/proto-loader](/api/io/proto-loader)                 | `src/io/proto/loader.ts`        | `protobufjs.Root` 缓存          |
| [io/proto-codec-bin](/api/io/proto-codec-bin)           | `src/io/proto/binCodec.ts`      | `decodeMapBin` / `encodeMapBin` |
| [io/proto-codec-text](/api/io/proto-codec-text)         | `src/io/proto/textCodec*`       | 自研 protobuf text format 解析  |
| [io/proto-adapter](/api/io/proto-adapter)               | `src/io/proto/adapter.ts`       | ENU↔WGS84 + header / counts     |
| [io/proto-projection](/api/io/proto-projection)         | `src/io/proto/projection.ts`    | proj4 包装 + UTM presets        |
| [io/proto-entity-bridge](/api/io/proto-entity-bridge)   | `src/io/proto/entityBridge*`    | proto ↔ MapEntity 双向桥        |
| [io/proto-apollo-geojson](/api/io/proto-apollo-geojson) | `src/io/proto/apolloGeoJson.ts` | bounds 计算（导入预览用）       |
| [io/proto-editor-meta](/api/io/proto-editor-meta)       | `src/io/proto/editorMeta.ts`    | 编辑器附加元数据透传            |

## 命名约定

- 公开符号一律使用 camelCase function / PascalCase type；
- 内部模块以 `__tests__` 或 `internal.ts` 结尾的不在 API 表面，可能在
  补丁版本中变更；
- 标记 `@internal` 的导出仅供同包内调用，不构成稳定 API；
- `_userOverrides` 等带下划线前缀的实体字段是「钉位标记」，由 reconcile
  pipeline 检查；UI 写入需谨慎。

## 阅读建议

- 改 store mutator → 先读 [store-map](/api/store-map) 与 [entityOps](/api/io/proto-entity-bridge)；
- 接 Apollo 新 proto 字段 → 先读 [proto-entity-bridge](/api/io/proto-entity-bridge)
  - [proto-schema](/api/proto-schema)；
- 调 overlap 误判 → 先读 [geo-overlap-calc](/api/geo-overlap-calc) 与
  `pairTable` 配对规则；
- 加新画图工具 → 先读 [hooks index](/api/hooks) 与 `core/fsm/editorMachine`。

## "计划中" 标记

`export-sim-map` 与 `export-routing-map` 这两个页面描述的派生流水线在
当前代码库中尚未实现。本节保留页面以便未来落地时不必再调侧边栏：
当前的导出助手只产出 `base_map.bin` / `base_map.txt`，sim_map 与
routing_map 的派生上游另有工具承担。
