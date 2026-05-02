---
title: Proto Schema
description: Per-file schema reference for every .proto under src/proto/ — basic_msgs, map_msgs, and the editor extension.
---

# Proto Schema

This page is the single-glance reference for every protobuf file in
`src/proto/`. Apollo Map Studio loads these `.proto` files at runtime via
`protobufjs` (no precompiled artefacts), so they are simultaneously the wire
truth and the design source for the TypeScript types in
[Apollo Types](/en/reference/apollo-types).

::: tip Reading guide

- Field numbers are stable: proto2 unknown-field retention depends on it.
- `optional` versus `required` matters — see the proto2-optional rule in
  [Apollo Types](/en/reference/apollo-types).
- Editor-only extensions live in `editor/editor_meta.proto`, attached at
  `Map.editor_meta = 1000`.
  :::

## File catalogue

| Path                               | Top-level message             | Lines | Highlights                                                     |
| ---------------------------------- | ----------------------------- | ----- | -------------------------------------------------------------- |
| `basic_msgs/geometry.proto`        | `PointENU`, `Polygon`, ...    | 62    | Apollo common geometric primitives                             |
| `map_msgs/map_id.proto`            | `Id`                          | 8     | Generic id wrapper                                             |
| `map_msgs/map_geometry.proto`      | `Polygon`, `Curve`            | 31    | Map-level geometry (Polygon, LineSegment, CurveSegment, Curve) |
| `map_msgs/map_lane.proto`          | `Lane`                        | 110   | Lanes, lane boundaries, lane enums                             |
| `map_msgs/map_junction.proto`      | `Junction`                    | 24    | Junctions and types                                            |
| `map_msgs/map_road.proto`          | `Road`                        | 64    | Roads, sections, RoadBoundary                                  |
| `map_msgs/map_overlap.proto`       | `Overlap`                     | 77    | Overlap graph and region overlaps                              |
| `map_msgs/map_signal.proto`        | `Signal`                      | 57    | Signals, subsignals, sign info                                 |
| `map_msgs/map_crosswalk.proto`     | `Crosswalk`                   | 15    | Crosswalks                                                     |
| `map_msgs/map_stop_sign.proto`     | `StopSign`                    | 26    | Stop signs                                                     |
| `map_msgs/map_yield_sign.proto`    | `YieldSign`                   | 18    | Yield signs                                                    |
| `map_msgs/map_clear_area.proto`    | `ClearArea`                   | 14    | No-stop zones                                                  |
| `map_msgs/map_speed_bump.proto`    | `SpeedBump`                   | 12    | Speed bumps                                                    |
| `map_msgs/map_speed_control.proto` | `SpeedControl`                | 19    | Sidecar speed control                                          |
| `map_msgs/map_parking_space.proto` | `ParkingSpace`, `ParkingLot`  | 26    | Parking                                                        |
| `map_msgs/map_pnc_junction.proto`  | `PNCJunction`                 | 38    | PNC junctions and passage groups                               |
| `map_msgs/map_barrier_gate.proto`  | `BarrierGate`                 | 21    | Barrier gates                                                  |
| `map_msgs/map_rsu.proto`           | `RSU`                         | 11    | Roadside units                                                 |
| `map_msgs/map_area.proto`          | `Area`                        | 22    | Generic area element                                           |
| `map_msgs/map.proto`               | `Map`, `Header`, `Projection` | 68    | Top-level container                                            |
| `editor/editor_meta.proto`         | `EditorMeta`, `EntityMeta`    | 38    | Editor-only metadata                                           |

> Line counts above are real `wc -l` output. The sections below expand each
> message in order.

---

## `basic_msgs/geometry.proto`

`package apollo.common`. Common geometric primitives.

```proto
message PointENU {
  optional double x = 1 [default = nan];  // East from the origin, in metres.
  optional double y = 2 [default = nan];  // North from the origin, in metres.
  optional double z = 3 [default = 0.0];  // Up from the WGS-84 ellipsoid, metres.
}
```

| Message      | Purpose                               | Key fields                          |
| ------------ | ------------------------------------- | ----------------------------------- |
| `PointENU`   | ENU 3-D point                         | `x`(1), `y`(2), `z`(3, default 0.0) |
| `PointLLH`   | WGS84 longitude/latitude/height point | `lon`, `lat`, `height`              |
| `Point2D`    | Generic 2-D point                     | `x`(1), `y`(2)                      |
| `Point3D`    | Generic 3-D point                     | `x`(1), `y`(2), `z`(3)              |
| `Quaternion` | Unit rotation quaternion              | `qx`, `qy`, `qz`, `qw`              |
| `Polygon`    | Generic polygon (counter-clockwise)   | `repeated Point3D point = 1`        |

::: warning NaN defaults
`PointENU.x / y` default to `nan`. If TS writes `0`, downstream consumers
will treat it as a deliberate value — distinct from "unset". Preserve
`undefined` instead.
:::

---

## `map_msgs/map_id.proto`

