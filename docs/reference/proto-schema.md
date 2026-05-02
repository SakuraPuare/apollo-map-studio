# Apollo Proto Schema Reference

This page is the single-glance reference for every protobuf message that
ships in `src/proto/`. Apollo Map Studio bundles these `.proto` files into
the Vite build through `src/io/proto/loader.ts` and decodes them with the
codec in `src/io/proto/codec.ts`. The TypeScript shapes that mirror these
messages live in [`src/types/apollo.ts`](/api/types/apollo) and are
documented separately in [Apollo Types](/reference/apollo-types).

> All proto definitions use **proto2 semantics**. Optional fields are
> genuinely absent on the wire when not set — the bridge in
> [`src/io/proto/entityBridge`](/api/proto-schema) preserves that
> absence rather than synthesising default values.

## Layout

```
src/proto/
├── basic_msgs/
│   └── geometry.proto         # PointENU, PointLLH, Polygon, Quaternion
├── editor/
│   └── editor_meta.proto      # EditorMeta — editor-only round-trip metadata
└── map_msgs/
    ├── map.proto              # Top-level Map + Header + Projection
    ├── map_id.proto           # Id wrapper
    ├── map_geometry.proto     # Polygon, LineSegment, CurveSegment, Curve
    ├── map_lane.proto         # Lane + LaneBoundary + samples
    ├── map_road.proto         # Road + RoadSection + boundaries
    ├── map_junction.proto     # Junction
    ├── map_pnc_junction.proto # PNCJunction + Passage
    ├── map_crosswalk.proto    # Crosswalk
    ├── map_signal.proto       # Signal + Subsignal + SignInfo
    ├── map_stop_sign.proto    # StopSign
    ├── map_yield_sign.proto   # YieldSign
    ├── map_speed_bump.proto   # SpeedBump
    ├── map_clear_area.proto   # ClearArea
    ├── map_parking_space.proto# ParkingSpace + ParkingLot
    ├── map_rsu.proto          # RSU
    ├── map_overlap.proto      # Overlap + ObjectOverlapInfo + region info
    ├── map_barrier_gate.proto # BarrierGate
    ├── map_area.proto         # Area (driveable / undriveable)
    └── map_speed_control.proto# SpeedControl auxiliary file
```

Field numbers are stable; do not renumber. The editor preserves unknown
fields verbatim by way of proto2 default behaviour, so new Apollo fields
introduced upstream survive a round-trip even before this schema is
updated.

---

## Top-level container

### `Map` (`map_msgs/map.proto`)

| Field           | Number | Type           | Cardinality | Notes                                                        |
| --------------- | ------ | -------------- | ----------- | ------------------------------------------------------------ |
| `header`        | 1      | `Header`       | optional    | Map projection + bbox + provenance                           |
| `crosswalk`     | 2      | `Crosswalk`    | repeated    |                                                              |
| `junction`      | 3      | `Junction`     | repeated    |                                                              |
| `lane`          | 4      | `Lane`         | repeated    |                                                              |
| `stop_sign`     | 5      | `StopSign`     | repeated    |                                                              |
| `signal`        | 6      | `Signal`       | repeated    |                                                              |
| `yield`         | 7      | `YieldSign`    | repeated    | Field name is `yield`, **not** `yield_sign`                  |
| `overlap`       | 8      | `Overlap`      | repeated    |                                                              |
| `clear_area`    | 9      | `ClearArea`    | repeated    |                                                              |
| `speed_bump`    | 10     | `SpeedBump`    | repeated    |                                                              |
| `road`          | 11     | `Road`         | repeated    |                                                              |
| `parking_space` | 12     | `ParkingSpace` | repeated    |                                                              |
| `pnc_junction`  | 13     | `PNCJunction`  | repeated    |                                                              |
| `rsu`           | 14     | `RSU`          | repeated    |                                                              |
| `ad_area`       | 15     | `Area`         | repeated    | Field name is `ad_area`, surfaces as `area` in the editor    |
| `barrier_gate`  | 16     | `BarrierGate`  | repeated    |                                                              |
| `editor_meta`   | 1000   | `EditorMeta`   | optional    | Apollo Map Studio editor metadata; ignored by Apollo runtime |

