---
title: Proto Schema
description: Apollo Map Studio 中所有 .proto 文件（src/proto/ 下的 basic_msgs / map_msgs / editor）的逐文件 schema 速览。
---

# Proto Schema

本页是 `src/proto/` 下所有 `.proto` 文件的「单页速查」。Apollo Map Studio
通过 `protobufjs` 在运行时加载这些 `.proto` 原文（不预编译为 .ts），所以
它们既是 wire 真相，也是 TS 类型层的设计依据。

::: tip 阅读指引

- 字段编号严格保留：proto2 的「unknown 字段保留」依赖编号稳定。
- `optional` 与 `required` 严格区分：见 [Apollo Types](/reference/apollo-types) 中的 `proto2 optional` 守则。
- 编辑器自定义字段位于 `editor/editor_meta.proto`，挂在 `Map.editor_meta` 字段号 1000。
  :::

## 文件清单

| 路径                               | 顶层 message                  | 行数 | 主要内容                                              |
| ---------------------------------- | ----------------------------- | ---- | ----------------------------------------------------- |
| `basic_msgs/geometry.proto`        | `PointENU`, `Polygon` 等      | 62   | Apollo 通用几何点 / 多边形                            |
| `map_msgs/map_id.proto`            | `Id`                          | 8    | 通用 ID 包装                                          |
| `map_msgs/map_geometry.proto`      | `Polygon`, `Curve`            | 31   | 地图几何（Polygon、LineSegment、CurveSegment、Curve） |
| `map_msgs/map_lane.proto`          | `Lane`                        | 110  | 车道、车道边界、车道枚举                              |
| `map_msgs/map_junction.proto`      | `Junction`                    | 24   | 路口及其类型                                          |
| `map_msgs/map_road.proto`          | `Road`                        | 64   | 道路、Section、RoadBoundary                           |
| `map_msgs/map_overlap.proto`       | `Overlap`                     | 77   | Overlap 图、Region overlap                            |
| `map_msgs/map_signal.proto`        | `Signal`                      | 57   | 信号灯、Subsignal、SignInfo                           |
| `map_msgs/map_crosswalk.proto`     | `Crosswalk`                   | 15   | 人行横道                                              |
| `map_msgs/map_stop_sign.proto`     | `StopSign`                    | 26   | 停车牌                                                |
| `map_msgs/map_yield_sign.proto`    | `YieldSign`                   | 18   | 让行牌                                                |
| `map_msgs/map_clear_area.proto`    | `ClearArea`                   | 14   | 禁停区                                                |
| `map_msgs/map_speed_bump.proto`    | `SpeedBump`                   | 12   | 减速带                                                |
| `map_msgs/map_speed_control.proto` | `SpeedControl`                | 19   | 速度控制（旁路文件）                                  |
| `map_msgs/map_parking_space.proto` | `ParkingSpace`, `ParkingLot`  | 26   | 停车位 / 停车场                                       |
| `map_msgs/map_pnc_junction.proto`  | `PNCJunction`                 | 38   | PNC 路口及其 passage group                            |
| `map_msgs/map_barrier_gate.proto`  | `BarrierGate`                 | 21   | 道闸                                                  |
| `map_msgs/map_rsu.proto`           | `RSU`                         | 11   | 路侧单元                                              |
| `map_msgs/map_area.proto`          | `Area`                        | 22   | 通用区域元素                                          |
| `map_msgs/map.proto`               | `Map`, `Header`, `Projection` | 68   | 顶层地图容器                                          |
| `editor/editor_meta.proto`         | `EditorMeta`, `EntityMeta`    | 38   | 编辑器自定义元数据                                    |

> 上表来自仓库实际 `wc -l` 输出，下文按文件依次展开 message。

---

## `basic_msgs/geometry.proto`

`package apollo.common`。Apollo 通用几何基础类型。

```proto
message PointENU {
  optional double x = 1 [default = nan];  // East from the origin, in meters.
  optional double y = 2 [default = nan];  // North from the origin, in meters.
  optional double z = 3 [default = 0.0];  // Up from the WGS-84 ellipsoid, in meters.
}
```