`package apollo.hdmap`.

```proto
message Id {
  optional string id = 1;
}
```

Every entity ID field in the protocol uses this wrapper.

---

## `map_msgs/map_geometry.proto`

`package apollo.hdmap`.

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

Notes:

- `CurveSegment.curve_type` is a oneof. Only `line_segment` is implemented;
  `arc` and `spiral` are reserved.
- Fields 6/7/8/9 are proto2 `optional`. **Do not** default-fill them with 0.
- `Curve` is the reusable building block for every line-shaped geometry
  (lane / signal stop line / road boundary / etc.).

---

## `map_msgs/map_lane.proto`

`package apollo.hdmap`. The most important message in the protocol.

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

### `Lane` (top level)

| Field                            | #   | Type                           | Notes                                                                 |
| -------------------------------- | --- | ------------------------------ | --------------------------------------------------------------------- |
| `id`                             | 1   | Id                             | Globally unique                                                       |
| `central_curve`                  | 2   | Curve                          | Reference centerline                                                  |
| `left_boundary`                  | 3   | LaneBoundary                   | Left edge                                                             |
| `right_boundary`                 | 4   | LaneBoundary                   | Right edge                                                            |
| `length`                         | 5   | double                         | Metres                                                                |
| `speed_limit`                    | 6   | double                         | Metres per second                                                     |
| `overlap_id`                     | 7   | repeated Id                    | Linked overlaps                                                       |
| `predecessor_id`                 | 8   | repeated Id                    | Incoming lanes                                                        |
| `successor_id`                   | 9   | repeated Id                    | Outgoing lanes                                                        |
| `left_neighbor_forward_lane_id`  | 10  | repeated Id                    | Same-direction left neighbors                                         |
| `right_neighbor_forward_lane_id` | 11  | repeated Id                    | Same-direction right neighbors                                        |
| `type`                           | 12  | LaneType                       | NONE / CITY_DRIVING / BIKING / SIDEWALK / PARKING / SHOULDER / SHARED |
| `turn`                           | 13  | LaneTurn                       | NO_TURN / LEFT_TURN / RIGHT_TURN / U_TURN                             |
| `left_neighbor_reverse_lane_id`  | 14  | repeated Id                    | Reverse-direction left neighbors                                      |
| `right_neighbor_reverse_lane_id` | 15  | repeated Id                    | Reverse-direction right neighbors                                     |
| `junction_id`                    | 16  | Id                             | Owning junction                                                       |
| `left_sample`                    | 17  | repeated LaneSampleAssociation | Left-side width samples                                               |
| `right_sample`                   | 18  | repeated LaneSampleAssociation | Right-side width samples                                              |
| `direction`                      | 19  | LaneDirection                  | FORWARD / BACKWARD / BIDIRECTION                                      |
| `left_road_sample`               | 20  | repeated LaneSampleAssociation | Distance to left road boundary                                        |
| `right_road_sample`              | 21  | repeated LaneSampleAssociation | Distance to right road boundary                                       |
| `self_reverse_lane_id`           | 22  | repeated Id                    | Self-reverse pair                                                     |

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

The `Overlap` message generalises the relationship between any two map
elements (lanes, signals, junctions, crosswalks, etc.) into an `ObjectOverlapInfo`
list. The `oneof overlap_info` branches by object type.

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

::: warning Apollo maps may leave the oneof unset
Some `lane↔crosswalk` overlap entries omit `overlap_info`. The bridge
preserves them through an `unknown` variant to avoid round-trip data loss.
See the `ObjectOverlapInfo` union in [Apollo Types](/en/reference/apollo-types).
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
  optional apollo.common.PointENU location = 3;  // Real maps almost never set this.
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

A sidecar file. **Not** embedded in the top-level `Map`.

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

The top-level container.

```proto
message Projection {
  optional string proj = 1;  // PROJ.4 string
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

::: tip Why field 1000?
`editor_meta` is an Apollo Map Studio private extension. Reserving fields
≥ 1000 keeps it isolated from any future official Apollo additions, and
the Apollo runtime treats it as an unknown field that round-trips
unchanged.
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

Schema rules:

- Append-only. Removed fields must use `reserved`.
- Field numbers are stable across editor versions.
- The Apollo runtime must **not** read this — it is an editor-only concern.

## Field-number cheat sheet

| Range | Owner                                                                 |
| ----- | --------------------------------------------------------------------- |
| 1–999 | Apollo upstream. New fields require coordination with Apollo.         |
| 1000+ | Apollo Map Studio private extensions (e.g. `Map.editor_meta = 1000`). |

## Related pages

- [Apollo Types](/en/reference/apollo-types) — TypeScript-side field-by-field cross-reference
- [Enum Mappings](/en/reference/enum-mappings) — Enum numeric / string / label mappings
- [Architecture overview](/en/architecture/overview)
- [Worker protocol](/en/architecture/worker-protocol)
- [Export engine](/en/architecture/export-engine)
