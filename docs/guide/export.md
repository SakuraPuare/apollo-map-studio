# Export

Click the **Export** button in the top-right toolbar to open the Export dialog. The dialog generates all three Apollo binary files and triggers browser downloads.

## Output files

| File              | Purpose                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `base_map.bin`    | Full HD map. Loaded by all Apollo modules at startup.                  |
| `sim_map.bin`     | Downsampled version. Used exclusively by Dreamview for visualization.  |
| `routing_map.bin` | Topological routing graph. Used by the `routing` module to plan paths. |

All three files are Protocol Buffer binary format, encoded against the official Apollo `.proto` definitions.

## Export pipeline

```
Editor state (GeoJSON, WGS84)
        │
        ▼ proj4: lngLatToENU()
PointENU coordinates (meters from origin)
        │
        ├──→ buildBaseMap()  ──→ protobufjs.encode() ──→ base_map.bin
        │         │
        │         └──→ buildSimMap()  ──→ protobufjs.encode() ──→ sim_map.bin
        │
        └──→ buildRoutingMap() ──→ protobufjs.encode() ──→ routing_map.bin
```

## base_map.bin

`buildBaseMap.ts` assembles the complete `apollo.hdmap.Map` protobuf object:

### Lane construction

For each `LaneFeature`:

1. **Coordinate conversion** — every centerline GeoJSON coordinate is projected from WGS84 to ENU using `lngLatToENU()`
2. **Boundary computation** — left and right boundary curves are derived using `turf.lineOffset(centerLine, ±width/2)`
3. **Length** — `turf.length(centerLine, { units: 'meters' })`
4. **Heading** — start heading computed via `computeStartHeading()` using the first two centerline points
5. **Width samples** — `LaneSampleAssociation[]` sampled every 1 m with `turf.along()`, each sample stores the offset distance from centerline to boundary
6. **Overlap IDs** — populated after overlap computation (see below)

### Overlap computation

`computeAllOverlaps()` detects spatial intersections between lanes and every other element type:

| Lane vs          | Method                                                       | Overlap type           |
| ---------------- | ------------------------------------------------------------ | ---------------------- |
| Crosswalk        | `turf.lineIntersect(centerLine, polygonBoundary)` → s-range  | `CrosswalkOverlapInfo` |
| Signal stop line | `turf.lineIntersect(centerLine, stopLine)` → s-point ± 0.5 m | `SignalOverlapInfo`    |
| Stop sign        | same as signal                                               | `StopSignOverlapInfo`  |
| Junction         | midpoint `turf.booleanPointInPolygon` → full lane s-range    | `JunctionOverlapInfo`  |
| Clear area       | same as crosswalk                                            | `ClearAreaOverlapInfo` |
| Speed bump       | same as signal                                               | `SpeedBumpOverlapInfo` |

Each detected intersection produces one `apollo.hdmap.Overlap` object. The overlap's `object` array contains two entries: one for the lane (with `LaneOverlapInfo.start_s` / `end_s`) and one for the other element.

### Road grouping

Lanes that share the same `roadId` property are grouped into one `ApolloRoad` with a single `RoadSection`. Lanes without a `roadId` each get their own road. Each road section lists the lane IDs it contains.

## sim_map.bin

`buildSimMap.ts` takes the `base_map` proto object, deep-copies it, and applies two downsampling passes — a direct port of Apollo's `modules/map/tools/sim_map_generator.cc`:

### Pass 1 — Downsample by angle

```
threshold = π / 180  (1 degree)

For each consecutive triplet (p_prev, p_curr, p_next):
  heading_change = |heading(p_prev→p_curr) - heading(p_curr→p_next)|
  if heading_change < threshold → discard p_curr
```

Removes nearly-collinear points that contribute no meaningful direction change.

### Pass 2 — Downsample by distance

```
normal_interval  = 5 m
steep_interval   = 1 m   (used when heading_change > π/4)

Keep a point every normal_interval meters.
On steep curves (heading change > 45°) use steep_interval instead.
```

### Width sample removal

`sim_map` strips `left_sample`, `right_sample`, `left_road_sample`, `right_road_sample` from all lanes. Dreamview does not need per-meter width data.

## routing_map.bin

`buildRoutingMap.ts` is a port of Apollo's `modules/routing/topo_creator/`. It builds an `apollo.routing.Graph` with one `TopoNode` per lane and directed `TopoEdge` objects for each traversable transition.

### Node cost

```
base_speed = 4.167 m/s   (15 km/h, from routing_config.pb.txt)

turn_penalty:
  NO_TURN     → 0
  LEFT_TURN   → 50
  RIGHT_TURN  → 20
  U_TURN      → 100

node_cost = lane_length × √(base_speed / speed_limit) + turn_penalty
```

A lane with a speed limit lower than `base_speed` costs more per meter (driving slowly). Turn penalties are added once per lane, not per meter.

### Edge types and costs

| Edge type | Condition                                            | Cost                                |
| --------- | ---------------------------------------------------- | ----------------------------------- |
| `FORWARD` | `lane.successorIds` not empty                        | 0                                   |
| `LEFT`    | left neighbor exists AND shared boundary is dottted  | `500 × (changing_length / 50)^−1.5` |
| `RIGHT`   | right neighbor exists AND shared boundary is dottted | `500 × (changing_length / 50)^−1.5` |

`changing_length` defaults to `base_changing_length = 50 m` from routing config. Lane changes are **not** added when the shared boundary is `SOLID_WHITE`, `SOLID_YELLOW`, `DOUBLE_YELLOW`, or `CURB`.

### Virtual nodes

A `TopoNode` has `is_virtual = true` when:

- The lane is inside a junction (`junctionId` is set), **AND**
- The lane has no left or right forward neighbors

Virtual nodes represent connecting lanes inside intersections. The routing module skips them in path-cost accounting.

## Validation before export

The Export dialog runs lightweight checks and shows warnings for:

- Lanes with no successors **and** no predecessors (isolated)
- Lanes with `speedLimit = 0`
- Junctions with fewer than 3 polygon points