`entitiesToApolloMap(baseMap, entities)` shallow-clones the import draft
then overwrites the entity arrays — fields not in the table above (e.g.
`header`) are passed through untouched.

### `Header`

| Field        | Number | Type         | Notes                                           |
| ------------ | ------ | ------------ | ----------------------------------------------- |
| `version`    | 1      | `bytes`      | Free-form version string                        |
| `date`       | 2      | `bytes`      | Producer date stamp                             |
| `projection` | 3      | `Projection` | PROJ.4 string under `projection.proj`           |
| `district`   | 4      | `bytes`      | Administrative district label                   |
| `generation` | 5      | `bytes`      |                                                 |
| `rev_major`  | 6      | `bytes`      | Major revision                                  |
| `rev_minor`  | 7      | `bytes`      | Minor revision                                  |
| `left`       | 8      | `double`     | Bounding-box left edge in projected coordinates |
| `top`        | 9      | `double`     | Bounding-box top edge                           |
| `right`      | 10     | `double`     | Bounding-box right edge                         |
| `bottom`     | 11     | `double`     | Bounding-box bottom edge                        |
| `vendor`     | 12     | `bytes`      | Producer vendor                                 |

> Apollo encodes header strings as `bytes`. The codec promotes them to
> JS `string` on import and re-encodes as UTF-8 on export.

### `Projection`

```proto
message Projection {
  // PROJ.4 setting:
  // "+proj=tmerc +lat_0={origin.lat} +lon_0={origin.lon} +k={scale_factor}
  // +ellps=WGS84 +no_defs"
  optional string proj = 1;
}
```

`src/core/geo/projection.ts` loads `header.projection.proj` into a `proj4`
instance to map from WGS84 to UTM and back.

---

## Basic geometry (`basic_msgs/geometry.proto`)

| Message      | Fields                                               | Notes                                                             |
| ------------ | ---------------------------------------------------- | ----------------------------------------------------------------- |
| `PointENU`   | `x: double`, `y: double`, `z: double = 0.0`          | All optional; default `nan` for x/y. Map editor uses x=lon, y=lat |
| `PointLLH`   | `lon: double`, `lat: double`, `height: double = 0.0` | Geographic alternative; not currently emitted by the editor       |
| `Point2D`    | `x`, `y`                                             | General-purpose                                                   |
| `Point3D`    | `x`, `y`, `z`                                        | Used by `Polygon.point`                                           |
| `Quaternion` | `qx`, `qy`, `qz`, `qw`                               | Spatial rotation; `qw` derivable                                  |
| `Polygon`    | `repeated Point3D point`                             | Counter-clockwise winding                                         |

> The map-side `Polygon` in `map_geometry.proto` uses `PointENU` instead
> of `Point3D`. They are different messages despite sharing a name.

---

## Map geometry (`map_msgs/map_geometry.proto`)

### `Polygon`

```proto
message Polygon {
  repeated apollo.common.PointENU point = 1;
}
```

Counter-clockwise winding by Apollo convention; the editor does not
re-wind on import, but lane boundary auto-derivation uses the source
ordering.

### `LineSegment`

```proto
message LineSegment {
  repeated apollo.common.PointENU point = 1;
}
```

### `CurveSegment`

```proto
message CurveSegment {
  oneof curve_type {
    LineSegment line_segment = 1;
  }
  optional double s = 6;                          // start position (s-coordinate)
  optional apollo.common.PointENU start_position = 7;
  optional double heading = 8;                    // start orientation (radians)
  optional double length = 9;
}
```

