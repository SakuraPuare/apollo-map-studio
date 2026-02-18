import type { ApolloMap, ApolloLane } from '../types/apollo-map'
import { BoundaryType, LaneTurn } from '../types/apollo-map'
import type { TopoGraph, TopoNode, TopoEdge, CurveRange } from '../types/apollo-routing'
import { EdgeDirection } from '../types/apollo-routing'

// Default routing config (from modules/routing/conf/routing_config.pb.txt)
const ROUTING_CONFIG = {
  baseSpeed: 4.167, // m/s (~15 km/h)
  leftTurnPenalty: 50.0,
  rightTurnPenalty: 20.0,
  uturnPenalty: 100.0,
  changePenalty: 500.0,
  baseChangingLength: 50.0,
}

/**
 * Check if a boundary type allows lane changing.
 * From IsAllowedOut in node_creator.cc
 */
function isAllowedOut(boundaryType: BoundaryType): boolean {
  return boundaryType === BoundaryType.DOTTED_YELLOW || boundaryType === BoundaryType.DOTTED_WHITE
}

/**
 * Get lane length from curve segments.
 */
function getLaneLength(lane: ApolloLane): number {
  return lane.length ?? lane.centralCurve.segment.reduce((sum, seg) => sum + (seg.length ?? 0), 0)
}

/**
 * Build CurveRange[] for a side boundary.
 * From AddOutBoundary in node_creator.cc
 */
function buildOutBoundary(boundaryType: BoundaryType, laneLength: number): CurveRange[] {
  if (!isAllowedOut(boundaryType)) return []
  // Single range covering the entire lane
  return [{ start: { s: 0 }, end: { s: laneLength } }]
}

/**
 * Compute node cost from lane properties.
 * From InitNodeCost in node_creator.cc
 */
function computeNodeCost(lane: ApolloLane): number {
  const laneLength = getLaneLength(lane)
  const speedLimit = lane.speedLimit > 0 ? lane.speedLimit : ROUTING_CONFIG.baseSpeed
  const ratio =
    speedLimit >= ROUTING_CONFIG.baseSpeed ? Math.sqrt(ROUTING_CONFIG.baseSpeed / speedLimit) : 1.0
  let cost = laneLength * ratio

  if (lane.turn === LaneTurn.LEFT_TURN) {
    cost += ROUTING_CONFIG.leftTurnPenalty
  } else if (lane.turn === LaneTurn.RIGHT_TURN) {
    cost += ROUTING_CONFIG.rightTurnPenalty
  } else if (lane.turn === LaneTurn.U_TURN) {
    cost += ROUTING_CONFIG.uturnPenalty
  }

  return cost
}

/**
 * Determine if a lane is virtual.
 * From InitNodeInfo in node_creator.cc:
 * is_virtual = true (default), set false if lane has no junction_id OR has neighbors
 */
function isVirtualLane(lane: ApolloLane): boolean {
  if (!lane.junctionId?.id) return false // no junction -> not virtual
  if (lane.leftNeighborForwardLaneId.length > 0 || lane.rightNeighborForwardLaneId.length > 0) {
    return false // has neighbors -> not virtual
  }
  return true // in junction, no neighbors -> virtual
}

/**
 * Compute edge cost for lane change edges.
 * From GetPbEdge in edge_creator.cc
 */
function computeEdgeCost(changingAreaLength: number): number {
  if (changingAreaLength <= 0) return ROUTING_CONFIG.changePenalty
  let ratio = 1.0
  if (changingAreaLength < ROUTING_CONFIG.baseChangingLength) {
    ratio = Math.pow(changingAreaLength / ROUTING_CONFIG.baseChangingLength, -1.5)
  }
  return ROUTING_CONFIG.changePenalty * ratio
}

/**
 * Build the routing topology graph from an Apollo Map.
 * Mirrors graph_creator.cc + node_creator.cc + edge_creator.cc
 */
export function buildRoutingMap(map: ApolloMap): TopoGraph {
  // Build lane lookup
  const laneById = new Map<string, ApolloLane>()
  for (const lane of map.lane) {
    laneById.set(lane.id.id, lane)
  }

  // Build road lookup (lane_id -> road_id)
  const laneToRoad = new Map<string, string>()
  for (const road of map.road) {
    for (const section of road.section) {
      for (const laneId of section.laneId) {
        laneToRoad.set(laneId.id, road.id.id)
      }
    }
  }

  const nodes: TopoNode[] = []
  const edges: TopoEdge[] = []

  // Build nodes
  for (const lane of map.lane) {
    const laneLength = getLaneLength(lane)
    const roadId = laneToRoad.get(lane.id.id) ?? ''

    const leftOut = buildOutBoundary(
      lane.leftBoundary.boundaryType[0]?.types[0] ?? BoundaryType.UNKNOWN,
      laneLength
    )
    const rightOut = buildOutBoundary(
      lane.rightBoundary.boundaryType[0]?.types[0] ?? BoundaryType.UNKNOWN,
      laneLength
    )

    nodes.push({
      laneId: lane.id.id,
      length: laneLength,
      leftOut,
      rightOut,
      cost: computeNodeCost(lane),
      centralCurve: lane.centralCurve as unknown as undefined, // pass through
      isVirtual: isVirtualLane(lane),
      roadId,
    })
  }

  // Build FORWARD edges (successor relationships)
  for (const lane of map.lane) {
    for (const succId of lane.successorId) {
      edges.push({
        fromLaneId: lane.id.id,
        toLaneId: succId.id,
        cost: 0.0,
        directionType: EdgeDirection.FORWARD,
      })
    }
  }

  // Build LEFT/RIGHT lane-change edges
  for (const lane of map.lane) {
    const laneLength = getLaneLength(lane)

    // Left neighbor -> LEFT edge
    for (const neighborId of lane.leftNeighborForwardLaneId) {
      // Compute how much of the left boundary allows changing
      const leftOut = buildOutBoundary(
        lane.leftBoundary.boundaryType[0]?.types[0] ?? BoundaryType.UNKNOWN,
        laneLength
      )
      const changingAreaLength = leftOut.reduce((sum, r) => sum + r.end.s - r.start.s, 0)
      if (changingAreaLength > 0) {
        edges.push({
          fromLaneId: lane.id.id,
          toLaneId: neighborId.id,
          cost: computeEdgeCost(changingAreaLength),
          directionType: EdgeDirection.LEFT,
        })
      }
    }

    // Right neighbor -> RIGHT edge
    for (const neighborId of lane.rightNeighborForwardLaneId) {
      const rightOut = buildOutBoundary(
        lane.rightBoundary.boundaryType[0]?.types[0] ?? BoundaryType.UNKNOWN,
        laneLength
      )
      const changingAreaLength = rightOut.reduce((sum, r) => sum + r.end.s - r.start.s, 0)
      if (changingAreaLength > 0) {
        edges.push({
          fromLaneId: lane.id.id,
          toLaneId: neighborId.id,
          cost: computeEdgeCost(changingAreaLength),
          directionType: EdgeDirection.RIGHT,
        })
      }
    }
  }

  return {
    hdmapVersion: map.header?.version ?? '1.0.0',
    hdmapDistrict: map.header?.district ?? '',
    node: nodes,
    edge: edges,
  }
}
