# proto/schema

Apollo HD Map 的 Protocol Buffers 数据模型定义。所有 `.proto` 文件位于 `public/proto/`，由 [proto/loader](./proto-loader) 在运行时加载。

## 概览

Proto 文件定义了 Apollo 高精地图中所有地图元素的数据结构，属于 `apollo.hdmap` 包（几何基础类型属于 `apollo.common`，拓扑图属于 `apollo.routing`）。

顶层入口是 `map.proto` 中的 `Map` 消息，它聚合了所有地图元素：

```proto
message Map {
  Header header = 1;
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
}
```

## 文件依赖关系

```
geometry.proto (apollo.common)
  └── map_geometry.proto
        ├── map_lane.proto
        ├── map_road.proto
        ├── map_junction.proto
        ├── map_signal.proto
        ├── map_stop_sign.proto
        ├── map_yield_sign.proto
        ├── map_crosswalk.proto
        ├── map_clear_area.proto
        ├── map_speed_bump.proto
        ├── map_parking_space.proto
        ├── map_pnc_junction.proto
        ├── map_area.proto
        ├── map_barrier_gate.proto
        ├── map_overlap.proto
        ├── map_speed_control.proto
        └── topo_graph.proto (apollo.routing)

map_id.proto ──────► 上述大部分文件
map_rsu.proto ─────► map_id.proto

map.proto ─────────► 聚合所有 map_*.proto
```

## 基础类型

### geometry.proto

包：`apollo.common`

| 消息         | 说明                 | 关键字段                 |
| ------------ | -------------------- | ------------------------ |
| `PointENU`   | 东-北-天坐标点       | `x`, `y`, `z`            |
| `PointLLH`   | 经纬高坐标点         | `lon`, `lat`, `height`   |
| `Point2D`    | 二维点               | `x`, `y`                 |
| `Point3D`    | 三维点               | `x`, `y`, `z`            |
| `Quaternion` | 四元数旋转           | `qx`, `qy`, `qz`, `qw`   |
| `Polygon`    | 二维多边形（逆时针） | `repeated Point3D point` |

### map_geometry.proto

包：`apollo.hdmap` — 导入 `geometry.proto`

| 消息           | 说明               | 关键字段                                                                       |
| -------------- | ------------------ | ------------------------------------------------------------------------------ |
| `Polygon`      | 多边形             | `repeated PointENU point`                                                      |
| `LineSegment`  | 直线段             | `repeated PointENU point`                                                      |
| `CurveSegment` | 曲线段             | `oneof curve_type { LineSegment }`, `s`, `start_position`, `heading`, `length` |
| `Curve`        | 由若干段组成的曲线 | `repeated CurveSegment segment`                                                |

### map_id.proto

包：`apollo.hdmap`

| 消息 | 说明         | 关键字段    |
| ---- | ------------ | ----------- |
| `Id` | 全局唯一标识 | `string id` |

## 车道与道路

### map_lane.proto

包：`apollo.hdmap` — 导入 `map_geometry.proto`, `map_id.proto`

**消息：**

| 消息                    | 说明                   |
| ----------------------- | ---------------------- |
| `Lane`                  | 车道定义               |
| `LaneBoundary`          | 车道边界线             |
| `LaneBoundaryType`      | 边界线类型描述         |
| `LaneSampleAssociation` | 中心点到边界的宽度采样 |

**`Lane` 关键字段：**

| 字段             | 类型            | 说明        |
| ---------------- | --------------- | ----------- |
| `id`             | `Id`            | 车道标识    |
| `central_curve`  | `Curve`         | 中心线      |
| `left_boundary`  | `LaneBoundary`  | 左边界      |
| `right_boundary` | `LaneBoundary`  | 右边界      |
| `length`         | `double`        | 车道长度    |
| `speed_limit`    | `double`        | 限速（m/s） |
| `predecessor_id` | `repeated Id`   | 前驱车道    |
| `successor_id`   | `repeated Id`   | 后继车道    |
| `junction_id`    | `Id`            | 所属路口    |
| `direction`      | `LaneDirection` | 方向        |

