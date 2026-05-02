---
title: Proto / Schema
description: src/proto/**/*.proto — Apollo HD-map proto2 schema 索引及 entityBridge 桥接概览
---

# Proto / Schema

Apollo HD-map 的 schema 源文件位于 `src/proto/`，按 Apollo 上游目录
结构组织：

```
src/proto/
├── basic_msgs/
│   └── geometry.proto              # PointENU, Polygon, LineSegment, Curve …
├── editor/
│   └── editor_meta.proto           # 编辑器附加元数据（Map.editor_meta = 1000）
└── map_msgs/
    ├── map.proto                   # 顶层 apollo.hdmap.Map
    ├── map_id.proto                # Id wrapper
    ├── map_geometry.proto
    ├── map_lane.proto
    ├── map_road.proto
    ├── map_junction.proto
    ├── map_crosswalk.proto
    ├── map_signal.proto
    ├── map_stop_sign.proto
    ├── map_yield_sign.proto
    ├── map_speed_bump.proto
    ├── map_clear_area.proto
    ├── map_overlap.proto
    ├── map_parking_space.proto
    ├── map_pnc_junction.proto
    ├── map_rsu.proto
    ├── map_area.proto
    ├── map_barrier_gate.proto
    └── map_speed_control.proto
```

`map.proto` 引入所有子 message 并组装出顶层 `apollo.hdmap.Map`。
`loader.ts` 用 `?raw` glob 把它们打包到 bundle 里，运行期完全离线。

## 顶层结构

`apollo.hdmap.Map` 的字段（生效顺序与 entityBridge 的 `BRIDGES` 数组
对齐）：

| Proto 字段      | MapEntity entityType | 说明                        |
| --------------- | -------------------- | --------------------------- |
| `header`        | —                    | 版本号 + projection.proj 等 |
| `crosswalk`     | `crosswalk`          | 行人横道                    |
| `junction`      | `junction`           | 路口                        |
| `lane`          | `lane`               | 车道                        |
| `stop_sign`     | `stopSign`           | 停车标志                    |
| `signal`        | `signal`             | 交通信号灯                  |
| `yield`         | `yieldSign`          | 让行标志                    |
| `overlap`       | `overlap`            | 重叠语义                    |
| `clear_area`    | `clearArea`          | 禁停区                      |
| `speed_bump`    | `speedBump`          | 减速带                      |
| `road`          | `road`               | 道路 + sections             |
| `parking_space` | `parkingSpace`       | 停车位                      |
| `pnc_junction`  | `pncJunction`        | Planner & Control 路口语义  |
| `rsu`           | `rsu`                | 路侧通讯单元                |
| `ad_area`       | `area`               | 自定义区域                  |
| `barrier_gate`  | `barrierGate`        | 道闸                        |
| `editor_meta`   | —                    | 编辑器扩展（field 1000）    |

## 公共子 message

`basic_msgs/geometry.proto` 与 `map_msgs/map_geometry.proto` 提供：

- `PointENU` — `{ double x = 1; double y = 2; double z = 3; }`，
  Apollo 默认是 ENU 米空间，编辑器导入时统一转 WGS84 lng/lat；
- `Polygon` — `repeated PointENU point`；
- `LineSegment` — `repeated PointENU point`；
- `CurveSegment` — `LineSegment line_segment, double s, PointENU
start_position, double heading, double length`，所有 scalar 都是
  proto2 optional；
- `Curve` — `repeated CurveSegment segment`。

`map_id.proto` 定义 `Id { string id = 1; }`，所有实体引用都用这个
wrap（编辑器内部统一去掉 wrap 改成 `string`）。

## entityBridge 概览

`src/io/proto/entityBridge/` 是 raw proto object ↔ `MapEntity` 的
双向桥。子模块：

| 子模块                          | 处理实体                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `common.ts`                     | `RawId / RawPoint / RawCurve / RawPolygon` + 转换助手                              |
| `enums.ts`                      | 数字 ↔ 字符串枚举映射 + INV 反向                                                   |
| `laneRoad.ts`                   | `LaneEntity`、`RoadEntity` + sections                                              |
| `overlap.ts`                    | `OverlapEntity` + ObjectOverlapInfo / RegionOverlapInfo                            |
| `simpleEntities/basic.ts`       | crosswalk / junction / clearArea / parkingSpace / stopSign / yieldSign / speedBump |
| `simpleEntities/misc.ts`        | barrierGate / rsu / area                                                           |
| `simpleEntities/pncJunction.ts` | pncJunction + passages                                                             |
| `simpleEntities/signal.ts`      | signal + subsignal + signInfo                                                      |
| `map.ts`                        | `apolloMapToEntities` / `entitiesToApolloMap` 总入口                               |

每个实体子模块都按对称的两个函数对外暴露：
`raw<Entity>ToEntity(raw): <Entity>Entity | null` 与
`entityToRaw<Entity>(entity): Raw<Entity>`。详见
[io/proto-entity-bridge](/api/io/proto-entity-bridge)。

## editor_meta.proto

```proto
message EditorMeta {
  optional uint32 version = 1;
  map<string, EditorEntityMeta> entity = 2;
}
message EditorEntityMeta {
  optional EditorGeometryKind geometry_kind = 1;
}
enum EditorGeometryKind {
  EDITOR_GEOMETRY_KIND_UNSPECIFIED = 0;
  LINESTRING = 1;
  POLYGON = 2;
}
```

`Map.editor_meta = 1000`：proto2 默认未知字段保留 → Apollo 运行时不
认识它但不会丢；编辑器读写见
[io/proto-editor-meta](/api/io/proto-editor-meta)。
