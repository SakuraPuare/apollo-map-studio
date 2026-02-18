import * as turf from '@turf/turf'
import type { Feature, LineString, Polygon } from 'geojson'
import type {
  LaneFeature,
  CrosswalkFeature,
  SignalFeature,
  StopSignFeature,
  JunctionFeature,
  ClearAreaFeature,
  SpeedBumpFeature,
} from '../types/editor'
import type { ApolloOverlap } from '../types/apollo-map'

let overlapCounter = 0
function nextOverlapId(): string {
  return `overlap_${++overlapCounter}`
}

/**
 * Find intersections between a lane centerline and a crosswalk polygon.
 * Returns s-coordinate range on the lane.
 */
function lanePolygonOverlap(
  lane: LaneFeature,
  polygon: Feature<Polygon>
): { startS: number; endS: number } | null {
  const centerLine = lane.centerLine
  const clipped = turf.lineSplit(centerLine, polygon)
  if (!clipped || clipped.features.length < 2) {
    // Check if line intersects at all
    const intersects = turf.lineIntersect(centerLine, turf.polygonToLine(polygon))
    if (intersects.features.length === 0) return null
  }

  // Use the polygon boundary to find intersection points
  const polyLine = turf.polygonToLine(polygon) as Feature<LineString>
  const intersects = turf.lineIntersect(centerLine, polyLine)
  if (intersects.features.length < 1) return null

  const totalLen = turf.length(centerLine, { units: 'meters' })
  const sList: number[] = intersects.features.map((pt) => {
    const nearest = turf.nearestPointOnLine(centerLine, pt)
    const loc = nearest.properties?.location ?? 0
    return loc * totalLen // location is 0-1, multiply by total length
  })

  if (sList.length === 0) return null
  sList.sort((a, b) => a - b)
  return { startS: sList[0], endS: sList[sList.length - 1] }
}

/**
 * Find intersections between a lane centerline and a stop line.
 */
function laneLineOverlap(
  lane: LaneFeature,
  stopLine: Feature<LineString>
): { startS: number; endS: number } | null {
  const centerLine = lane.centerLine
  const intersects = turf.lineIntersect(centerLine, stopLine)
  if (intersects.features.length === 0) return null

  const totalLen = turf.length(centerLine, { units: 'meters' })
  const nearest = turf.nearestPointOnLine(centerLine, intersects.features[0])
  const s = (nearest.properties?.location ?? 0) * totalLen
  return { startS: Math.max(0, s - 0.5), endS: Math.min(totalLen, s + 0.5) }
}

/**
 * Check if a lane is inside a junction polygon.
 */
function laneInJunction(lane: LaneFeature, junction: JunctionFeature): boolean {
  const coords = lane.centerLine.geometry.coordinates
  const midIdx = Math.floor(coords.length / 2)
  const midPt = turf.point(coords[midIdx])
  return turf.booleanPointInPolygon(midPt, junction.polygon)
}

export interface ComputedOverlap {
  overlap: ApolloOverlap
  laneOverlapIds: Record<string, string[]> // laneId -> overlap IDs
}

/**
 * Compute all overlaps between lanes and other map elements.
 */
