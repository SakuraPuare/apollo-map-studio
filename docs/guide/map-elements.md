# Map Elements

Apollo HD maps contain eight non-lane element types. Each is drawn with a dedicated toolbar mode.

## Junction

A junction is a polygon that marks an intersection area. Lanes inside a junction are treated as virtual nodes in the routing graph.

**Draw:** Toolbar → **Draw Junction** → click polygon vertices → double-click to close

**Apollo proto:** `apollo.hdmap.Junction`

| Property | Description                                  |
| -------- | -------------------------------------------- |
| Polygon  | WGS84 polygon covering the intersection area |

::: tip
Draw junctions to enclose the turning lanes between approach and exit lanes. The export engine automatically detects which lanes fall inside and sets their `junction_id`.
:::

---

## Signal (Traffic Light)

A signal has two geometry components: a point marking the physical light location, and a stop line where vehicles must wait.

**Draw:** Toolbar → **Draw Signal** → click the stop line start → click the stop line end → the signal position defaults to the midpoint

**Apollo proto:** `apollo.hdmap.Signal`

| Property    | Values                                                                               |
| ----------- | ------------------------------------------------------------------------------------ |
| Signal type | `MIX_2_HORIZONTAL`, `MIX_2_VERTICAL`, `MIX_3_HORIZONTAL`, `MIX_3_VERTICAL`, `SINGLE` |

The export engine computes overlaps between the stop line and lane centerlines. Each intersection becomes an `apollo.hdmap.Overlap` with a `SignalOverlapInfo`.

---

## Stop Sign

A stop sign is defined solely by its stop line geometry. No physical sign position is stored — Apollo infers the sign location from map context.

**Draw:** Toolbar → **Draw Stop Sign** → click line start → click line end

**Apollo proto:** `apollo.hdmap.StopSign`

| Property       | Values                           |
| -------------- | -------------------------------- |
| Stop sign type | `ONE_WAY`, `TWO_WAY`, `FOUR_WAY` |

---

## Crosswalk

A crosswalk is a polygon. In Dreamview it renders with zebra-stripe fill.

**Draw:** Toolbar → **Draw Crosswalk** → click polygon vertices → double-click to close

**Apollo proto:** `apollo.hdmap.Crosswalk`

The export engine detects lane centerlines that cross the crosswalk polygon boundary and creates overlaps with `CrosswalkOverlapInfo`.

---

## Clear Area

A clear area (禁停区) is a polygon marking a zone where vehicles must not stop.

**Draw:** Toolbar → **Draw Clear Area** → click polygon vertices → double-click to close

**Apollo proto:** `apollo.hdmap.ClearArea`

---

## Speed Bump

A speed bump is a line segment drawn across one or more lanes.

**Draw:** Toolbar → **Draw Speed Bump** → click line start → click line end

**Apollo proto:** `apollo.hdmap.SpeedBump`

The export engine detects lane/speed-bump intersections and creates overlaps with `SpeedBumpOverlapInfo`.

---

## Parking Space

A parking space is a polygon with an optional heading angle.

**Draw:** Toolbar → **Draw Parking Space** → click polygon vertices → double-click to close

**Apollo proto:** `apollo.hdmap.ParkingSpace`

| Property | Description                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------ |
| Heading  | Degrees from north, counterclockwise. Used by the parking module to determine pull-in direction. |

---

## Element rendering summary

| Element         | Layer type       | Visual                               |
| --------------- | ---------------- | ------------------------------------ |
| Lane centerline | `line`           | Color per lane type                  |
| Lane boundaries | `line`           | Dash style per boundary type         |
| Junction        | `fill` + `line`  | Semi-transparent orange polygon      |
| Signal          | `symbol` (icon)  | Traffic light icon at position point |
| Stop sign       | `line`           | Red line                             |
| Crosswalk       | `fill` (pattern) | Zebra-stripe fill                    |
| Clear area      | `fill` (pattern) | Cross-hatch fill                     |
| Speed bump      | `line`           | Thick yellow line                    |
| Parking space   | `fill` (pattern) | Grid-line fill                       |
| Connections     | `symbol`         | Directional arrows                   |
