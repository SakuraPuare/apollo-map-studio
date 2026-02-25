# export/buildBaseMap

Assembles a complete `apollo.hdmap.Map` proto object from editor state.

## buildBaseMap

```ts
async function buildBaseMap(params: {
  project: ProjectConfig
  lanes: LaneFeature[]
  junctions: JunctionFeature[]
  signals: SignalFeature[]
  stopSigns: StopSignFeature[]
  crosswalks: CrosswalkFeature[]
  clearAreas: ClearAreaFeature[]
  speedBumps: SpeedBumpFeature[]
  parkingSpaces: ParkingSpaceFeature[]
  roads: RoadDefinition[]
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

`buildRoads()` groups lanes using `RoadDefinition` objects that carry a name and type:

```ts
// Lanes assigned to a RoadDefinition are grouped into that road
for (const [roadId, roadLanes] of roadLanesMap) {
  const def = roadDefMap.get(roadId)!
  roads.push({
    id: { id: roadId },
    section: [{ id: { id: `${roadId}_section_0` }, lane_id: roadLanes.map((l) => ({ id: l.id })) }],
    type: def.type, // RoadType from the definition (HIGHWAY, CITY_ROAD, PARK)
  })
}

// Unassigned lanes each get their own single-lane road
for (const lane of unassignedLanes) {
  roads.push({
    id: { id: `road_${lane.id}` },
    section: [{ id: { id: `road_${lane.id}_section_0` }, lane_id: [{ id: lane.id }] }],
    type: RoadType.CITY_ROAD,
  })
}
```

Header `bytes` fields (`version`, `date`, `district`, `vendor`) are encoded as `Uint8Array` via `TextEncoder` to satisfy protobuf's `bytes` wire type.
