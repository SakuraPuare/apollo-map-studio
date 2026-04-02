import type { LaneFeature, RoadDefinition } from '../types/editor'
import { LaneDirection } from '../types/apollo-map'
import { getOrComputeBoundary } from '../geo/boundaryCache'
import { getRoadColor } from '../utils/roadColors'

const LANE_TYPE_COLOR: Record<number, string> = {
  1: '#475569',
  2: '#1d4ed8',
  3: '#15803d',
  4: '#7c3aed',
  5: '#b45309',
  6: '#374151',
  7: '#0e7490',
}

const TURN_COLOR: Record<number, string> = {
  1: '#e2e8f0',
  2: '#f59e0b',
  3: '#f59e0b',
  4: '#ef4444',
}

const BOUNDARY_COLOR: Record<number, string> = {
  1: '#eab308',
  2: '#cbd5e1',
  3: '#eab308',
  4: '#cbd5e1',
  5: '#ca8a04',
  6: '#64748b',
}

export interface LaneFeatureArrays {
  fill: GeoJSON.Feature[]
  center: GeoJSON.Feature[]
  boundary: GeoJSON.Feature[]
  arrow: GeoJSON.Feature[]
  conn: GeoJSON.Feature[]
}

export function buildLaneFeaturesInto(
  lane: LaneFeature,
  lanes: Record<string, LaneFeature>,
  roads: Record<string, RoadDefinition>,
  out: LaneFeatureArrays
): void {
  const cached = getOrComputeBoundary(lane)

  // Fill polygon
  const fillColor =
    lane.roadId && roads[lane.roadId]
      ? getRoadColor(lane.roadId, roads)
      : (LANE_TYPE_COLOR[lane.laneType] ?? '#475569')

  out.fill.push({
    type: 'Feature',
    geometry: cached.polygon.geometry,
    properties: {
      id: lane.id,
      type: 'lane',
      fillColor,
      hasRoad: !!lane.roadId,
    },
    id: lane.id,
  })

  // Center line
  out.center.push({
    type: 'Feature',
    geometry: lane.centerLine.geometry,
    properties: { id: lane.id, type: 'lane' },
    id: lane.id,
  })

  // Left boundary
  out.boundary.push({
    type: 'Feature',
    geometry: cached.left.geometry,
    properties: {
      id: `${lane.id}__left`,
      laneId: lane.id,
      boundaryType: lane.leftBoundaryType,
      boundaryColor: BOUNDARY_COLOR[lane.leftBoundaryType] ?? '#cbd5e1',
    },
    id: `${lane.id}__left`,
  })

  // Right boundary
  out.boundary.push({
    type: 'Feature',
    geometry: cached.right.geometry,
    properties: {
      id: `${lane.id}__right`,
      laneId: lane.id,
      boundaryType: lane.rightBoundaryType,
      boundaryColor: BOUNDARY_COLOR[lane.rightBoundaryType] ?? '#cbd5e1',
    },
    id: `${lane.id}__right`,
  })

  // Direction / turn arrows
  const { point: midPt, bearing } = cached.midpoint
  const arrowColor = TURN_COLOR[lane.turn] ?? '#e2e8f0'

  if (lane.direction === LaneDirection.BACKWARD) {
    out.arrow.push({
      type: 'Feature',
      geometry: midPt.geometry,
      properties: {
        id: `${lane.id}__bwd`,
        laneId: lane.id,
        bearing: bearing + 180,
        arrowColor,
      },
      id: `${lane.id}__bwd`,
    })
  } else if (lane.direction === LaneDirection.BIDIRECTION) {
    out.arrow.push({
      type: 'Feature',
      geometry: midPt.geometry,
      properties: {
        id: `${lane.id}__fwd`,
        laneId: lane.id,
        bearing,
        arrowColor,
      },
      id: `${lane.id}__fwd`,
    })
    out.arrow.push({
      type: 'Feature',
      geometry: midPt.geometry,
      properties: {
        id: `${lane.id}__bwd`,
        laneId: lane.id,
        bearing: bearing + 180,
        arrowColor,
      },
      id: `${lane.id}__bwd`,
    })
  } else {
    // FORWARD (default)
    out.arrow.push({
      type: 'Feature',
      geometry: midPt.geometry,
      properties: {
        id: `${lane.id}__fwd`,
        laneId: lane.id,
        bearing,
        arrowColor,
      },
      id: `${lane.id}__fwd`,
    })
  }

  // Successor connections
  for (const succId of lane.successorIds) {
    const succ = lanes[succId]
    if (!succ) continue
    const fromCoords = lane.centerLine.geometry.coordinates
    const toCoords = succ.centerLine.geometry.coordinates
    const fromPt = fromCoords[fromCoords.length - 1]
    const toPt = toCoords[0]
    out.conn.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [fromPt, toPt],
      },
      properties: {
        id: `${lane.id}__${succId}`,
        fromId: lane.id,
        toId: succId,
      },
      id: `${lane.id}__${succId}`,
    })
  }
}