| Message      | 用途                            | 关键字段                            |
| ------------ | ------------------------------- | ----------------------------------- |
| `PointENU`   | ENU 三维点                      | `x`(1), `y`(2), `z`(3, default 0.0) |
| `PointLLH`   | WGS84 经纬高点                  | `lon`, `lat`, `height`              |
| `Point2D`    | 通用 2D 点                      | `x`(1), `y`(2)                      |
| `Point3D`    | 通用 3D 点                      | `x`(1), `y`(2), `z`(3)              |
| `Quaternion` | 四元数                          | `qx`, `qy`, `qz`, `qw`              |
| `Polygon`    | 通用多边形（counter clockwise） | `repeated Point3D point = 1`        |

::: warning Apollo 中常见 NaN
`PointENU.x / y` 默认值是 `nan`。protobufjs round-trip 时若 TS 写入 `0`，
会被反序列化端识别为「主动设置 0」，与原始空值语义不同。务必保留 `undefined`。
:::

---

## `map_msgs/map_id.proto`

`package apollo.hdmap`。

```proto
message Id {
  optional string id = 1;
}
```

所有元素 ID 字段都使用这个包装类型。

---

## `map_msgs/map_geometry.proto`

`package apollo.hdmap`。

```proto
message Polygon { repeated apollo.common.PointENU point = 1; }
message LineSegment { repeated apollo.common.PointENU point = 1; }
message CurveSegment {
  oneof curve_type { LineSegment line_segment = 1; }
  optional double s = 6;
  optional apollo.common.PointENU start_position = 7;
  optional double heading = 8;
  optional double length = 9;
}
message Curve { repeated CurveSegment segment = 1; }
```

要点：

- `CurveSegment.curve_type` 是 oneof，目前只实现了 `line_segment`，预留 `arc / spiral`。
- 字段 6/7/8/9 均为 proto2 `optional`，**不要**默认填 0。
- `Curve` 是 lane / signal / road 等所有「线状几何」的复用积木。

---

## `map_msgs/map_lane.proto`

`package apollo.hdmap`。本项目核心 message。

### `LaneBoundaryType`

```proto
message LaneBoundaryType {
  enum Type { UNKNOWN = 0; DOTTED_YELLOW = 1; DOTTED_WHITE = 2;
              SOLID_YELLOW = 3; SOLID_WHITE = 4; DOUBLE_YELLOW = 5; CURB = 6; }
  optional double s = 1;
  repeated Type types = 2;
}
```

### `LaneBoundary`

```proto
message LaneBoundary {
  optional Curve curve = 1;
  optional double length = 2;
  optional bool virtual = 3;
  repeated LaneBoundaryType boundary_type = 4;
}
```

### `LaneSampleAssociation`

```proto
message LaneSampleAssociation {
  optional double s = 1;
  optional double width = 2;
}
```

### `Lane`（顶层）

