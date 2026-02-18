# export/buildRoutingMap

Builds an `apollo.routing.Graph` topological map from lane connectivity, porting `topo_creator`.

## buildRoutingMap

```ts
function buildRoutingMap(state: { lanes: Record<string, LaneFeature> }): TopoGraph
```

Returns a `TopoGraph` (plain JS object, not encoded) containing one `TopoNode` per lane and `TopoEdge` objects for each traversable transition.

**Example**

```ts
const graph = buildRoutingMap({ lanes: mapStore.getState().lanes })
const bytes = await encodeGraph(graph)
downloadBinary(bytes, 'routing_map.bin')
```

---

## TopoNode construction

For each `LaneFeature`:

```ts
TopoNode {
  lane_id: lane.id
  road_id: lane.roadId ?? lane.id
  length: turf.length(lane.centerLine, { units: 'meters' })
  cost: length * Math.sqrt(BASE_SPEED / lane.speedLimit) + turnPenalty(lane.turn)
  is_virtual: isInsideJunction && !hasNeighbors
  left_out: []   // not used by current routing
  right_out: []
}
```

### Turn penalties

| `LaneTurn`   | Penalty (seconds equivalent) |
| ------------ | ---------------------------- |
| `NO_TURN`    | 0                            |
| `LEFT_TURN`  | 50                           |
| `RIGHT_TURN` | 20                           |
| `U_TURN`     | 100                          |

### Virtual node condition

```ts
is_virtual =
  lane.junctionId !== undefined &&
  lane.leftNeighborIds.length === 0 &&
  lane.rightNeighborIds.length === 0
```

---

## TopoEdge construction

### FORWARD edges

One `FORWARD` edge per `successorId`:

```ts
TopoEdge {
  from_lane_id: lane.id
  to_lane_id: successorId
  cost: 0
  direction: EdgeDirection.FORWARD
}
```

### LATERAL edges (lane change)

For each left/right neighbor, if the shared boundary permits lane changes:

```ts
const allowedBoundaries = [BoundaryType.DOTTED_WHITE, BoundaryType.DOTTED_YELLOW]

if (allowedBoundaries.includes(sharedBoundaryType)) {
  const changingLen = BASE_CHANGING_LENGTH // 50 m
  const cost = CHANGE_PENALTY * Math.pow(changingLen / BASE_CHANGING_LENGTH, -1.5)
  // = 500 * 1^-1.5 = 500

  edges.push({
    from_lane_id: lane.id,
    to_lane_id: neighborId,
    cost,
    direction: side === 'left' ? EdgeDirection.LEFT : EdgeDirection.RIGHT,
  })
}
```

Boundaries that **block** lane-change edges: `SOLID_WHITE`, `SOLID_YELLOW`, `DOUBLE_YELLOW`, `CURB`, `UNKNOWN`.

---

## Configuration constants

```ts
const BASE_SPEED = 4.167 // m/s  (15 km/h)
const LEFT_TURN_PENALTY = 50
const RIGHT_TURN_PENALTY = 20
const UTURN_PENALTY = 100
const CHANGE_PENALTY = 500
const BASE_CHANGING_LENGTH = 50 // meters
```

Source: `modules/routing/conf/routing_config.pb.txt`

---

## TopoGraph structure

```ts
TopoGraph {
  hdmap_version: project.version
  hdmap_district: project.name
  node: TopoNode[]
  edge: TopoEdge[]
}
```
