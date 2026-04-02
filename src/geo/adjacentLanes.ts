import * as turf from '@turf/turf'
import type { LaneFeature } from '../types/editor'

export interface NeighborPair {
  laneId: string
  neighborId: string
  side: 'left' | 'right'
}

/**
 * Auto-compute left/right neighbor relationships for lanes within each road.
 * Only processes lanes that have a roadId assigned.
 */
export async function computeAdjacentLanes(lanes: LaneFeature[]): Promise<NeighborPair[]> {
  const pairs: NeighborPair[] = []

  // Group lanes by roadId
  const roadGroups = new Map<string, LaneFeature[]>()
  for (const lane of lanes) {
    if (!lane.roadId) continue
    if (!roadGroups.has(lane.roadId)) roadGroups.set(lane.roadId, [])
    roadGroups.get(lane.roadId)!.push(lane)
  }

  for (const [, roadLanes] of roadGroups) {
    if (roadLanes.length < 2) continue
    await computeNeighborsInGroup(roadLanes, pairs)
  }

  return pairs
}

/**
 * Compute neighbors for a specific set of lanes (e.g. lanes in one road).
 */
export async function computeNeighborsForRoad(
  allLanes: LaneFeature[],
  roadId: string
): Promise<NeighborPair[]> {
  const roadLanes = allLanes.filter((l) => l.roadId === roadId)
  if (roadLanes.length < 2) return []
  const pairs: NeighborPair[] = []
  await computeNeighborsInGroup(roadLanes, pairs)
  return pairs
}

async function computeNeighborsInGroup(lanes: LaneFeature[], pairs: NeighborPair[]): Promise<void> {
  let count = 0
  for (let i = 0; i < lanes.length; i++) {
    for (let j = i + 1; j < lanes.length; j++) {
      const result = checkAdjacent(lanes[i], lanes[j])
      if (result) {
        pairs.push(result)
      }
      count++
      if (count % 50 === 0) {
        await new Promise((r) => setTimeout(r, 0))
      }
    }
  }
}

function checkAdjacent(a: LaneFeature, b: LaneFeature): NeighborPair | null {
  const coordsA = a.centerLine.geometry.coordinates
  const coordsB = b.centerLine.geometry.coordinates
  if (coordsA.length < 2 || coordsB.length < 2) return null

  // 1. Check direction parallelism — reject if lanes are not roughly parallel
  const bearingA = turf.bearing(turf.point(coordsA[0]), turf.point(coordsA[coordsA.length - 1]))
  const bearingB = turf.bearing(turf.point(coordsB[0]), turf.point(coordsB[coordsB.length - 1]))
  let angleDiff = Math.abs(bearingA - bearingB)
  if (angleDiff > 180) angleDiff = 360 - angleDiff
  if (angleDiff > 30) return null

  // 2. Sample points along A and measure distance to B
  const lengthA = turf.length(a.centerLine, { units: 'meters' })
  if (lengthA < 0.5) return null

  const sampleCount = Math.max(3, Math.min(7, Math.round(lengthA / 5)))
  const distances: number[] = []

  for (let k = 1; k <= sampleCount; k++) {
    const s = (lengthA * k) / (sampleCount + 1)
    const pt = turf.along(a.centerLine, s, { units: 'meters' })
    const nearest = turf.nearestPointOnLine(b.centerLine, pt)
    distances.push(turf.distance(pt, nearest, { units: 'meters' }))
  }

  const avgDist = distances.reduce((sum, d) => sum + d, 0) / distances.length
  const expectedDist = (a.width + b.width) / 2
  const tolerance = Math.max(expectedDist * 0.4, 1.0)

  if (Math.abs(avgDist - expectedDist) > tolerance) return null

  // 3. Determine which side B is relative to A
  const midS = lengthA / 2
  const midPt = turf.along(a.centerLine, midS, { units: 'meters' })
  const nearestB = turf.nearestPointOnLine(b.centerLine, midPt)

  // Prevent degenerate case where midPt and nearestB coincide
  const distMidToB = turf.distance(midPt, nearestB, { units: 'meters' })
  if (distMidToB < 0.1) return null

  const bearingToB = turf.bearing(midPt, nearestB)
  let relAngle = bearingToB - bearingA
  while (relAngle > 180) relAngle -= 360
  while (relAngle < -180) relAngle += 360

  // relAngle < 0 → B is to the LEFT of A; relAngle > 0 → B is to the RIGHT of A
  const side: 'left' | 'right' = relAngle < 0 ? 'left' : 'right'

  return { laneId: a.id, neighborId: b.id, side }
}