| 字段                             | 编号 | 类型                           | 备注                                                                  |
| -------------------------------- | ---- | ------------------------------ | --------------------------------------------------------------------- |
| `id`                             | 1    | Id                             | 全局唯一 ID                                                           |
| `central_curve`                  | 2    | Curve                          | 中心参考线                                                            |
| `left_boundary`                  | 3    | LaneBoundary                   | 左边界                                                                |
| `right_boundary`                 | 4    | LaneBoundary                   | 右边界                                                                |
| `length`                         | 5    | double                         | 米                                                                    |
| `speed_limit`                    | 6    | double                         | m/s                                                                   |
| `overlap_id`                     | 7    | repeated Id                    | 关联 overlap                                                          |
| `predecessor_id`                 | 8    | repeated Id                    | 来车道                                                                |
| `successor_id`                   | 9    | repeated Id                    | 去车道                                                                |
| `left_neighbor_forward_lane_id`  | 10   | repeated Id                    | 左同向邻车道                                                          |
| `right_neighbor_forward_lane_id` | 11   | repeated Id                    | 右同向邻车道                                                          |
| `type`                           | 12   | LaneType                       | NONE / CITY_DRIVING / BIKING / SIDEWALK / PARKING / SHOULDER / SHARED |
| `turn`                           | 13   | LaneTurn                       | NO_TURN / LEFT_TURN / RIGHT_TURN / U_TURN                             |
| `left_neighbor_reverse_lane_id`  | 14   | repeated Id                    | 左反向邻车道                                                          |
| `right_neighbor_reverse_lane_id` | 15   | repeated Id                    | 右反向邻车道                                                          |
| `junction_id`                    | 16   | Id                             | 所属 junction                                                         |
| `left_sample`                    | 17   | repeated LaneSampleAssociation | 左侧宽度采样                                                          |
| `right_sample`                   | 18   | repeated LaneSampleAssociation | 右侧宽度采样                                                          |
| `direction`                      | 19   | LaneDirection                  | FORWARD / BACKWARD / BIDIRECTION                                      |
| `left_road_sample`               | 20   | repeated LaneSampleAssociation | 至左 road 边界距离                                                    |
| `right_road_sample`              | 21   | repeated LaneSampleAssociation | 至右 road 边界距离                                                    |
| `self_reverse_lane_id`           | 22   | repeated Id                    | 自反向车道                                                            |

---

## `map_msgs/map_junction.proto`

```proto
message Junction {
  optional Id id = 1;
  optional Polygon polygon = 2;
  repeated Id overlap_id = 3;
  enum Type { UNKNOWN = 0; IN_ROAD = 1; CROSS_ROAD = 2; FORK_ROAD = 3; MAIN_SIDE = 4; DEAD_END = 5; }
  optional Type type = 4;
}
```

---

## `map_msgs/map_road.proto`

```proto
message BoundaryEdge {
  optional Curve curve = 1;
  enum Type { UNKNOWN = 0; NORMAL = 1; LEFT_BOUNDARY = 2; RIGHT_BOUNDARY = 3; }
  optional Type type = 2;
}
message BoundaryPolygon { repeated BoundaryEdge edge = 1; }
message RoadBoundary {
  optional BoundaryPolygon outer_polygon = 1;
  repeated BoundaryPolygon hole = 2;
}
message RoadSection {
  optional Id id = 1;
  repeated Id lane_id = 2;
  optional RoadBoundary boundary = 3;
}
message Road {
  optional Id id = 1;
  repeated RoadSection section = 2;
  optional Id junction_id = 3;
  enum Type { UNKNOWN = 0; HIGHWAY = 1; CITY_ROAD = 2; PARK = 3; }
  optional Type type = 4;
}
```

---

## `map_msgs/map_overlap.proto`

Overlap 把任意两类元素（lane / signal / junction / crosswalk / ...）的关系
统一抽象成一组 `ObjectOverlapInfo`。`oneof overlap_info` 按对象类型分支。

```proto
message LaneOverlapInfo {
  optional double start_s = 1;
  optional double end_s = 2;
  optional bool is_merge = 3;
  optional Id region_overlap_id = 4;
}
message ObjectOverlapInfo {
  optional Id id = 1;
  oneof overlap_info {
    LaneOverlapInfo lane_overlap_info = 3;
    SignalOverlapInfo signal_overlap_info = 4;
    StopSignOverlapInfo stop_sign_overlap_info = 5;
    CrosswalkOverlapInfo crosswalk_overlap_info = 6;
    JunctionOverlapInfo junction_overlap_info = 7;
    YieldOverlapInfo yield_sign_overlap_info = 8;
    ClearAreaOverlapInfo clear_area_overlap_info = 9;
    SpeedBumpOverlapInfo speed_bump_overlap_info = 10;
    ParkingSpaceOverlapInfo parking_space_overlap_info = 11;
    PNCJunctionOverlapInfo pnc_junction_overlap_info = 12;
    RSUOverlapInfo rsu_overlap_info = 13;
    AreaOverlapInfo area_overlap_info = 14;
    BarrierGateOverlapInfo barrier_gate_overlap_info = 15;
  }
}
message Overlap {
  optional Id id = 1;
  repeated ObjectOverlapInfo object = 2;
  repeated RegionOverlapInfo region_overlap = 3;
}
```