| Field                     | Number | Type          | Notes                                                                |
| ------------------------- | ------ | ------------- | -------------------------------------------------------------------- |
| `curve_type.line_segment` | 1      | `LineSegment` | Currently the only `oneof` branch                                    |
| `s`                       | 6      | `double`      | Optional. Real maps omit it on `stop_line` / `road.section.boundary` |
| `start_position`          | 7      | `PointENU`    | Optional. Bridge must not synthesise `{0,0}` when source omitted     |
| `heading`                 | 8      | `double`      | Optional, radians                                                    |
| `length`                  | 9      | `double`      | Optional. Bridge must not synthesise `0`                             |

### `Curve`

```proto
message Curve {
  repeated CurveSegment segment = 1;
}
```

---

## Identifier (`map_msgs/map_id.proto`)

```proto
message Id {
  optional string id = 1;
}
```

Every entity reference in the schema is wrapped in `Id`. The bridge
unwraps them through `unwrapId()` / `wrapId()` so `LaneEntity` exposes
flat `string[]` arrays for `predecessor_id`, `successor_id`, etc.

---

## Lane family (`map_msgs/map_lane.proto`)

### `Lane`

| Field                            | Number | Type                    | Cardinality | Notes                                                    |
| -------------------------------- | ------ | ----------------------- | ----------- | -------------------------------------------------------- |
| `id`                             | 1      | `Id`                    | optional    | Required in practice; bridge drops lanes with missing id |
| `central_curve`                  | 2      | `Curve`                 | optional    | Reference trajectory; not necessarily geometric centre   |
| `left_boundary`                  | 3      | `LaneBoundary`          | optional    |                                                          |
| `right_boundary`                 | 4      | `LaneBoundary`          | optional    |                                                          |
| `length`                         | 5      | `double`                | optional    | Meters; absent if source absent                          |
| `speed_limit`                    | 6      | `double`                | optional    | m/s                                                      |
| `overlap_id`                     | 7      | `Id`                    | repeated    |                                                          |
| `predecessor_id`                 | 8      | `Id`                    | repeated    | Upstream lanes                                           |
| `successor_id`                   | 9      | `Id`                    | repeated    | Downstream lanes                                         |
| `left_neighbor_forward_lane_id`  | 10     | `Id`                    | repeated    | Same direction                                           |
| `right_neighbor_forward_lane_id` | 11     | `Id`                    | repeated    | Same direction                                           |
| `type`                           | 12     | `LaneType`              | optional    | See [enum mappings](/reference/enum-mappings)            |
| `turn`                           | 13     | `LaneTurn`              | optional    |                                                          |
| `left_neighbor_reverse_lane_id`  | 14     | `Id`                    | repeated    | Opposite direction                                       |
| `right_neighbor_reverse_lane_id` | 15     | `Id`                    | repeated    | Opposite direction                                       |
| `junction_id`                    | 16     | `Id`                    | optional    | `null` in entity if not in any junction                  |
| `left_sample`                    | 17     | `LaneSampleAssociation` | repeated    | Width samples to left boundary                           |
| `right_sample`                   | 18     | `LaneSampleAssociation` | repeated    | Width samples to right boundary                          |
| `direction`                      | 19     | `LaneDirection`         | optional    |                                                          |
| `left_road_sample`               | 20     | `LaneSampleAssociation` | repeated    | Width samples to left road edge                          |
| `right_road_sample`              | 21     | `LaneSampleAssociation` | repeated    | Width samples to right road edge                         |
| `self_reverse_lane_id`           | 22     | `Id`                    | repeated    | Lane occupying same physical strip in opposite direction |

### `LaneBoundary`

| Field           | Number | Type               | Cardinality | Notes                                              |
| --------------- | ------ | ------------------ | ----------- | -------------------------------------------------- |
| `curve`         | 1      | `Curve`            | optional    |                                                    |
| `length`        | 2      | `double`           | optional    | Bridge preserves absence                           |
| `virtual`       | 3      | `bool`             | optional    | True when boundary is logical only (e.g. junction) |
| `boundary_type` | 4      | `LaneBoundaryType` | repeated    | Sorted ascending on `s`                            |

### `LaneBoundaryType`