**枚举：**

| 枚举                    | 值                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `LaneBoundaryType.Type` | `UNKNOWN`, `DOTTED_YELLOW`, `DOTTED_WHITE`, `SOLID_YELLOW`, `SOLID_WHITE`, `DOUBLE_YELLOW`, `CURB` |
| `Lane.LaneType`         | `NONE`, `CITY_DRIVING`, `BIKING`, `SIDEWALK`, `PARKING`, `SHOULDER`, `SHARED`                      |
| `Lane.LaneTurn`         | `NO_TURN`, `LEFT_TURN`, `RIGHT_TURN`, `U_TURN`                                                     |
| `Lane.LaneDirection`    | `FORWARD`, `BACKWARD`, `BIDIRECTION`                                                               |

### map_road.proto

包：`apollo.hdmap` — 导入 `map_geometry.proto`, `map_id.proto`

**消息：**

| 消息              | 说明                         |
| ----------------- | ---------------------------- |
| `Road`            | 道路（包含若干 RoadSection） |
| `RoadSection`     | 道路截面（包含若干 Lane）    |
| `RoadBoundary`    | 道路边界                     |
| `BoundaryPolygon` | 边界多边形                   |
| `BoundaryEdge`    | 边界边                       |
| `RoadROIBoundary` | 道路感兴趣区域边界           |

**枚举：**

| 枚举                | 值                                                     |
| ------------------- | ------------------------------------------------------ |
| `BoundaryEdge.Type` | `UNKNOWN`, `NORMAL`, `LEFT_BOUNDARY`, `RIGHT_BOUNDARY` |
| `Road.Type`         | `UNKNOWN`, `HIGHWAY`, `CITY_ROAD`, `PARK`              |

## 路口

### map_junction.proto

包：`apollo.hdmap` — 导入 `map_geometry.proto`, `map_id.proto`

| 消息       | 说明 | 关键字段                              |
| ---------- | ---- | ------------------------------------- |
| `Junction` | 路口 | `id`, `polygon`, `overlap_id`, `type` |

**枚举：**

| 枚举            | 值                                                                       |
| --------------- | ------------------------------------------------------------------------ |
| `Junction.Type` | `UNKNOWN`, `IN_ROAD`, `CROSS_ROAD`, `FORK_ROAD`, `MAIN_SIDE`, `DEAD_END` |

### map_pnc_junction.proto

包：`apollo.hdmap` — 导入 `map_geometry.proto`, `map_id.proto`

PNC（Planning and Control）路口，用于自动驾驶规划。

| 消息           | 说明     | 关键字段                                                         |
| -------------- | -------- | ---------------------------------------------------------------- |
| `PNCJunction`  | PNC 路口 | `id`, `polygon`, `overlap_id`, `repeated passage_group`          |
| `PassageGroup` | 通道组   | `id`, `repeated passage`                                         |
| `Passage`      | 通道     | `id`, `signal_id`, `yield_id`, `stop_sign_id`, `lane_id`, `type` |

**枚举：**

| 枚举           | 值                            |
| -------------- | ----------------------------- |
| `Passage.Type` | `UNKNOWN`, `ENTRANCE`, `EXIT` |

## 交通设施

### map_signal.proto

包：`apollo.hdmap` — 导入 `geometry.proto`, `map_geometry.proto`, `map_id.proto`

| 消息        | 说明         | 关键字段                                                                           |
| ----------- | ------------ | ---------------------------------------------------------------------------------- |
| `Signal`    | 信号灯       | `id`, `boundary`, `repeated subsignal`, `overlap_id`, `type`, `repeated stop_line` |
| `Subsignal` | 子信号灯     | `id`, `type`, `location`                                                           |
| `SignInfo`  | 信号标志信息 | `type`                                                                             |

**枚举：**

