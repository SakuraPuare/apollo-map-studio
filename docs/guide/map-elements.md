# Map elements

Apollo Map Studio supports the full Apollo HD-map element set. This page
enumerates every element type, what it represents, and how to author it.

## Source map

| Concern                    | File                                        |
| -------------------------- | ------------------------------------------- |
| Element catalogue          | `MAP_ELEMENTS` in `src/core/elements.ts:49` |
| Apollo proto entity types  | `src/types/apollo.ts`                       |
| Editable entity union      | `src/types/entities.ts`                     |
| Validation schemas         | `src/lib/schemas.ts`                        |
| Entity-ops adapter         | `src/lib/entityOps.ts`                      |
| Per-element creation logic | `src/lib/entityOps/create*.ts`              |

## Element catalogue

Every element has a default tool and a list of allowed tools. Picking the
element in the [ToolStrip](/guide/menubar-and-toolstrip) arms the default
tool; you can switch among allowed tools without losing the element binding.

| Element       | Apollo proto                | Geometry | Default tool    | Allowed tools                |
| ------------- | --------------------------- | -------- | --------------- | ---------------------------- |
| Lane          | `apollo.hdmap.Lane`         | line     | drawBezier      | drawBezier, drawArc          |
| Junction      | `apollo.hdmap.Junction`     | polygon  | drawPolygon     | drawPolygon                  |
| PNC Junction  | `apollo.hdmap.PNCJunction`  | polygon  | drawPolygon     | drawPolygon                  |
| Parking Space | `apollo.hdmap.ParkingSpace` | polygon  | drawRotatedRect | drawRotatedRect, drawPolygon |
| Crosswalk     | `apollo.hdmap.Crosswalk`    | polygon  | drawRotatedRect | drawRotatedRect, drawPolygon |
| Signal        | `apollo.hdmap.Signal`       | line     | drawBezier      | drawBezier                   |
| Stop Sign     | `apollo.hdmap.StopSign`     | line     | drawBezier      | drawBezier                   |
| Speed Bump    | `apollo.hdmap.SpeedBump`    | line     | drawBezier      | drawBezier                   |
| Yield Sign    | `apollo.hdmap.YieldSign`    | line     | drawBezier      | drawBezier                   |
| Clear Area    | `apollo.hdmap.ClearArea`    | polygon  | drawRotatedRect | drawRotatedRect, drawPolygon |
| Barrier Gate  | `apollo.hdmap.BarrierGate`  | line     | drawBezier      | drawBezier                   |
| Area          | `apollo.hdmap.Area`         | polygon  | drawPolygon     | drawPolygon                  |

Two more entities exist in the data model but are **not** drawable from the
ToolStrip — they're created via the layer-tree headers or as derived
references:

| Entity       | How to create                                              |
| ------------ | ---------------------------------------------------------- |
| Road         | Layer tree → `+ Road` button. Empty road with one section. |
| RSU          | Layer tree → `+ RSU` button. Then drag to a Junction.      |
| ParkingLot   | Round-trip `.txt` proto only.                              |
| SpeedControl | Round-trip `.txt` proto only.                              |
| Overlap      | Auto-derived during export.                                |

## Lane

The most-authored element. Represents a single drivable lane with a
centerline, left/right boundaries, and topology.

**Apollo proto fields:** `id`, `central_curve`, `left_boundary`,
`right_boundary`, `length`, `speed_limit`, `predecessor_id[]`,
`successor_id[]`, `left_neighbor_forward_lane_id[]`,
`right_neighbor_forward_lane_id[]`, `left_neighbor_reverse_lane_id[]`,
`right_neighbor_reverse_lane_id[]`, `type`, `turn`, `direction`,
`left_sample[]`, `right_sample[]`, `self_reverse_lane_id[]`,
`left_road_sample[]`, `right_road_sample[]`, `junction_id`, `overlap_id[]`.

**Drawing flow:** see [Drawing lanes](/guide/drawing-lanes) for the
end-to-end procedure.

::: tip Lane is line, not polygon
The Lane element draws a centerline. The visible "lane" you see on the
canvas is the centerline rendered with widths derived from
`leftSamples` / `rightSamples`. Edit width via the Inspector, not the
canvas.
:::

## Road

A logical container for ordered RoadSections, each holding a list of
lanes. Apollo's planner uses Roads as the macro routing element; lanes
are the micro level.

**Apollo proto fields:** `id`, `section[]` (each with `lane_id[]`,
`boundary`), `junction_id`, `type`.

**Authoring:** Layer tree → `+ Road`. The road appears with one empty
section (`sect_*`). Drag lanes into the section to populate.