```proto
message LaneBoundaryType {
  enum Type {
    UNKNOWN = 0;
    DOTTED_YELLOW = 1;
    DOTTED_WHITE = 2;
    SOLID_YELLOW = 3;
    SOLID_WHITE = 4;
    DOUBLE_YELLOW = 5;
    CURB = 6;
  };
  optional double s = 1;
  repeated Type types = 2;
}
```

A boundary can carry multiple types over disjoint `s` intervals. The
inspector's `leftBoundaryType` / `rightBoundaryType` adapter only edits
the head element (`boundary_type[0].types[0]`); the rest is preserved
verbatim on round-trip.

### `LaneSampleAssociation`

```proto
message LaneSampleAssociation {
  optional double s = 1;
  optional double width = 2;
}
```

The inspector's `leftWidth` / `rightWidth` field re-applies a uniform
width across all samples while keeping their original `s` values. See
`applySampleWidth` in [`inspectorSchema`](/api/types/inspector-schema).

---

## Road family (`map_msgs/map_road.proto`)

### `Road`

| Field         | Number | Type          | Cardinality | Notes                                        |
| ------------- | ------ | ------------- | ----------- | -------------------------------------------- |
| `id`          | 1      | `Id`          | optional    |                                              |
| `section`     | 2      | `RoadSection` | repeated    | At least one required for a usable road      |
| `junction_id` | 3      | `Id`          | optional    | `null` in entity if road not in any junction |
| `type`        | 4      | `Type`        | optional    | `UNKNOWN_ROAD`/`HIGHWAY`/`CITY_ROAD`/`PARK`  |

### `RoadSection`

| Field      | Number | Type           | Cardinality | Notes                           |
| ---------- | ------ | -------------- | ----------- | ------------------------------- |
| `id`       | 1      | `Id`           | optional    |                                 |
| `lane_id`  | 2      | `Id`           | repeated    | Lanes contained in this section |
| `boundary` | 3      | `RoadBoundary` | optional    | Section cross-section boundary  |

### `RoadBoundary`

| Field           | Number | Type              | Cardinality | Notes                   |
| --------------- | ------ | ----------------- | ----------- | ----------------------- |
| `outer_polygon` | 1      | `BoundaryPolygon` | optional    | Outer ring              |
| `hole`          | 2      | `BoundaryPolygon` | repeated    | Optional interior holes |

### `BoundaryPolygon` / `BoundaryEdge`

```proto
message BoundaryPolygon {
  repeated BoundaryEdge edge = 1;
}

message BoundaryEdge {
  optional Curve curve = 1;
  enum Type {
    UNKNOWN = 0;
    NORMAL = 1;
    LEFT_BOUNDARY = 2;
    RIGHT_BOUNDARY = 3;
  };
  optional Type type = 2;
}
```

`RoadROIBoundary` (in the same proto file) is unused by the editor and
ignored by the bridge.

---

## Junction (`map_msgs/map_junction.proto`)

```proto
message Junction {
  optional Id id = 1;
  optional Polygon polygon = 2;
  repeated Id overlap_id = 3;
  enum Type {
    UNKNOWN = 0;
    IN_ROAD = 1;
    CROSS_ROAD = 2;
    FORK_ROAD = 3;
    MAIN_SIDE = 4;
    DEAD_END = 5;
  };
  optional Type type = 4;
}
```

### `PNCJunction` (`map_msgs/map_pnc_junction.proto`)

A planning-and-control junction wraps `Junction` semantics with a list of
`PassageGroup`s that describe ingress/egress lane sets.