::: warning Apollo 真实地图中允许 oneof 不设置
某些 `lane↔crosswalk` overlap 在源数据里没有写 `overlap_info`，bridge 端
通过 `unknown` 变体 pass-through，避免 round-trip 丢失数据。详见
[Apollo Types](/reference/apollo-types) 中的 `ObjectOverlapInfo` 联合。
:::

---

## `map_msgs/map_signal.proto`

```proto
message Subsignal {
  enum Type { UNKNOWN=1; CIRCLE=2; ARROW_LEFT=3; ARROW_FORWARD=4;
              ARROW_RIGHT=5; ARROW_LEFT_AND_FORWARD=6;
              ARROW_RIGHT_AND_FORWARD=7; ARROW_U_TURN=8; }
  optional Id id = 1;
  optional Type type = 2;
  optional apollo.common.PointENU location = 3;  // 真实地图基本不写
}
message SignInfo {
  enum Type { None = 0; NO_RIGHT_TURN_ON_RED = 1; }
  optional Type type = 1;
}
message Signal {
  enum Type { UNKNOWN=1; MIX_2_HORIZONTAL=2; MIX_2_VERTICAL=3;
              MIX_3_HORIZONTAL=4; MIX_3_VERTICAL=5; SINGLE=6; }
  optional Id id = 1;
  optional Polygon boundary = 2;
  repeated Subsignal subsignal = 3;
  repeated Id overlap_id = 4;
  optional Type type = 5;
  repeated Curve stop_line = 6;
  repeated SignInfo sign_info = 7;
}
```

---

## `map_msgs/map_crosswalk.proto`

```proto
message Crosswalk {
  optional Id id = 1;
  optional Polygon polygon = 2;
  repeated Id overlap_id = 3;
}
```

## `map_msgs/map_stop_sign.proto`

```proto
message StopSign {
  optional Id id = 1;
  repeated Curve stop_line = 2;
  repeated Id overlap_id = 3;
  enum StopType { UNKNOWN = 0; ONE_WAY = 1; TWO_WAY = 2;
                  THREE_WAY = 3; FOUR_WAY = 4; ALL_WAY = 5; }
  optional StopType type = 4;
}
```

## `map_msgs/map_yield_sign.proto`

```proto
message YieldSign {
  optional Id id = 1;
  repeated Curve stop_line = 2;
  repeated Id overlap_id = 3;
}
```

## `map_msgs/map_clear_area.proto`

```proto
message ClearArea {
  optional Id id = 1;
  repeated Id overlap_id = 2;
  optional Polygon polygon = 3;
}
```

## `map_msgs/map_speed_bump.proto`

```proto
message SpeedBump {
  optional Id id = 1;
  repeated Id overlap_id = 2;
  repeated Curve position = 3;
}
```

## `map_msgs/map_speed_control.proto`

旁路文件，并不直接嵌入 `Map`。

```proto
message SpeedControl {
  optional string name = 1;
  optional apollo.hdmap.Polygon polygon = 2;
  optional double speed_limit = 3;
}
message SpeedControls { repeated SpeedControl speed_control = 1; }
```

## `map_msgs/map_parking_space.proto`

```proto
message ParkingSpace {
  optional Id id = 1;
  optional Polygon polygon = 2;
  repeated Id overlap_id = 3;
  optional double heading = 4;
}
message ParkingLot {
  optional Id id = 1;
  optional Polygon polygon = 2;
  repeated Id overlap_id = 3;
}
```

## `map_msgs/map_pnc_junction.proto`

```proto
message Passage {
  optional Id id = 1;
  repeated Id signal_id = 2;
  repeated Id yield_id = 3;
  repeated Id stop_sign_id = 4;
  repeated Id lane_id = 5;
  enum Type { UNKNOWN = 0; ENTRANCE = 1; EXIT = 2; }
  optional Type type = 6;
}
message PassageGroup {
  optional Id id = 1;
  repeated Passage passage = 2;
}
message PNCJunction {
  optional Id id = 1;
  optional Polygon polygon = 2;
  repeated Id overlap_id = 3;
  repeated PassageGroup passage_group = 4;
}
```

