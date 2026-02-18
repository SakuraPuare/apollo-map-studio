# Drawing Lanes

Lanes are the fundamental building block of an Apollo HD map. Every other element (junctions, signals, overlaps, the routing graph) is defined in relation to lanes.

## Draw a lane

1. Click **Draw Lane** in the toolbar (or press `L`)
2. Click on the map to place the first centerline point
3. Continue clicking to add intermediate vertices
4. **Double-click** the last point to finish the lane

The lane's left and right boundary lines appear immediately, offset from the centerline by `width / 2` meters using `turf.lineOffset`.

## Lane anatomy

```
         left boundary
    ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

    ─────────────────────────────   ← center line (drawn / stored)

    ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
         right boundary
```

The centerline is the only geometry stored in the editor. Boundaries are derived at render time and at export time.

## Edit a lane

1. Click **Select** (or press `S`) and click the lane centerline
2. Drag any vertex to reposition it
3. Click a segment to add a new vertex (mapbox-gl-draw `direct_select` mode)
4. Press `Delete` / `Backspace` to remove the selected lane

## Lane properties

With a lane selected, the **Properties** panel shows:

| Property                | Unit                           | Default        | Apollo field                             |
| ----------------------- | ------------------------------ | -------------- | ---------------------------------------- |
| **Width**               | meters                         | 3.75           | `left_sample` / `right_sample` (derived) |
| **Speed limit**         | km/h (displayed), m/s (stored) | 50 km/h        | `speed_limit`                            |
| **Lane type**           | enum                           | `CITY_DRIVING` | `type`                                   |
| **Turn**                | enum                           | `NO_TURN`      | `turn`                                   |
| **Direction**           | enum                           | `FORWARD`      | `direction`                              |
| **Left boundary type**  | enum                           | `DOTTED_WHITE` | `left_boundary.boundary_type`            |
| **Right boundary type** | enum                           | `DOTTED_WHITE` | `right_boundary.boundary_type`           |

### Lane type values

| Value        | Apollo enum    | Typical use            |
| ------------ | -------------- | ---------------------- |
| City Driving | `CITY_DRIVING` | Standard road lane     |
| Biking       | `BIKING`       | Bike lane              |
| Sidewalk     | `SIDEWALK`     | Pedestrian path        |
| Parking      | `PARKING`      | On-street parking      |
| Shoulder     | `SHOULDER`     | Road shoulder          |
| Shared       | `SHARED`       | Shared pedestrian/bike |

### Boundary type values

| Value           | Rendering           | Lane change allowed |
| --------------- | ------------------- | ------------------- |
| `DOTTED_WHITE`  | dashed white        | Yes                 |
| `DOTTED_YELLOW` | dashed yellow       | Yes                 |
| `SOLID_WHITE`   | solid white         | No                  |
| `SOLID_YELLOW`  | solid yellow        | No                  |
| `DOUBLE_YELLOW` | double solid yellow | No                  |
| `CURB`          | solid thick         | No                  |
| `UNKNOWN`       | default             | —                   |

::: warning Routing implication
The routing map generator only creates lane-change edges between lanes whose shared boundary is `DOTTED_WHITE` or `DOTTED_YELLOW`. Set boundaries correctly or lane changes will not be available in the routing graph.
:::

## Boundary rendering styles

Each boundary type renders as a distinct MapLibre line style:

- **Dotted** boundaries → dashed line (`line-dasharray: [4, 4]`)
- **Solid** boundaries → solid line
- **Double yellow** → two parallel lines rendered via offset layers
- **Curb** → thick solid line (`line-width: 3`)

Lane fill color is keyed to lane type:

| Lane type      | Fill color |
| -------------- | ---------- |
| `CITY_DRIVING` | blue-gray  |
| `BIKING`       | green      |
| `SIDEWALK`     | orange     |
| `PARKING`      | purple     |
| `SHOULDER`     | brown      |

## Direction arrows

A chevron arrow is drawn at the midpoint of each lane centerline, pointing in the lane's heading direction. This makes it easy to verify `FORWARD` vs `BACKWARD` direction visually.