```proto
message Passage {
  optional Id id = 1;
  repeated Id signal_id = 2;
  repeated Id yield_id = 3;
  repeated Id stop_sign_id = 4;
  repeated Id lane_id = 5;
  enum Type { UNKNOWN = 0; ENTRANCE = 1; EXIT = 2; };
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

---

## Crosswalk (`map_msgs/map_crosswalk.proto`)

```proto
message Crosswalk {
  optional Id id = 1;
  optional Polygon polygon = 2;
  repeated Id overlap_id = 3;
}
```

The editor stores the source rectangle (when drawn with the rotated-rect
tool) under `_sourceRect` so subsequent rotation edits round-trip.

---

## Signal (`map_msgs/map_signal.proto`)

### `Signal`

| Field        | Number | Type        | Cardinality | Notes                                            |
| ------------ | ------ | ----------- | ----------- | ------------------------------------------------ |
| `id`         | 1      | `Id`        | optional    |                                                  |
| `boundary`   | 2      | `Polygon`   | optional    | Outline of the signal head                       |
| `subsignal`  | 3      | `Subsignal` | repeated    | Per-bulb data                                    |
| `overlap_id` | 4      | `Id`        | repeated    |                                                  |
| `type`       | 5      | `Type`      | optional    | See enum below                                   |
| `stop_line`  | 6      | `Curve`     | repeated    | Stop lines associated with this signal           |
| `sign_info`  | 7      | `SignInfo`  | repeated    | Posted-sign metadata (e.g. no right turn on red) |

```proto
enum Type {
  UNKNOWN = 1;
  MIX_2_HORIZONTAL = 2;
  MIX_2_VERTICAL = 3;
  MIX_3_HORIZONTAL = 4;
  MIX_3_VERTICAL = 5;
  SINGLE = 6;
}
```

> Apollo numbers `Signal.Type` starting at 1, not 0. The bridge rewrites
> any out-of-range int into the string union with `UNKNOWN_SIGNAL` as
> the fallback so the inspector never displays a numeric value.

### `Subsignal`

```proto
message Subsignal {
  enum Type {
    UNKNOWN = 1;
    CIRCLE = 2;
    ARROW_LEFT = 3;
    ARROW_FORWARD = 4;
    ARROW_RIGHT = 5;
    ARROW_LEFT_AND_FORWARD = 6;
    ARROW_RIGHT_AND_FORWARD = 7;
    ARROW_U_TURN = 8;
  };
  optional Id id = 1;
  optional Type type = 2;
  optional apollo.common.PointENU location = 3;  // "now no data support"
}
```

`location` is rarely populated in the wild. The bridge preserves absence
to avoid emitting `{0, 0}` on re-encode.

### `SignInfo`

```proto
message SignInfo {
  enum Type {
    None = 0;
    NO_RIGHT_TURN_ON_RED = 1;
  };
  optional Type type = 1;
}
```

---

## Stop sign (`map_msgs/map_stop_sign.proto`)

```proto
message StopSign {
  optional Id id = 1;
  repeated Curve stop_line = 2;
  repeated Id overlap_id = 3;
  enum StopType {
    UNKNOWN = 0;
    ONE_WAY = 1;
    TWO_WAY = 2;
    THREE_WAY = 3;
    FOUR_WAY = 4;
    ALL_WAY = 5;
  };
  optional StopType type = 4;
}
```

The editor surfaces `UNKNOWN_STOP_SIGN` as the fallback string for
`type=UNKNOWN`, separating it from the lane / signal `UNKNOWN`.

---

## Yield sign (`map_msgs/map_yield_sign.proto`)

```proto
message YieldSign {
  optional Id id = 1;
  repeated Curve stop_line = 2;
  repeated Id overlap_id = 3;
}
```

No type enum — yield signs are uniform in the schema.

---

## Speed bump (`map_msgs/map_speed_bump.proto`)

```proto
message SpeedBump {
  optional Id id = 1;
  repeated Id overlap_id = 2;
  repeated Curve position = 3;
}
```

`position` carries one or more `Curve`s describing the bump line(s).

---

## Clear area (`map_msgs/map_clear_area.proto`)

```proto
message ClearArea {
  optional Id id = 1;
  repeated Id overlap_id = 2;
  optional Polygon polygon = 3;
}
```

---

## RSU (`map_msgs/map_rsu.proto`)

```proto
message RSU {
  optional Id id = 1;
  optional Id junction_id = 2;
  repeated Id overlap_id = 3;
}
```

Roadside unit. No geometry — placement is implicit via the associated
junction.

---

## Parking (`map_msgs/map_parking_space.proto`)

### `ParkingSpace`

```proto
message ParkingSpace {
  optional Id id = 1;
  optional Polygon polygon = 2;
  repeated Id overlap_id = 3;
  optional double heading = 4;
}
```

`heading` is in radians. The editor's `_sourceRect` tracks the original
rotated rectangle for non-destructive edits.

### `ParkingLot`

```proto
message ParkingLot {
  optional Id id = 1;
  optional Polygon polygon = 2;
  repeated Id overlap_id = 3;
}
```

Apollo carries `ParkingLot` in the same proto file; it is rarely used
and the editor exposes it only via the entity union.

---

## Barrier gate (`map_msgs/map_barrier_gate.proto`)

```proto
message BarrierGate {
  enum BarrierGateType {
    ROD = 1;
    FENCE = 2;
    ADVERTISING = 3;
    TELESCOPIC = 4;
    OTHER = 5;
  };
  required Id id = 1;
  optional BarrierGateType type = 2;
  optional Polygon polygon = 3;
  repeated Curve stop_line = 4;
  repeated Id overlap_id = 5;
}
```

Note `id` is `required` here, in contrast with most other entity
messages where it is optional in the schema but required in practice.

---

## Area (`map_msgs/map_area.proto`)

```proto
message Area {
  enum Type {
    Driveable = 1;
    UnDriveable = 2;
    Custom1 = 3;
    Custom2 = 4;
    Custom3 = 5;
  };
  required Id id = 1;
  optional Type type = 2;
  required Polygon polygon = 3;
  repeated Id overlap_id = 4;
  optional string name = 5;
}
```

`Custom1`–`Custom3` are deployment-defined slots reserved for vendor
extensions.

---

## Speed control (`map_msgs/map_speed_control.proto`)

`SpeedControl` is an auxiliary file format that lets operators correct
speed limits on existing maps without re-publishing the base map.

```proto
message SpeedControl {
  optional string name = 1;
  optional apollo.hdmap.Polygon polygon = 2;
  optional double speed_limit = 3;       // m/s
}