export function computeAllOverlaps(params: {
  lanes: LaneFeature[]
  crosswalks: CrosswalkFeature[]
  signals: SignalFeature[]
  stopSigns: StopSignFeature[]
  junctions: JunctionFeature[]
  clearAreas: ClearAreaFeature[]
  speedBumps: SpeedBumpFeature[]
}): ComputedOverlap[] {
  overlapCounter = 0
  const results: ComputedOverlap[] = []
  const laneOverlapIds: Record<string, string[]> = {}

  function addLaneOverlapId(laneId: string, oid: string) {
    if (!laneOverlapIds[laneId]) laneOverlapIds[laneId] = []
    laneOverlapIds[laneId].push(oid)
  }

  // Lane vs Crosswalk
  for (const lane of params.lanes) {
    for (const crosswalk of params.crosswalks) {
      const result = lanePolygonOverlap(lane, crosswalk.polygon)
      if (result) {
        const oid = nextOverlapId()
        results.push({
          overlap: {
            id: { id: oid },
            object: [
              {
                id: { id: lane.id },
                laneOverlapInfo: {
                  startS: result.startS,
                  endS: result.endS,
                  isMerge: false,
                },
              },
              {
                id: { id: crosswalk.id },
                crosswalkOverlapInfo: {},
              },
            ],
          },
          laneOverlapIds,
        })
        addLaneOverlapId(lane.id, oid)
      }
    }
  }

  // Lane vs Signal stop line
  for (const lane of params.lanes) {
    for (const signal of params.signals) {
      const result = laneLineOverlap(lane, signal.stopLine)
      if (result) {
        const oid = nextOverlapId()
        results.push({
          overlap: {
            id: { id: oid },
            object: [
              {
                id: { id: lane.id },
                laneOverlapInfo: {
                  startS: result.startS,
                  endS: result.endS,
                  isMerge: false,
                },
              },
              {
                id: { id: signal.id },
                signalOverlapInfo: {},
              },
            ],
          },
          laneOverlapIds,
        })
        addLaneOverlapId(lane.id, oid)
      }
    }
  }

  // Lane vs StopSign
  for (const lane of params.lanes) {
    for (const stopSign of params.stopSigns) {
      for (const stopLine of [stopSign.stopLine]) {
        const result = laneLineOverlap(lane, stopLine)
        if (result) {
          const oid = nextOverlapId()
          results.push({
            overlap: {
              id: { id: oid },
              object: [
                {
                  id: { id: lane.id },
                  laneOverlapInfo: {
                    startS: result.startS,
                    endS: result.endS,
                    isMerge: false,
                  },
                },
                {
                  id: { id: stopSign.id },
                  stopSignOverlapInfo: {},
                },
              ],
            },
            laneOverlapIds,
          })
          addLaneOverlapId(lane.id, oid)
        }
      }
    }
  }

  // Lane vs Junction
  for (const lane of params.lanes) {
    for (const junction of params.junctions) {
      if (laneInJunction(lane, junction)) {
        const oid = nextOverlapId()
        const laneLen = turf.length(lane.centerLine, { units: 'meters' })
        results.push({
          overlap: {
            id: { id: oid },
            object: [
              {
                id: { id: lane.id },
                laneOverlapInfo: {
                  startS: 0,
                  endS: laneLen,
                  isMerge: false,
                },
              },
              {
                id: { id: junction.id },
                junctionOverlapInfo: {},
              },
            ],
          },
          laneOverlapIds,
        })
        addLaneOverlapId(lane.id, oid)
      }
    }
  }

  // Lane vs ClearArea
  for (const lane of params.lanes) {
    for (const area of params.clearAreas) {
      const result = lanePolygonOverlap(lane, area.polygon)
      if (result) {
        const oid = nextOverlapId()
        results.push({
          overlap: {
            id: { id: oid },
            object: [
              {
                id: { id: lane.id },
                laneOverlapInfo: {
                  startS: result.startS,
                  endS: result.endS,
                  isMerge: false,
                },
              },
              {
                id: { id: area.id },
                clearAreaOverlapInfo: {},
              },
            ],
          },
          laneOverlapIds,
        })
        addLaneOverlapId(lane.id, oid)
      }
    }
  }

  // Lane vs SpeedBump
  for (const lane of params.lanes) {
    for (const bump of params.speedBumps) {
      const result = laneLineOverlap(lane, bump.line)
      if (result) {
        const oid = nextOverlapId()
        results.push({
          overlap: {
            id: { id: oid },
            object: [
              {
                id: { id: lane.id },
                laneOverlapInfo: {
                  startS: result.startS,
                  endS: result.endS,
                  isMerge: false,
                },
              },
              {
                id: { id: bump.id },
                speedBumpOverlapInfo: {},
              },
            ],
          },
          laneOverlapIds,
        })
        addLaneOverlapId(lane.id, oid)
      }
    }
  }

  return results
}
