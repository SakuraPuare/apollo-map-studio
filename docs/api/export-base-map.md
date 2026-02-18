# export/buildBaseMap

Assembles a complete `apollo.hdmap.Map` proto object from editor state.

## buildBaseMap

```ts
async function buildBaseMap(state: {
  project: ProjectConfig
  lanes: Record<string, LaneFeature>
  junctions: Record<string, JunctionFeature>
  signals: Record<string, SignalFeature>
  stopSigns: Record<string, StopSignFeature>
  crosswalks: Record<string, CrosswalkFeature>
  clearAreas: Record<string, ClearAreaFeature>
  speedBumps: Record<string, SpeedBumpFeature>
  parkingSpaces: Record<string, ParkingSpaceFeature>
}): Promise<ApolloMap>
```

Translates the editor's GeoJSON state into a complete `ApolloMap` object ready for encoding.

**Steps:**

1. Call `setGlobalProjection(project.originLat, project.originLon)`
2. Convert each `LaneFeature` → `ApolloLane` (see below)
3. Group lanes into `ApolloRoad` objects by `roadId`
4. Convert junctions, signals, stop signs, crosswalks, clear areas, speed bumps, parking spaces
5. Run `computeAllOverlaps()` and distribute overlap IDs to lanes and elements
6. Assemble `MapHeader` with projection string, version, date
7. Return the complete `ApolloMap`

### Lane conversion detail

```ts
ApolloLane {
  id: { id: lane.id }

  central_curve: {
    segment: [{
      line_segment: {
        point: centerLine.coordinates.map(lngLatToENU)
      }
      s: 0
      start_position: lngLatToENU(first coordinate)
      heading: computeStartHeading(centerLine)
      length: turf.length(centerLine, { units: 'meters' })
    }]
  }

  left_boundary:  { curve: offsetCurve(+width/2), boundary_type: [...] }
  right_boundary: { curve: offsetCurve(-width/2), boundary_type: [...] }

  length:        turf.length(centerLine)
  speed_limit:   lane.speedLimit
  type:          lane.laneType
  turn:          lane.turn
  direction:     lane.direction

  predecessor_id:  lane.predecessorIds.map(id => ({ id }))
  successor_id:    lane.successorIds.map(id => ({ id }))
  left_neighbor_forward_lane_id:  lane.leftNeighborIds.map(...)
  right_neighbor_forward_lane_id: lane.rightNeighborIds.map(...)

  left_sample:  computeLaneSamples(centerLine, width/2)
  right_sample: computeLaneSamples(centerLine, width/2)

  junction_id: lane.junctionId ? { id: lane.junctionId } : undefined
  overlap_id: [populated after overlap computation]
}
```

### Road grouping

```ts
// Group lanes by roadId (undefined → each lane is its own road)
const roadGroups = new Map<string, string[]>()
for (const lane of lanes) {
  const key = lane.roadId ?? `road_${lane.id}`
  roadGroups.get(key)?.push(lane.id) ?? roadGroups.set(key, [lane.id])
}

for (const [roadId, laneIds] of roadGroups) {
  roads.push({
    id: { id: roadId },
    section: [{ id: { id: `${roadId}_section` }, lane_id: laneIds.map((id) => ({ id })) }],
    type: RoadType.CITY_ROAD,
  })
}
```
