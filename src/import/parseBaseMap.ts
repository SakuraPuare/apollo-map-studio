import { decodeMap } from '../proto/codec'
import { setGlobalProjection } from '../geo/projection'
import type { PointENU } from '../types/apollo-map'
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
import {
  BoundaryType,
  LaneDirection,
  LaneTurn,
  LaneType,
  RoadType,
  SignalType,
  StopSignType,
} from '../types/apollo-map'
import type { Feature, LineString, Polygon, Point } from 'geojson'
import { decodeToolMeta } from '../drawing/metadata/coordCodec'
import { detectToolFromGeometry } from '../drawing/metadata/geometryDetector'
import type { ToolMeta } from '../drawing/primitives/types'

/**
 * Decode a proto bytes field (base64 string from protobufjs toObject or Uint8Array) to a UTF-8 string.
 */
function bytesToString(value: unknown): string {
  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value)
  }
  if (typeof value === 'string' && value.length > 0) {
    try {
      return new TextDecoder().decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)))
    } catch {
      return value
    }
  }
  return ''
}

interface ParsedMapState {
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
}

/**
 * Extract projection parameters from a proj4 string.
 * e.g. "+proj=tmerc +lat_0=37.4 +lon_0=-122.0 +k=1 +ellps=WGS84 +no_defs"
 */
function parseProjString(projStr: string): { lat: number; lon: number } | null {
  const lat0Match = projStr.match(/\+lat_0=([-\d.]+)/)
  const lon0Match = projStr.match(/\+lon_0=([-\d.]+)/)
  if (!lat0Match || !lon0Match) return null
  return { lat: parseFloat(lat0Match[1]), lon: parseFloat(lon0Match[1]) }
}

/**
 * Process polygon ENU points with three-level metadata recovery:
 * Level 1: mantissa decoding → Level 2: geometric heuristic → Level 3: default 'polygon'.
 */
function processPolygonPoints(
  points: PointENU[],
  toLngLat: (x: number, y: number) => [number, number]
): { coords: [number, number][]; toolMeta: ToolMeta } {
  // Level 1: Try mantissa decoding
  const decoded = decodeToolMeta(points)
  if (decoded) {
    const coords = decoded.cleanPoints.map((p) => toLngLat(p.x, p.y))
    return { coords, toolMeta: decoded.meta }
  }

  // No encoding — convert raw points
  const coords = points.map((p) => toLngLat(p.x, p.y))

  // Level 2+3: Geometric heuristic detection (returns default 'polygon' if no pattern detected)
  const closedCoords = [...coords, coords[0]]
  const tempPolygon: Feature<Polygon> = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [closedCoords] },
  }
  const toolMeta = detectToolFromGeometry('Polygon', tempPolygon)
  return { coords, toolMeta }
}

/**
 * Process curve ENU points with three-level metadata recovery:
 * Level 1: mantissa decoding → Level 2/3: default 'line'.
 */
function processCurvePoints(
  points: PointENU[],
  toLngLat: (x: number, y: number) => [number, number]
): { coords: [number, number][]; toolMeta: ToolMeta } {
  if (points.length === 0) {
    return { coords: [], toolMeta: { tool: 'line' } }
  }

  // Level 1: Try mantissa decoding
  const decoded = decodeToolMeta(points)
  if (decoded) {
    const coords = decoded.cleanPoints.map((p) => toLngLat(p.x, p.y))
    return { coords, toolMeta: decoded.meta }
  }

  // No encoding — convert raw points, default to line tool
  const coords = points.map((p) => toLngLat(p.x, p.y))
  return { coords, toolMeta: detectToolFromGeometry('LineString') }
}

/**
 * Parse a binary base_map.bin buffer and return editor state.
 */