| 枚举             | 值                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Subsignal.Type` | `UNKNOWN`, `CIRCLE`, `ARROW_LEFT`, `ARROW_FORWARD`, `ARROW_RIGHT`, `ARROW_LEFT_AND_FORWARD`, `ARROW_RIGHT_AND_FORWARD`, `ARROW_U_TURN` |
| `Signal.Type`    | `UNKNOWN`, `MIX_2_HORIZONTAL`, `MIX_2_VERTICAL`, `MIX_3_HORIZONTAL`, `MIX_3_VERTICAL`, `SINGLE`                                        |
| `SignInfo.Type`  | `None`, `NO_RIGHT_TURN_ON_RED`                                                                                                         |

### map_stop_sign.proto

包：`apollo.hdmap` — 导入 `map_geometry.proto`, `map_id.proto`

| 消息       | 说明     | 关键字段                                         |
| ---------- | -------- | ------------------------------------------------ |
| `StopSign` | 停车标志 | `id`, `repeated stop_line`, `overlap_id`, `type` |

**枚举：**

| 枚举                | 值                                                                  |
| ------------------- | ------------------------------------------------------------------- |
| `StopSign.StopType` | `UNKNOWN`, `ONE_WAY`, `TWO_WAY`, `THREE_WAY`, `FOUR_WAY`, `ALL_WAY` |

### map_yield_sign.proto

包：`apollo.hdmap` — 导入 `map_geometry.proto`, `map_id.proto`

| 消息        | 说明     | 关键字段                                 |
| ----------- | -------- | ---------------------------------------- |
| `YieldSign` | 让行标志 | `id`, `repeated stop_line`, `overlap_id` |

### map_barrier_gate.proto

包：`apollo.hdmap` — 导入 `map_geometry.proto`, `map_id.proto`

| 消息          | 说明 | 关键字段                                                    |
| ------------- | ---- | ----------------------------------------------------------- |
| `BarrierGate` | 道闸 | `id`, `type`, `polygon`, `repeated stop_line`, `overlap_id` |

**枚举：**

| 枚举                          | 值                                                   |
| ----------------------------- | ---------------------------------------------------- |
| `BarrierGate.BarrierGateType` | `ROD`, `FENCE`, `ADVERTISING`, `TELESCOPIC`, `OTHER` |

## 道路标记与区域

### map_crosswalk.proto

包：`apollo.hdmap` — 导入 `map_geometry.proto`, `map_id.proto`

| 消息        | 说明     | 关键字段                      |
| ----------- | -------- | ----------------------------- |
| `Crosswalk` | 人行横道 | `id`, `polygon`, `overlap_id` |

### map_clear_area.proto

包：`apollo.hdmap` — 导入 `map_geometry.proto`, `map_id.proto`

| 消息        | 说明   | 关键字段                      |
| ----------- | ------ | ----------------------------- |
| `ClearArea` | 禁停区 | `id`, `overlap_id`, `polygon` |

### map_speed_bump.proto

包：`apollo.hdmap` — 导入 `map_geometry.proto`, `map_id.proto`

| 消息        | 说明   | 关键字段                                |
| ----------- | ------ | --------------------------------------- |
| `SpeedBump` | 减速带 | `id`, `overlap_id`, `repeated position` |

### map_parking_space.proto

包：`apollo.hdmap` — 导入 `map_geometry.proto`, `map_id.proto`

| 消息           | 说明   | 关键字段                                 |
| -------------- | ------ | ---------------------------------------- |
| `ParkingSpace` | 停车位 | `id`, `polygon`, `overlap_id`, `heading` |
| `ParkingLot`   | 停车场 | `id`, `polygon`, `overlap_id`            |

### map_area.proto

包：`apollo.hdmap` — 导入 `map_geometry.proto`, `map_id.proto`

| 消息   | 说明       | 关键字段                                      |
| ------ | ---------- | --------------------------------------------- |
| `Area` | 自定义区域 | `id`, `type`, `polygon`, `overlap_id`, `name` |

**枚举：**

| 枚举        | 值                                                          |
| ----------- | ----------------------------------------------------------- |
| `Area.Type` | `Driveable`, `UnDriveable`, `Custom1`, `Custom2`, `Custom3` |

### map_speed_control.proto

包：`apollo.hdmap` — 导入 `map_geometry.proto`

| 消息            | 说明     | 关键字段                         |
| --------------- | -------- | -------------------------------- |
| `SpeedControl`  | 区域限速 | `name`, `polygon`, `speed_limit` |
| `SpeedControls` | 限速集合 | `repeated speed_control`         |

## 重叠关系

### map_overlap.proto

包：`apollo.hdmap` — 导入 `map_geometry.proto`, `map_id.proto`

Overlap 描述两个地图元素在空间上的重叠关系，是连接交通设施与车道的关键结构。

**核心消息：**

| 消息                | 说明                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `Overlap`           | 重叠关系 — 包含 `id`, `repeated ObjectOverlapInfo object`, `repeated RegionOverlapInfo region_overlap` |
| `ObjectOverlapInfo` | 对象重叠信息 — `id` + `oneof overlap_info`（见下表）                                                   |
| `RegionOverlapInfo` | 区域重叠信息 — `id`, `repeated polygon`                                                                |

**ObjectOverlapInfo 可选类型：**

| 类型     | 对应消息                                                                |
| -------- | ----------------------------------------------------------------------- |
| 车道     | `LaneOverlapInfo` — `start_s`, `end_s`, `is_merge`, `region_overlap_id` |
| 信号灯   | `SignalOverlapInfo`                                                     |
| 停车标志 | `StopSignOverlapInfo`                                                   |
| 人行横道 | `CrosswalkOverlapInfo` — `region_overlap_id`                            |
| 路口     | `JunctionOverlapInfo`                                                   |
| 让行标志 | `YieldOverlapInfo`                                                      |
| 禁停区   | `ClearAreaOverlapInfo`                                                  |
| 减速带   | `SpeedBumpOverlapInfo`                                                  |
| 停车位   | `ParkingSpaceOverlapInfo`                                               |
| PNC 路口 | `PNCJunctionOverlapInfo`                                                |
| RSU      | `RSUOverlapInfo`                                                        |
| 区域     | `AreaOverlapInfo`                                                       |
| 道闸     | `BarrierGateOverlapInfo`                                                |

## 其他

### map_rsu.proto

包：`apollo.hdmap` — 导入 `map_id.proto`

| 消息  | 说明     | 关键字段                          |
| ----- | -------- | --------------------------------- |
| `RSU` | 路侧单元 | `id`, `junction_id`, `overlap_id` |

### map.proto — Header

| 消息         | 说明       | 关键字段                                                          |
| ------------ | ---------- | ----------------------------------------------------------------- |
| `Header`     | 地图头信息 | `version`, `date`, `projection`, `district`, `vendor`, 边界坐标等 |
| `Projection` | 投影设置   | `proj`（PROJ.4 格式字符串）                                       |

## 拓扑图

### topo_graph.proto

包：`apollo.routing` — 导入 `map_geometry.proto`

用于路径规划的拓扑图结构。

| 消息         | 说明       | 关键字段                                                                                       |
| ------------ | ---------- | ---------------------------------------------------------------------------------------------- |
| `Graph`      | 拓扑图     | `hdmap_version`, `hdmap_district`, `repeated node`, `repeated edge`                            |
| `Node`       | 拓扑节点   | `lane_id`, `length`, `cost`, `central_curve`, `is_virtual`, `road_id`, `left_out`, `right_out` |
| `Edge`       | 拓扑边     | `from_lane_id`, `to_lane_id`, `cost`, `direction_type`                                         |
| `CurveRange` | 曲线范围   | `start`, `end`                                                                                 |
| `CurvePoint` | 曲线上的点 | `s`                                                                                            |

**枚举：**

| 枚举                 | 值                         |
| -------------------- | -------------------------- |
| `Edge.DirectionType` | `FORWARD`, `LEFT`, `RIGHT` |
