---
title: Proto / Schema
description: src/proto/**/*.proto — Apollo HD-map proto2 schema index and entityBridge surface map
---

# Proto / Schema

Apollo HD-map `.proto` sources live under `src/proto/` in Apollo's
upstream layout:

```
src/proto/
├── basic_msgs/geometry.proto                # PointENU / Polygon / Curve / LineSegment
├── editor/editor_meta.proto                 # editor-only metadata (Map.editor_meta = 1000)
└── map_msgs/
    ├── map.proto                            # top-level apollo.hdmap.Map
    ├── map_id.proto                         # Id wrapper
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

`map.proto` imports the rest and assembles the top-level
`apollo.hdmap.Map`. `loader.ts` injects every file via Vite's `?raw`
glob, so the schema is fully bundled and runtime is offline.

## Top-level fields

`apollo.hdmap.Map` field set (in the same order as
`entityBridge/map.ts`'s `BRIDGES`):

| Proto field     | `entityType`   | Description                         |
| --------------- | -------------- | ----------------------------------- |
| `header`        | —              | version + `projection.proj` + bbox  |
| `crosswalk`     | `crosswalk`    | pedestrian crossing                 |
| `junction`      | `junction`     | road junction                       |
| `lane`          | `lane`         | drivable lane                       |
| `stop_sign`     | `stopSign`     | stop sign                           |
| `signal`        | `signal`       | traffic light                       |
| `yield`         | `yieldSign`    | yield sign                          |
| `overlap`       | `overlap`      | semantic overlap relation           |
| `clear_area`    | `clearArea`    | keep-clear area                     |
| `speed_bump`    | `speedBump`    | speed bump                          |
| `road`          | `road`         | road + sections                     |
| `parking_space` | `parkingSpace` | parking spot                        |
| `pnc_junction`  | `pncJunction`  | planner-and-control junction view   |
| `rsu`           | `rsu`          | roadside unit                       |
| `ad_area`       | `area`         | custom drivable / non-drivable area |
| `barrier_gate`  | `barrierGate`  | barrier gate                        |
| `editor_meta`   | —              | editor-only metadata (field 1000)   |

## Shared submessages

`basic_msgs/geometry.proto` + `map_msgs/map_geometry.proto`:

- `PointENU { double x = 1; double y = 2; double z = 3; }` — Apollo
  defaults to ENU metres; the editor converts to WGS84 lng/lat on
  import.
- `Polygon { repeated PointENU point = 1; }`
- `LineSegment { repeated PointENU point = 1; }`
- `CurveSegment { LineSegment line_segment; double s; PointENU
start_position; double heading; double length; }` — all scalars
  are proto2 optional; many real Apollo maps omit them.
- `Curve { repeated CurveSegment segment = 1; }`

`map_id.proto` defines `Id { string id = 1; }`. The editor unwraps
it everywhere internally.

## entityBridge map

`src/io/proto/entityBridge/` provides the bidirectional bridge
between raw proto plain-objects and `MapEntity`. Sub-modules:

| Sub-module                      | Entities                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `common.ts`                     | `RawId / RawPoint / RawCurve / RawPolygon` + helpers                               |
| `enums.ts`                      | numeric ↔ string enum maps + INV reverse maps                                      |
| `laneRoad.ts`                   | `LaneEntity`, `RoadEntity` + sections                                              |
| `overlap.ts`                    | `OverlapEntity` + ObjectOverlapInfo / RegionOverlapInfo                            |
| `simpleEntities/basic.ts`       | crosswalk / junction / clearArea / parkingSpace / stopSign / yieldSign / speedBump |
| `simpleEntities/misc.ts`        | barrierGate / rsu / area                                                           |
| `simpleEntities/pncJunction.ts` | pncJunction + passages                                                             |
| `simpleEntities/signal.ts`      | signal + subsignal + signInfo                                                      |
| `map.ts`                        | `apolloMapToEntities` / `entitiesToApolloMap` (entry)                              |

Each entity sub-module exposes a symmetric pair of helpers:
`raw<Entity>ToEntity(raw): <Entity>Entity | null` and
`entityToRaw<Entity>(entity): Raw<Entity>`. See
[io/proto-entity-bridge](/en/api/io/proto-entity-bridge) for the
detailed surface.

## `editor_meta.proto`

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

The Apollo runtime does not parse this field but proto2's "preserve
unknown fields" semantics keep it on round-trip, so the same `.bin`
serves both production Apollo and Apollo Map Studio.

## See also

- [Proto / Loader](/en/api/proto-loader) — how these files become a
  `protobuf.Root` at runtime.
- [Proto / Codec](/en/api/proto-codec) — bytes / text → decoded plain
  object.
- [io/proto-entity-bridge](/en/api/io/proto-entity-bridge) — plain
  object → typed `MapEntity[]` and back.