::: warning Roads have no geometry of their own
A Road's geometry is the union of its lanes' geometries. The road's
`boundary` (RoadBoundary) is auto-derived from the outermost lanes'
left and right boundaries. Don't try to draw a road outline directly.
:::

## Junction

A polygonal region where multiple lanes converge. Inside a junction,
lanes can change direction freely; outside, lane changes follow the
left/right neighbor rules.

**Apollo proto fields:** `id`, `polygon`, `type`, `overlap_id[]`.
JunctionType: `OPEN`, `INTERSECTION`, `DEAD_END`.

**Drawing flow:**

1. Junction element → Polygon tool.
2. Click the polygon corners (≥ 3 points). Self-intersecting clicks are
   rejected.
3. Double-click to commit.

Then assign lanes by dragging them onto the junction in the
[Layer tree](/guide/layer-tree).

## PNC Junction

A "planning and control" junction — semantically similar to Junction
but with explicit passage groups for Apollo's planner to model multi-stop
intersections.

**Apollo proto fields:** `id`, `polygon`, `passage_group[]`.

**Drawing flow:** identical to Junction. Currently the Inspector shows a
basic form (in `pncJunction.tsx`); passage-group authoring is on the
roadmap.

::: tip Junction vs PNC Junction

- **Junction** is the simple polygon used by older Apollo modules.
- **PNC Junction** carries planner-specific passage data and is used by
  newer Apollo planner modules.
- For greenfield maps, use PNC Junction unless your downstream stack
  explicitly requires plain Junction.
  :::

## Parking Space

A single parking slot. Authored as a rotated rectangle (typical) or
free-form polygon.

**Apollo proto fields:** `id`, `polygon`, `heading`, `overlap_id[]`.

**Drawing flow:**

1. Parking Space element → Rectangle tool (default) or Polygon tool.
2. Three clicks (Rectangle): axis start, axis end, width point.
3. Heading is derived from the rectangle's long-axis direction.

::: tip Heading is computed
You don't author the heading directly. Drawing the rectangle along the
direction the car would back into the slot sets heading correctly. To
flip the heading, redraw with the axis reversed.
:::

## Crosswalk

A pedestrian crossing region.

**Apollo proto fields:** `id`, `polygon`, `overlap_id[]`.

**Drawing flow:** Crosswalk element → Rectangle (default) or Polygon.
For a typical zebra crossing: long axis along the crossing direction.

## Signal

