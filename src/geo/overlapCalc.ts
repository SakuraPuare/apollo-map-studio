import * as turf from '@turf/turf'
import type { Feature, LineString, Polygon } from 'geojson'
import RBush from 'rbush'
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

/** Spatial index item wrapping a map element with its bounding box. */
interface SpatialItem<T> {
  minX: number
  minY: number
  maxX: number
  maxY: number
  item: T
}

/** Compute the axis-aligned bounding box for an array of [x, y] coordinates. */
function buildBBox(coords: number[][]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const [x, y] of coords) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
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
 *
 * Uses R-tree spatial indices to avoid O(n^2) brute-force comparisons.
 * For each lane, only elements whose bounding boxes intersect the lane's
 * padded bounding box are tested with the expensive turf geometry checks.
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

  // --- Build R-tree spatial indices for each element type ---

  // Crosswalks (polygon features)
  const crosswalkTree = new RBush<SpatialItem<CrosswalkFeature>>()
  crosswalkTree.load(
    params.crosswalks.map((cw) => {
      const bbox = buildBBox(cw.polygon.geometry.coordinates[0])
      return { ...bbox, item: cw }
    })
  )

  // Signals (line features — stop lines)
  const signalTree = new RBush<SpatialItem<SignalFeature>>()
  signalTree.load(
    params.signals.map((signal) => {
      const bbox = buildBBox(signal.stopLine.geometry.coordinates)
      return { ...bbox, item: signal }
    })
  )

  // Stop signs (line features — stop lines)
  const stopSignTree = new RBush<SpatialItem<StopSignFeature>>()
  stopSignTree.load(
    params.stopSigns.map((stopSign) => {
      const bbox = buildBBox(stopSign.stopLine.geometry.coordinates)
      return { ...bbox, item: stopSign }
    })
  )

  // Junctions (polygon features)
  const junctionTree = new RBush<SpatialItem<JunctionFeature>>()
  junctionTree.load(
    params.junctions.map((junction) => {
      const bbox = buildBBox(junction.polygon.geometry.coordinates[0])
      return { ...bbox, item: junction }
    })
  )

  // Clear areas (polygon features)
  const clearAreaTree = new RBush<SpatialItem<ClearAreaFeature>>()
  clearAreaTree.load(
    params.clearAreas.map((area) => {
      const bbox = buildBBox(area.polygon.geometry.coordinates[0])
      return { ...bbox, item: area }
    })
  )

  // Speed bumps (line features)
  const speedBumpTree = new RBush<SpatialItem<SpeedBumpFeature>>()
  speedBumpTree.load(
    params.speedBumps.map((bump) => {
      const bbox = buildBBox(bump.line.geometry.coordinates)
      return { ...bbox, item: bump }
    })
  )

  // Padding in degrees (~11 meters) to expand lane bboxes so we don't miss
  // overlaps near edges due to lane width or geometric imprecision.
  const PAD = 0.0001

  // --- For each lane, query spatial indices and check only nearby elements ---

  for (const lane of params.lanes) {
    const laneBbox = buildBBox(lane.centerLine.geometry.coordinates)
    const searchBbox = {
      minX: laneBbox.minX - PAD,
      minY: laneBbox.minY - PAD,
      maxX: laneBbox.maxX + PAD,
      maxY: laneBbox.maxY + PAD,
    }

    // Lane vs Crosswalk
    for (const { item: crosswalk } of crosswalkTree.search(searchBbox)) {
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

    // Lane vs Signal stop line
    for (const { item: signal } of signalTree.search(searchBbox)) {
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

    // Lane vs StopSign
    for (const { item: stopSign } of stopSignTree.search(searchBbox)) {
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

    // Lane vs Junction
    for (const { item: junction } of junctionTree.search(searchBbox)) {
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

    // Lane vs ClearArea
    for (const { item: area } of clearAreaTree.search(searchBbox)) {
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

    // Lane vs SpeedBump
    for (const { item: bump } of speedBumpTree.search(searchBbox)) {
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
