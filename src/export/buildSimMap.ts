import type { ApolloMap, ApolloLane, PointENU, Curve } from '../types/apollo-map'

const ANGLE_THRESHOLD = Math.PI / 180 // 1 degree
const DOWNSAMPLE_DISTANCE = 5 // meters
const STEEP_TURN_DOWNSAMPLE_DISTANCE = 1 // meters

interface Point2D {
  x: number
  y: number
}

/**
 * Get the angle between directions at two consecutive path positions.
 * Direct port of GetPathAngle from points_downsampler.h
 */
function getPathAngle(points: Point2D[], start: number, end: number): number {
  if (start >= points.length - 1 || end >= points.length - 1) return 0
  if (start >= end) return 0

  const vStartX = points[start + 1].x - points[start].x
  const vStartY = points[start + 1].y - points[start].y
  const vStartNorm = Math.hypot(vStartX, vStartY)

  const vEndX = points[end + 1].x - points[end].x
  const vEndY = points[end + 1].y - points[end].y
  const vEndNorm = Math.hypot(vEndX, vEndY)

  if (vStartNorm === 0 || vEndNorm === 0) return 0

  const dotProduct = vStartX * vEndX + vStartY * vEndY
  const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct / (vStartNorm * vEndNorm))))
  return isNaN(angle) ? 0 : angle
}

/**
 * Downsample points by accumulated angle change.
 * Direct port of DownsampleByAngle from points_downsampler.h
 */
function downsampleByAngle(points: Point2D[], threshold: number): number[] {
  if (points.length === 0) return []
  const indices: number[] = [0]
  if (points.length > 1) {
    let start = 0
    let end = 1
    let accumDegree = 0
    while (end + 1 < points.length) {
      const angle = getPathAngle(points, start, end)
      accumDegree += Math.abs(angle)
      if (accumDegree > threshold) {
        indices.push(end)
        start = end
        accumDegree = 0
      }
      end++
    }
    indices.push(end)
  }
  return indices
}

/**
 * Downsample points by distance.
 * Direct port of DownsampleByDistance from points_downsampler.h
 */
function downsampleByDistance(
  points: Point2D[],
  downsampleDist: number,
  steepTurnDist: number
): number[] {
  if (points.length <= 4) {
    return points.map((_, i) => i)
  }

  const vStartX = points[1].x - points[0].x
  const vStartY = points[1].y - points[0].y
  const vStartNorm = Math.hypot(vStartX, vStartY)

  const vEndX = points[points.length - 1].x - points[points.length - 2].x
  const vEndY = points[points.length - 1].y - points[points.length - 2].y
  const vEndNorm = Math.hypot(vEndX, vEndY)

  let innerProd = 0
  if (vStartNorm > 0 && vEndNorm > 0) {
    innerProd = (vStartX * vEndX + vStartY * vEndY) / (vStartNorm * vEndNorm)
  }
  // Steep turn: angle > 80 degrees
  const isSteepTurn = innerProd <= Math.cos((80 * Math.PI) / 180)
  const rate = isSteepTurn ? steepTurnDist : downsampleDist

  const indices: number[] = [0]
  let accumDistance = 0

  for (let pos = 1; pos < points.length - 1; pos++) {
    const dx = points[pos].x - points[pos - 1].x
    const dy = points[pos].y - points[pos - 1].y
    accumDistance += Math.hypot(dx, dy)
    if (accumDistance > rate) {
      indices.push(pos)
      accumDistance = 0
    }
  }

  indices.push(points.length - 1)
  return indices
}

/**
 * Downsample ENU points: first by angle, then by distance.
 * This mirrors DownsampleCurve in sim_map_generator.cc
 */
function downsamplePoints(points: PointENU[]): PointENU[] {
  if (points.length <= 2) return points

  const pts2d: Point2D[] = points.map((p) => ({ x: p.x, y: p.y }))

  // Step 1: downsample by angle
  const angleIndices = downsampleByAngle(pts2d, ANGLE_THRESHOLD)
  const afterAngle: Point2D[] = angleIndices.map((i) => pts2d[i])
  const afterAngleENU: PointENU[] = angleIndices.map((i) => points[i])

  // Step 2: downsample by distance
  const distIndices = downsampleByDistance(
    afterAngle,
    DOWNSAMPLE_DISTANCE,
    STEEP_TURN_DOWNSAMPLE_DISTANCE
  )
  return distIndices.map((i) => afterAngleENU[i])
}

/**
 * Downsample a Curve's line segment points.
 */
function downsampleCurve(curve: Curve): Curve {
  return {
    segment: curve.segment.map((seg) => {
      if (!seg.lineSegment) return seg
      const downsampled = downsamplePoints(seg.lineSegment.point)
      return {
        ...seg,
        lineSegment: { point: downsampled },
      }
    }),
  }
}

/**
 * Build sim_map from base_map by:
 * 1. Removing left_sample, right_sample, left_road_sample, right_road_sample
 * 2. Downsampling central_curve, left_boundary.curve, right_boundary.curve
 *
 * Mirrors DownsampleMap in sim_map_generator.cc
 */
export function buildSimMap(baseMap: ApolloMap): ApolloMap {
  const simLanes: ApolloLane[] = baseMap.lane.map((lane) => ({
    ...lane,
    // Clear sample associations (not needed for visualization)
    leftSample: [],
    rightSample: [],
    leftRoadSample: [],
    rightRoadSample: [],
    // Downsample curves
    centralCurve: downsampleCurve(lane.centralCurve),
    leftBoundary: {
      ...lane.leftBoundary,
      curve: downsampleCurve(lane.leftBoundary.curve),
    },
    rightBoundary: {
      ...lane.rightBoundary,
      curve: downsampleCurve(lane.rightBoundary.curve),
    },
  }))

  return {
    ...baseMap,
    lane: simLanes,
  }
}