message SpeedControls {
  repeated SpeedControl speed_control = 1;
}
```

The editor exposes a `SpeedControlEntity` for completeness but does not
emit it inside the main `Map` proto.

---

## Overlap (`map_msgs/map_overlap.proto`)

`Overlap` is the join table that records every pair of objects whose
geometry intersects on the map plane. It is the source of truth for
"this lane crosses that crosswalk", "this signal governs this lane",
etc. Every other entity carries a list of overlap ids that point back
into this table.

### `Overlap`

```proto
message Overlap {
  optional Id id = 1;
  repeated ObjectOverlapInfo object = 2;
  repeated RegionOverlapInfo region_overlap = 3;
}
```

### `ObjectOverlapInfo`

```proto
message ObjectOverlapInfo {
  optional Id id = 1;
  oneof overlap_info {
    LaneOverlapInfo        lane_overlap_info        = 3;
    SignalOverlapInfo      signal_overlap_info      = 4;
    StopSignOverlapInfo    stop_sign_overlap_info   = 5;
    CrosswalkOverlapInfo   crosswalk_overlap_info   = 6;
    JunctionOverlapInfo    junction_overlap_info    = 7;
    YieldOverlapInfo       yield_sign_overlap_info  = 8;
    ClearAreaOverlapInfo   clear_area_overlap_info  = 9;
    SpeedBumpOverlapInfo   speed_bump_overlap_info  = 10;
    ParkingSpaceOverlapInfo parking_space_overlap_info = 11;
    PNCJunctionOverlapInfo pnc_junction_overlap_info  = 12;
    RSUOverlapInfo         rsu_overlap_info           = 13;
    AreaOverlapInfo        area_overlap_info          = 14;
    BarrierGateOverlapInfo barrier_gate_overlap_info  = 15;
  }
}
```

| Object type    | Field tag | Carries data                                              |
| -------------- | --------- | --------------------------------------------------------- |
| `lane`         | 3         | `LaneOverlapInfo` (start_s, end_s, is_merge, region link) |
| `signal`       | 4         | empty marker                                              |
| `stopSign`     | 5         | empty marker                                              |
| `crosswalk`    | 6         | `region_overlap_id`                                       |
| `junction`     | 7         | empty marker                                              |
| `yieldSign`    | 8         | empty marker                                              |
| `clearArea`    | 9         | empty marker                                              |
| `speedBump`    | 10        | empty marker                                              |
| `parkingSpace` | 11        | empty marker                                              |
| `pncJunction`  | 12        | empty marker                                              |
| `rsu`          | 13        | empty marker                                              |
| `area`         | 14        | empty marker                                              |
| `barrierGate`  | 15        | empty marker                                              |
| `unknown`      | —         | Editor-only pass-through when source `oneof` is unset     |

The bridge's `unknown` entry covers proto2-legal cases where Apollo
maps in the wild omit the `oneof` for some lane↔crosswalk pairs. Without
it the round-trip would silently drop those entries. See
[`OverlapEntity`](/api/types/apollo) for the entity-side shape.

### `LaneOverlapInfo`

```proto
message LaneOverlapInfo {
  optional double start_s = 1;
  optional double end_s = 2;
  optional bool is_merge = 3;
  optional Id region_overlap_id = 4;
}
```

`start_s` and `end_s` are optional; the bridge preserves absence.

### `RegionOverlapInfo`

```proto
message RegionOverlapInfo {
  optional Id id = 1;
  repeated Polygon polygon = 2;
}
```

### Empty info messages

`SignalOverlapInfo`, `StopSignOverlapInfo`, `JunctionOverlapInfo`,
`YieldOverlapInfo`, `ClearAreaOverlapInfo`, `SpeedBumpOverlapInfo`,
`ParkingSpaceOverlapInfo`, `PNCJunctionOverlapInfo`, `RSUOverlapInfo`,
`AreaOverlapInfo`, and `BarrierGateOverlapInfo` are all empty marker
messages. They exist so the `oneof` can discriminate the object type
without carrying data.

---

## Editor metadata (`editor/editor_meta.proto`)

`EditorMeta` lives inside `Map.editor_meta` (field number `1000`) and
captures editor-only state that should round-trip through Apollo `.bin`
artefacts. Apollo runtime tooling treats unknown fields as opaque per
proto2 semantics and preserves them — meaning the same `.bin` works in
both the editor and Apollo without a sidecar file.

```proto
message EditorMeta {
  optional uint32 version = 1;
  map<string, EntityMeta> entity = 2;
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

| Field           | Number | Type                      | Notes                                                      |
| --------------- | ------ | ------------------------- | ---------------------------------------------------------- |
| `version`       | 1      | `uint32`                  | Schema revision; readers accept any version `<=` their own |
| `entity`        | 2      | `map<string, EntityMeta>` | Keyed by `<entityType>:<id>` (e.g. `lane:lane_1`)          |
| `geometry_kind` | 1      | `GeometryKind`            | Override for forced linestring vs polygon rendering        |

Schema rules from the proto comment:

- **Additive only.** Removed fields must be marked `reserved`.
- **Stable field numbers** across editor versions.
- Editor-only — production Apollo code must not depend on this message.

The editor's accessor functions (`readEditorMeta`, `writeEditorMeta`,
`entityKey`) live in `src/io/proto/entityBridge/editorMeta.ts`.
`EDITOR_META_VERSION = 1` at time of writing.

---

## Cross-references

- Entity-side TypeScript types: [Apollo Types](/reference/apollo-types)
- Enum int↔name↔label mappings: [Enum Mappings](/reference/enum-mappings)
- Bridge implementation: [`io/proto/entityBridge`](/api/proto-schema)
- Anti-corruption boundary policy: [Architecture](/architecture/overview)