A traffic signal head. Geometry is a line (the signal's stop line) plus
a list of subsignals describing the bulb/face configuration.

**Apollo proto fields:** `id`, `boundary`, `subsignal[]` (each with
`type`, `location`), `overlap_id[]`, `type`, `stop_line[]`.

**Drawing flow:**

1. Signal element → Bezier tool.
2. Draw the stop line as a Bezier (typically two anchors with sharp
   corners — a straight segment).
3. Inspector → set Signal type and SubSignal types (`UNKNOWN`,
   `MIX_2_HORIZONTAL`, `MIX_2_VERTICAL`, `MIX_3_HORIZONTAL`,
   `MIX_3_VERTICAL`, `SINGLE`).

## Stop Sign

A stop-sign location. Like Signal, the geometry is a stop line.

**Apollo proto fields:** `id`, `stop_line[]`, `lane_id[]`, `type` (
`UNKNOWN`, `ONE_WAY`, `TWO_WAY`, `THREE_WAY`, `FOUR_WAY`,
`ALL_WAY`), `overlap_id[]`.

**Drawing flow:** Stop Sign element → Bezier → straight stop line →
double-click. Inspector → set Type.

## Speed Bump

A speed bump or hump. Geometry is a line transverse to the direction of
travel.

**Apollo proto fields:** `id`, `position[]`, `overlap_id[]`.

**Drawing flow:** Speed Bump element → Bezier → line across the lane.

## Yield Sign

A yield (give-way) sign. Same authoring shape as Stop Sign.

**Apollo proto fields:** `id`, `stop_line[]`, `overlap_id[]`.

## Clear Area

A region where vehicles must not stop (e.g. blocking the box). Polygon
geometry.

**Apollo proto fields:** `id`, `polygon`, `overlap_id[]`.

**Drawing flow:** Clear Area element → Rectangle (default) or Polygon.

## Barrier Gate

A barrier gate (e.g. parking lot entrance). Line geometry across the
roadway.

**Apollo proto fields:** `id`, `stop_line[]`, `overlap_id[]`.

**Drawing flow:** Barrier Gate element → Bezier → line across roadway.

## Area

Generic polygon area. Used for non-driveable regions like medians or
plazas. Apollo's planner generally treats Area as a soft hint.

**Apollo proto fields:** `id`, `polygon`, `type` (`UNKNOWN`, `MEDIAN`,
`PLAZA`, …).

**Drawing flow:** Area element → Polygon → click polygon corners →
double-click.

## RSU (Road-Side Unit)

A V2X infrastructure point. No geometry — RSUs are tagged to a Junction.

**Apollo proto fields:** `id`, `junction_id`, `overlap_id[]`.

**Authoring:** Layer tree → `+ RSU`. Drag the new RSU onto a Junction.

## Overlap

The cross-reference graph that ties together every element pair whose
geometries intersect. Apollo's planner reads `overlap_id` arrays on
each element to find the relevant overlaps.

**Apollo proto fields:** `id`, `object[]` (each with the cross-referenced
element id and a list of cross-reference relationships).

**Authoring:** **None.** Overlaps are auto-derived during export by
`apolloIO.worker.ts`. The worker:

1. Walks every pair of overlapping geometries (lanes ∩ junctions, lanes
   ∩ signals, etc.).
2. Generates `OverlapEntity` records.
3. Populates `overlap_id` back-references on each element.

You can view existing overlaps in the inspector (read-only OverlapForm)
and the Outline panel.

::: warning Don't hand-author overlaps
The export-time recomputation will replace any manually-authored
overlaps with the geometric truth. If you need a custom overlap that
isn't geometric, that's a limitation of the export path — file an issue.
:::

## Drawing primitives

Six primitive types you can draw without an Apollo element binding:

| Type         | Tool         | Use                                 |
| ------------ | ------------ | ----------------------------------- |
| `polyline`   | Polyline     | Reference line, not exported        |
| `catmullRom` | CatmullRom   | Smooth reference line, not exported |
| `bezier`     | Bezier       | Reference curve, not exported       |
| `arc`        | Arc          | Reference arc, not exported         |
| `rect`       | Rotated Rect | Reference rectangle, not exported   |
| `polygon`    | Polygon      | Reference polygon, not exported     |

Drawing primitives appear in the layer tree under `Drawings`. They're
not part of the Apollo proto and are dropped during export. Use them
for trace alignment, scratch geometry, or visual reference.

## Element-tool matrix (compact)

|              | Polyline | CatmullRom |  Bezier   | Arc | RotatedRect |  Polygon  |
| ------------ | :------: | :--------: | :-------: | :-: | :---------: | :-------: |
| Lane         |          |            | ✔ default |  ✔  |             |           |
| Junction     |          |            |           |     |             | ✔ default |
| PNC Junction |          |            |           |     |             | ✔ default |
| ParkingSpace |          |            |           |     |  ✔ default  |     ✔     |
| Crosswalk    |          |            |           |     |  ✔ default  |     ✔     |
| Signal       |          |            | ✔ default |     |             |           |
| StopSign     |          |            | ✔ default |     |             |           |
| SpeedBump    |          |            | ✔ default |     |             |           |
| YieldSign    |          |            | ✔ default |     |             |           |
| ClearArea    |          |            |           |     |  ✔ default  |     ✔     |
| BarrierGate  |          |            | ✔ default |     |             |           |
| Area         |          |            |           |     |             | ✔ default |
| _Primitive_  |    ✔     |     ✔      |     ✔     |  ✔  |      ✔      |     ✔     |

## Element color reference

Pulled from `MAP_ELEMENTS[*].color` for cold-layer rendering:

| Element       | Color        | Hex       |
| ------------- | ------------ | --------- |
| Lane          | Blue         | `#4a9eff` |
| Junction      | Yellow       | `#ffcc00` |
| PNC Junction  | Orange       | `#ff9933` |
| Parking Space | Purple       | `#7c5cbf` |
| Crosswalk     | White        | `#ffffff` |
| Signal        | Green        | `#22cc44` |
| Stop Sign     | Red          | `#ff0000` |
| Speed Bump    | Amber        | `#ffaa00` |
| Yield Sign    | Dark orange  | `#ff6600` |
| Clear Area    | Pink-red     | `#ff4466` |
| Barrier Gate  | Light purple | `#aa66ff` |
| Area          | Light blue   | `#66aaff` |

Lane has a separate per-`type` palette in `laneTypeColor()` so
`CITY_DRIVING`, `BIKING`, `SIDEWALK`, `PARKING`, `SHOULDER`, `SHARED`,
`NONE` each render with a distinct hue.

## Where to next

- [Drawing tools](/guide/drawing-tools) — every tool in detail.
- [Drawing lanes](/guide/drawing-lanes) — lane workflow.
- [Topology and junctions](/guide/topology-and-junctions) — connecting
  elements together.
- [Inspector](/guide/inspector) — per-element forms.