export async function parseBaseMap(buffer: Uint8Array): Promise<ParsedMapState> {
  const map = await decodeMap(buffer)

  // Extract projection from header
  const projStr = map.header?.projection?.proj ?? ''
  const originCoords = parseProjString(projStr)
  const originLat = originCoords?.lat ?? 0
  const originLon = originCoords?.lon ?? 0

  const proj = setGlobalProjection(originLat, originLon)

  const project: ProjectConfig = {
    name: bytesToString(map.header?.district) || 'Imported Map',
    originLat,
    originLon,
    version: bytesToString(map.header?.version) || '1.0.0',
    date: bytesToString(map.header?.date) || new Date().toISOString().slice(0, 10),
  }

  // Parse lanes
  const lanes: LaneFeature[] = map.lane.map((lane) => {
    const rawPoints: PointENU[] = lane.centralCurve.segment.flatMap(
      (seg) => seg.lineSegment?.point ?? []
    )
    const { coords, toolMeta: centerToolMeta } = processCurvePoints(rawPoints, proj.toLngLat)

    const centerLine: Feature<LineString> = {
      type: 'Feature',
      id: lane.id.id,
      properties: { _toolMeta: centerToolMeta },
      geometry: { type: 'LineString', coordinates: coords },
    }

    // Estimate width from left/right sample
    const widthSamples = lane.leftSample.map((s, i) => {
      const rightS = lane.rightSample[i]
      return s.width + (rightS?.width ?? s.width)
    })
    const width =
      widthSamples.length > 0 ? widthSamples.reduce((a, b) => a + b, 0) / widthSamples.length : 3.75

    // Extract boundary types
    const leftBoundaryType =
      (lane.leftBoundary.boundaryType[0]?.types[0] as BoundaryType) ?? BoundaryType.SOLID_WHITE
    const rightBoundaryType =
      (lane.rightBoundary.boundaryType[0]?.types[0] as BoundaryType) ?? BoundaryType.SOLID_WHITE

    return {
      id: lane.id.id,
      type: 'lane' as const,
      centerLine,
      width,
      speedLimit: lane.speedLimit ?? 13.89,
      laneType: (lane.type as LaneType) ?? LaneType.CITY_DRIVING,
      turn: (lane.turn as LaneTurn) ?? LaneTurn.NO_TURN,
      direction: (lane.direction as LaneDirection) ?? LaneDirection.FORWARD,
      leftBoundaryType,
      rightBoundaryType,
      predecessorIds: lane.predecessorId.map((id) => id.id),
      successorIds: lane.successorId.map((id) => id.id),
      leftNeighborIds: lane.leftNeighborForwardLaneId.map((id) => id.id),
      rightNeighborIds: lane.rightNeighborForwardLaneId.map((id) => id.id),
      junctionId: lane.junctionId?.id,
    }
  })

  // Parse junctions
  const junctions: JunctionFeature[] = map.junction.map((j) => {
    const { coords, toolMeta } = processPolygonPoints(j.polygon.point, proj.toLngLat)
    return {
      id: j.id.id,
      type: 'junction' as const,
      polygon: {
        type: 'Feature',
        id: j.id.id,
        properties: { _toolMeta: toolMeta },
        geometry: {
          type: 'Polygon',
          coordinates: [[...coords, coords[0]].map(([lng, lat]) => [lng, lat])],
        },
      } as Feature<Polygon>,
    }
  })

  // Parse crosswalks
  const crosswalks: CrosswalkFeature[] = map.crosswalk.map((cw) => {
    const { coords, toolMeta } = processPolygonPoints(cw.polygon.point, proj.toLngLat)
    return {
      id: cw.id.id,
      type: 'crosswalk' as const,
      polygon: {
        type: 'Feature',
        id: cw.id.id,
        properties: { _toolMeta: toolMeta },
        geometry: {
          type: 'Polygon',
          coordinates: [[...coords, coords[0]].map(([lng, lat]) => [lng, lat])],
        },
      } as Feature<Polygon>,
    }
  })

  // Parse stop signs
  const stopSigns: StopSignFeature[] = map.stopSign.map((ss) => {
    const rawPoints: PointENU[] =
      ss.stopLine[0]?.segment.flatMap((seg) => seg.lineSegment?.point ?? []) ?? []
    const { coords: stopLineCoords, toolMeta } = processCurvePoints(rawPoints, proj.toLngLat)
    return {
      id: ss.id.id,
      type: 'stop_sign' as const,
      stopLine: {
        type: 'Feature',
        id: ss.id.id,
        properties: { _toolMeta: toolMeta },
        geometry: { type: 'LineString', coordinates: stopLineCoords },
      } as Feature<LineString>,
      stopSignType: (ss.type as StopSignType) ?? StopSignType.ONE_WAY,
    }
  })

  // Parse clear areas
  const clearAreas: ClearAreaFeature[] = map.clearArea.map((ca) => {
    const { coords, toolMeta } = processPolygonPoints(ca.polygon.point, proj.toLngLat)
    return {
      id: ca.id.id,
      type: 'clear_area' as const,
      polygon: {
        type: 'Feature',
        id: ca.id.id,
        properties: { _toolMeta: toolMeta },
        geometry: {
          type: 'Polygon',
          coordinates: [[...coords, coords[0]].map(([lng, lat]) => [lng, lat])],
        },
      } as Feature<Polygon>,
    }
  })

  // Parse speed bumps
  const speedBumps: SpeedBumpFeature[] = map.speedBump.map((sb) => {
    const rawPoints: PointENU[] =
      sb.position[0]?.segment.flatMap((seg) => seg.lineSegment?.point ?? []) ?? []
    const { coords, toolMeta } = processCurvePoints(rawPoints, proj.toLngLat)
    return {
      id: sb.id.id,
      type: 'speed_bump' as const,
      line: {
        type: 'Feature',
        id: sb.id.id,
        properties: { _toolMeta: toolMeta },
        geometry: { type: 'LineString', coordinates: coords },
      } as Feature<LineString>,
    }
  })

  // Parse parking spaces
  const parkingSpaces: ParkingSpaceFeature[] = map.parkingSpace.map((ps) => {
    const { coords, toolMeta } = processPolygonPoints(ps.polygon.point, proj.toLngLat)
    return {
      id: ps.id.id,
      type: 'parking_space' as const,
      polygon: {
        type: 'Feature',
        id: ps.id.id,
        properties: { _toolMeta: toolMeta },
        geometry: {
          type: 'Polygon',
          coordinates: [[...coords, coords[0]].map(([lng, lat]) => [lng, lat])],
        },
      } as Feature<Polygon>,
      heading: ps.heading,
    }
  })

  // Signals - parse stopLine with metadata recovery, derive position from midpoint
  const signals: SignalFeature[] =
    map.signal?.map((s) => {
      const rawPoints: PointENU[] =
        s.stopLine[0]?.segment.flatMap((seg) => seg.lineSegment?.point ?? []) ?? []
      const { coords: stopLineCoords, toolMeta: stopLineToolMeta } = processCurvePoints(
        rawPoints,
        proj.toLngLat
      )

      const fallbackCoord: [number, number] = [originLon, originLat]
      const midIdx = Math.floor(stopLineCoords.length / 2)
      const center = stopLineCoords[midIdx] ?? fallbackCoord

      return {
        id: s.id.id,
        type: 'signal' as const,
        position: {
          type: 'Feature',
          id: s.id.id,
          properties: {},
          geometry: { type: 'Point', coordinates: center },
        } as Feature<Point>,
        stopLine: {
          type: 'Feature',
          id: s.id.id,
          properties: { _toolMeta: stopLineToolMeta },
          geometry: { type: 'LineString', coordinates: stopLineCoords },
        } as Feature<LineString>,
        signalType: (s.type as SignalType) ?? SignalType.MIX_3_VERTICAL,
      }
    }) ?? []

  // Parse roads and assign roadId to lanes
  const laneRoadMap = new Map<string, string>()
  const allRoadDefs: RoadDefinition[] = []

  for (const road of map.road) {
    const roadId = road.id.id
    for (const section of road.section) {
      for (const laneRef of section.laneId) {
        laneRoadMap.set(laneRef.id, roadId)
      }
    }
    allRoadDefs.push({
      id: roadId,
      name: roadId,
      type: (road.type as RoadType) ?? RoadType.CITY_ROAD,
    })
  }

  for (const lane of lanes) {
    const roadId = laneRoadMap.get(lane.id)
    if (roadId) {
      lane.roadId = roadId
    }
  }

  const roads = allRoadDefs
  console.log(
    `[Import] ${map.road.length} roads, ${map.lane.length} lanes, ${map.junction.length} junctions, ${map.signal?.length ?? 0} signals`
  )

  return {
    project,
    lanes,
    junctions,
    signals,
    stopSigns,
    crosswalks,
    clearAreas,
    speedBumps,
    parkingSpaces,
    roads,
  }
}