## `map_msgs/map_barrier_gate.proto`

```proto
message BarrierGate {
  enum BarrierGateType { ROD=1; FENCE=2; ADVERTISING=3; TELESCOPIC=4; OTHER=5; }
  required Id id = 1;
  optional BarrierGateType type = 2;
  optional Polygon polygon = 3;
  repeated Curve stop_line = 4;
  repeated Id overlap_id = 5;
}
```

## `map_msgs/map_rsu.proto`

```proto
message RSU {
  optional Id id = 1;
  optional Id junction_id = 2;
  repeated Id overlap_id = 3;
}
```

## `map_msgs/map_area.proto`

```proto
message Area {
  enum Type { Driveable=1; UnDriveable=2; Custom1=3; Custom2=4; Custom3=5; }
  required Id id = 1;
  optional Type type = 2;
  required Polygon polygon = 3;
  repeated Id overlap_id = 4;
  optional string name = 5;
}
```

---

## `map_msgs/map.proto`

顶层容器。

```proto
message Projection {
  optional string proj = 1;  // PROJ.4 字符串
}
message Header {
  optional bytes version = 1;
  optional bytes date = 2;
  optional Projection projection = 3;
  optional bytes district = 4;
  optional bytes generation = 5;
  optional bytes rev_major = 6;
  optional bytes rev_minor = 7;
  optional double left = 8;
  optional double top = 9;
  optional double right = 10;
  optional double bottom = 11;
  optional bytes vendor = 12;
}
message Map {
  optional Header header = 1;
  repeated Crosswalk crosswalk = 2;
  repeated Junction junction = 3;
  repeated Lane lane = 4;
  repeated StopSign stop_sign = 5;
  repeated Signal signal = 6;
  repeated YieldSign yield = 7;
  repeated Overlap overlap = 8;
  repeated ClearArea clear_area = 9;
  repeated SpeedBump speed_bump = 10;
  repeated Road road = 11;
  repeated ParkingSpace parking_space = 12;
  repeated PNCJunction pnc_junction = 13;
  repeated RSU rsu = 14;
  repeated Area ad_area = 15;
  repeated BarrierGate barrier_gate = 16;
  optional apollo.hdmap.editor.EditorMeta editor_meta = 1000;
}
```

::: tip 字段编号 1000 的含义
`editor_meta` 字段是 Apollo Map Studio 私有扩展，使用 ≥1000 的字段段，
确保不与未来 Apollo 官方字段冲突。Apollo 运行时把它当作 unknown 字段保留。
:::

---

## `editor/editor_meta.proto`

```proto
message EditorMeta {
  optional uint32 version = 1;
  map<string, EntityMeta> entity = 2;  // key: "<entityType>:<id>"
}
message EntityMeta {
  enum GeometryKind {
    GEOMETRY_KIND_UNSPECIFIED = 0;
    LINESTRING = 1;
    POLYGON = 2;
  }
  optional GeometryKind geometry_kind = 1;
}
```

要点：

- 仅追加，不能删字段；删字段必须用 `reserved`。
- 字段编号跨编辑器版本稳定。
- 仅供编辑器消费，**禁止**在 Apollo 生产代码中读取。

## 字段编号备忘表

| 区段  | 用途                                                        |
| ----- | ----------------------------------------------------------- |
| 1–999 | Apollo 官方字段。新增需向 Apollo 项目对齐。                 |
| 1000+ | Apollo Map Studio 私有扩展（如 `Map.editor_meta = 1000`）。 |

## 关联文档

- [Apollo Types](/reference/apollo-types) — TypeScript 视角逐字段对照
- [Enum Mappings](/reference/enum-mappings) — 枚举数值 / 标签对照
- [架构总览](/architecture/overview)
- [Worker 协议](/architecture/worker-protocol)
- [导出引擎](/architecture/export-engine)
