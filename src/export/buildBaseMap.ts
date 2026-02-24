import * as turf from '@turf/turf'
import type { Position } from 'geojson'
import { lngLatToENU, getGlobalProjection } from '../geo/projection'
import { computeBoundaries, computeLaneSamples, computeStartHeading } from '../geo/laneGeometry'
import { computeAllOverlaps } from '../geo/overlapCalc'
import type {
  ApolloMap,
  ApolloLane,
  ApolloRoad,
  ApolloJunction,
  ApolloSignal,
  ApolloStopSign,
  ApolloCrosswalk,
  ApolloClearArea,
  ApolloSpeedBump,
  ApolloParkingSpace,
  Curve,
  PointENU,
  Polygon,
  LaneBoundary,
  RoadSection,
} from '../types/apollo-map'
import { BoundaryType } from '../types/apollo-map'
import type {
  LaneFeature,
  JunctionFeature,
  SignalFeature,
  StopSignFeature,
  CrosswalkFeature,
  ClearAreaFeature,
  SpeedBumpFeature,
  ParkingSpaceFeature,
  RoadDefinition,
  ProjectConfig,
} from '../types/editor'

/**
 * Convert an array of WGS84 positions to PointENU array using the global projection.
 */
function positionsToENU(positions: Position[]): PointENU[] {
  return positions.map(([lng, lat]) => lngLatToENU(lng, lat))
}

/**
 * Build a Curve proto object from an array of PointENU points.
 */
function buildCurve(points: PointENU[], heading = 0): Curve {
  if (points.length < 2) return { segment: [] }

  // Compute segment length from point distances
  let length = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    length += Math.sqrt(dx * dx + dy * dy)
  }

  return {
    segment: [
      {
        lineSegment: { point: points },
        s: 0,
        startPosition: points[0],
        heading,
        length,
      },
    ],
  }
}

/**
 * Build LaneBoundary proto from a boundary line.
 */
function buildLaneBoundary(
  positions: Position[],
  boundaryType: BoundaryType,
  isVirtual = false
): LaneBoundary {
  const points = positionsToENU(positions)
  let length = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    length += Math.sqrt(dx * dx + dy * dy)
  }

  const curve = buildCurve(points)
  return {
    curve,
    length,
    virtual: isVirtual,
    boundaryType: [
      {
        s: 0,
        types: [boundaryType],
      },
    ],
  }
}

/**
 * Build a Polygon proto from WGS84 ring coordinates.
 */
function buildPolygon(coords: Position[]): Polygon {
  return { point: positionsToENU(coords) }
}

/**
 * Build a Curve from a GeoJSON LineString in WGS84.
 */
function linestringToCurve(coords: Position[]): Curve {
  const points = positionsToENU(coords)
  if (points.length < 2) return { segment: [] }
  const heading = computeStartHeading({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: null,
  })
  return buildCurve(points, heading)
}

/**
 * Build an ApolloLane proto from a LaneFeature.
 */
function buildLane(lane: LaneFeature, overlapIds: string[]): ApolloLane {
  const centerCoords = lane.centerLine.geometry.coordinates
  const centerENU = positionsToENU(centerCoords)
  const heading = computeStartHeading(lane.centerLine)
  const centralCurve = buildCurve(centerENU, heading)
  const laneLength = turf.length(lane.centerLine, { units: 'meters' })

  const { left: leftBoundaryLine, right: rightBoundaryLine } = computeBoundaries(
    lane.centerLine,
    lane.width
  )
  const { leftSample, rightSample } = computeLaneSamples(lane.centerLine, lane.width)

  const leftBoundary = buildLaneBoundary(
    leftBoundaryLine.geometry.coordinates,
    lane.leftBoundaryType
  )
  const rightBoundary = buildLaneBoundary(
    rightBoundaryLine.geometry.coordinates,
    lane.rightBoundaryType
  )

  return {
    id: { id: lane.id },
    centralCurve,
    leftBoundary,
    rightBoundary,
    length: laneLength,
    speedLimit: lane.speedLimit,
    overlapId: overlapIds.map((id) => ({ id })),
    predecessorId: lane.predecessorIds.map((id) => ({ id })),
    successorId: lane.successorIds.map((id) => ({ id })),
    leftNeighborForwardLaneId: lane.leftNeighborIds.map((id) => ({ id })),
    rightNeighborForwardLaneId: lane.rightNeighborIds.map((id) => ({ id })),
    leftNeighborReverseLaneId: [],
    rightNeighborReverseLaneId: [],
    type: lane.laneType,
    turn: lane.turn,
    direction: lane.direction,
    junctionId: lane.junctionId ? { id: lane.junctionId } : undefined,
    leftSample,
    rightSample,
    leftRoadSample: leftSample, // approximate: use lane boundary as road boundary
    rightRoadSample: rightSample,
    selfReverseLaneId: [],
  }
}

/**
 * Group lanes into roads by road assignment or connectivity.
 * Lanes with the same roadId are in the same road.
 * Lanes without a roadId get their own single-section road.
 */
