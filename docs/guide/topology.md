# Topology & Connections

Apollo lane topology defines three kinds of relationships between lanes:

| Relationship                | Apollo fields                     | Meaning                                        |
| --------------------------- | --------------------------------- | ---------------------------------------------- |
| **Successor / Predecessor** | `successor_id` / `predecessor_id` | Lane B starts where lane A ends (longitudinal) |
| **Left neighbor**           | `left_neighbor_forward_lane_id`   | Adjacent lane to the left, same direction      |
| **Right neighbor**          | `right_neighbor_forward_lane_id`  | Adjacent lane to the right, same direction     |

These relationships are what allow the routing module to plan paths across the map.

## Connect successor / predecessor lanes

1. Select **Connect Lanes** mode from the toolbar (or press `C`)
2. Click the **upstream** lane (predecessor) — it highlights in orange
3. Click the **downstream** lane (successor) — the connection is created

The editor sets both directions:

- `fromLane.successorIds` gets `toId` added
- `toLane.predecessorIds` gets `fromId` added

Connected lanes are visualized as arrows in the **connections** layer.

::: tip Typical intersection pattern

```
    [approach lane] ──→ [turning lane] ──→ [exit lane]
```

The turning lane inside the junction gets predecessor = approach lane, successor = exit lane.
:::

## Set neighbor lanes

Neighbor relationships are set in the **Properties** panel of a selected lane.

Neighbor IDs are displayed as a read-only list. To add a neighbor:

1. Select the lane you want to set a neighbor on
2. In the Properties panel, click **Add Left Neighbor** or **Add Right Neighbor**
3. The editor enters neighbor-pick mode — click the adjacent lane
4. The relationship is set bidirectionally:
   - `laneA.leftNeighborIds` gets `laneB`
   - `laneB.rightNeighborIds` gets `laneA`

## Remove connections

Select the lane in **Select** mode, then in the Properties panel click the `×` next to any ID in the predecessor/successor/neighbor lists.

`removeElement` also cleans up: deleting a lane removes all references to it from every other lane's predecessor, successor, and neighbor lists.

## Junction assignment

When a lane's centerline midpoint falls inside a junction polygon, the export engine automatically sets `lane.junction_id`. You do not need to set this manually.

The routing map uses junction membership to set `TopoNode.is_virtual`:

```
is_virtual = lane is inside a junction
             AND has no left or right forward neighbors
```

Virtual nodes correspond to junction-internal connecting lanes that drivers cannot directly choose — the routing module treats them as zero-cost pass-throughs.

## Road assignment

Lanes can be grouped into named roads using the **Road Properties** panel. Each road has a name, type (Highway, City Road, Park), and a list of assigned lanes.

### Managing roads

1. Open the **Road Properties** panel from the right sidebar
2. Click **Add Road** to create a new road definition
3. Set the road name and type
4. Select a lane, then use **Assign to Road** to add it to a road
5. Lanes assigned to the same road are color-coded on the map for easy identification

At export time, lanes sharing the same `roadId` are grouped into one `Road` proto object with a single `RoadSection`. The road's `type` field is preserved (Highway = 1, City Road = 2, Park = 3). Lanes without a `roadId` each become their own single-lane road section.

## Viewing connections

Toggle the **Connections** layer in the layer panel (right side) to show or hide the directed-arrow overlay. Each arrow represents a successor relationship.

Connection arrows use a `symbol` layer with a chevron icon rotated to match the heading from the upstream lane end to the downstream lane start.