function buildRoads(lanes: LaneFeature[], roadDefs: RoadDefinition[]): ApolloRoad[] {
  const roadDefMap = new Map<string, RoadDefinition>()
  for (const rd of roadDefs) {
    roadDefMap.set(rd.id, rd)
  }

  const roadLanesMap = new Map<string, LaneFeature[]>()
  const unassignedLanes: LaneFeature[] = []

  for (const lane of lanes) {
    if (lane.roadId && roadDefMap.has(lane.roadId)) {
      if (!roadLanesMap.has(lane.roadId)) roadLanesMap.set(lane.roadId, [])
      roadLanesMap.get(lane.roadId)!.push(lane)
    } else {
      unassignedLanes.push(lane)
    }
  }

  const roads: ApolloRoad[] = []

  for (const [roadId, roadLanes] of roadLanesMap) {
    const def = roadDefMap.get(roadId)!
    const section: RoadSection = {
      id: { id: `${roadId}_section_0` },
      laneId: roadLanes.map((l) => ({ id: l.id })),
    }
    const junctionIds = new Set(roadLanes.map((l) => l.junctionId).filter(Boolean))
    const junctionId = junctionIds.size === 1 ? { id: [...junctionIds][0]! } : undefined

    roads.push({
      id: { id: roadId },
      section: [section],
      junctionId,
      type: def.type,
    })
  }

  for (const lane of unassignedLanes) {
    const autoRoadId = `road_${lane.id}`
    const section: RoadSection = {
      id: { id: `${autoRoadId}_section_0` },
      laneId: [{ id: lane.id }],
    }
    roads.push({
      id: { id: autoRoadId },
      section: [section],
      junctionId: lane.junctionId ? { id: lane.junctionId } : undefined,
      type: 2, // CITY_ROAD default
    })
  }

  return roads
}

/**
 * Build the complete Apollo Map protobuf object from editor state.
 */
export async function buildBaseMap(params: {
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
}): Promise<ApolloMap> {
  const proj = getGlobalProjection()
  if (!proj) throw new Error('Projection not initialized')

  // 1. Compute overlaps
  const overlapResults = computeAllOverlaps({
    lanes: params.lanes,
    crosswalks: params.crosswalks,
    signals: params.signals,
    stopSigns: params.stopSigns,
    junctions: params.junctions,
    clearAreas: params.clearAreas,
    speedBumps: params.speedBumps,
  })

  // Build lookup: laneId -> overlap IDs
  const laneOverlapMap: Record<string, string[]> = {}
  for (const result of overlapResults) {
    for (const obj of result.overlap.object) {
      if (obj.laneOverlapInfo) {
        const laneId = obj.id.id
        if (!laneOverlapMap[laneId]) laneOverlapMap[laneId] = []
        laneOverlapMap[laneId].push(result.overlap.id.id)
      }
    }
  }

  // 2. Build lanes
  const lanes: ApolloLane[] = params.lanes.map((lane) =>
    buildLane(lane, laneOverlapMap[lane.id] ?? [])
  )

  // 3. Build roads
  const roads = buildRoads(params.lanes, params.roads)

  // 4. Build junctions
  const junctions: ApolloJunction[] = params.junctions.map((j) => ({
    id: { id: j.id },
    polygon: buildPolygon(j.polygon.geometry.coordinates[0]),
    overlapId: [], // populated from overlap results
  }))

  // 5. Build signals
  const signals: ApolloSignal[] = params.signals.map((s) => ({
    id: { id: s.id },
    boundary: {
      point: positionsToENU(
        s.position.geometry.coordinates ? [s.position.geometry.coordinates as [number, number]] : []
      ),
    },
    subsignal: [],
    overlapId: [],
    type: s.signalType,
    stopLine: [linestringToCurve(s.stopLine.geometry.coordinates)],
  }))

  // 6. Build stop signs
  const stopSigns: ApolloStopSign[] = params.stopSigns.map((ss) => ({
    id: { id: ss.id },
    stopLine: [linestringToCurve(ss.stopLine.geometry.coordinates)],
    overlapId: [],
    type: ss.stopSignType,
  }))

  // 7. Build crosswalks
  const crosswalks: ApolloCrosswalk[] = params.crosswalks.map((cw) => ({
    id: { id: cw.id },
    polygon: buildPolygon(cw.polygon.geometry.coordinates[0]),
    overlapId: [],
  }))

  // 8. Build clear areas
  const clearAreas: ApolloClearArea[] = params.clearAreas.map((ca) => ({
    id: { id: ca.id },
    polygon: buildPolygon(ca.polygon.geometry.coordinates[0]),
    overlapId: [],
  }))

  // 9. Build speed bumps
  const speedBumps: ApolloSpeedBump[] = params.speedBumps.map((sb) => ({
    id: { id: sb.id },
    position: [linestringToCurve(sb.line.geometry.coordinates)],
    overlapId: [],
  }))

  // 10. Build parking spaces
  const parkingSpaces: ApolloParkingSpace[] = params.parkingSpaces.map((ps) => ({
    id: { id: ps.id },
    polygon: buildPolygon(ps.polygon.geometry.coordinates[0]),
    overlapId: [],
    heading: ps.heading,
  }))

  // 11. Compute bounding box from all lane center lines
  let minLon = Infinity,
    maxLon = -Infinity
  let minLat = Infinity,
    maxLat = -Infinity
  for (const lane of params.lanes) {
    for (const [lng, lat] of lane.centerLine.geometry.coordinates) {
      minLon = Math.min(minLon, lng)
      maxLon = Math.max(maxLon, lng)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    }
  }

  return {
    header: {
      version: params.project.version,
      date: params.project.date,
      projection: { proj: proj.projString },
      district: params.project.name,
      left: isFinite(minLon) ? minLon : 0,
      top: isFinite(maxLat) ? maxLat : 0,
      right: isFinite(maxLon) ? maxLon : 0,
      bottom: isFinite(minLat) ? minLat : 0,
      vendor: 'Apollo Map Editor',
    },
    crosswalk: crosswalks,
    junction: junctions,
    lane: lanes,
    stopSign: stopSigns,
    signal: signals,
    overlap: overlapResults.map((r) => r.overlap),
    clearArea: clearAreas,
    speedBump: speedBumps,
    road: roads,
    parkingSpace: parkingSpaces,
  }
}
