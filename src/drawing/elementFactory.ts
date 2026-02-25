import type { Feature, LineString, Point, Polygon } from 'geojson'
import type { PrimitiveResult, ToolMeta } from './primitives/types'
import type {
  MapElement,
  LaneFeature,
  JunctionFeature,
  CrosswalkFeature,
  ClearAreaFeature,
  SpeedBumpFeature,
  ParkingSpaceFeature,
  SignalFeature,
  StopSignFeature,
} from '../types/editor'
import {
  BoundaryType,
  LaneDirection,
  LaneTurn,
  LaneType,
  SignalType,
  StopSignType,
} from '../types/apollo-map'

let counter = 0

function nextId(prefix: string): string {
  counter++
  return `${prefix}_${Date.now()}_${counter}`
}

function toLineStringFeature(geom: GeoJSON.Geometry, meta?: ToolMeta): Feature<LineString> {
  if (geom.type !== 'LineString') throw new Error(`Expected LineString, got ${geom.type}`)
  return {
    type: 'Feature',
    geometry: geom as LineString,
    properties: meta ? { _toolMeta: meta } : {},
  }
}

function toPolygonFeature(geom: GeoJSON.Geometry, meta?: ToolMeta): Feature<Polygon> {
  if (geom.type !== 'Polygon') throw new Error(`Expected Polygon, got ${geom.type}`)
  return {
    type: 'Feature',
    geometry: geom as Polygon,
    properties: meta ? { _toolMeta: meta } : {},
  }
}

function toPointFeature(geom: GeoJSON.Geometry): Feature<Point> {
  if (geom.type !== 'Point') throw new Error(`Expected Point, got ${geom.type}`)
  return {
    type: 'Feature',
    geometry: geom as Point,
    properties: {},
  }
}

function deriveSignalMidpoint(stopLine: Feature<LineString>): Feature<Point> {
  const coords = stopLine.geometry.coordinates
  const midIdx = Math.floor(coords.length / 2)
  const mid = coords[midIdx] ?? coords[0]
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: mid },
    properties: {},
  }
}

/**
 * Create a MapElement from completed primitive tool results.
 */
export function createElementFromResults(
  elementType: MapElement['type'],
  results: PrimitiveResult[]
): MapElement {
  switch (elementType) {
    case 'lane': {
      const r = results[0]
      return {
        id: nextId('lane'),
        type: 'lane',
        centerLine: toLineStringFeature(r.geometry, r.meta),
        width: 3.75,
        speedLimit: 13.89,
        laneType: LaneType.CITY_DRIVING,
        turn: LaneTurn.NO_TURN,
        direction: LaneDirection.FORWARD,
        leftBoundaryType: BoundaryType.DOTTED_WHITE,
        rightBoundaryType: BoundaryType.DOTTED_WHITE,
        predecessorIds: [],
        successorIds: [],
        leftNeighborIds: [],
        rightNeighborIds: [],
      } satisfies LaneFeature
    }

    case 'junction':
      return {
        id: nextId('junction'),
        type: 'junction',
        polygon: toPolygonFeature(results[0].geometry, results[0].meta),
      } satisfies JunctionFeature

    case 'crosswalk':
      return {
        id: nextId('crosswalk'),
        type: 'crosswalk',
        polygon: toPolygonFeature(results[0].geometry, results[0].meta),
      } satisfies CrosswalkFeature

    case 'clear_area':
      return {
        id: nextId('clear_area'),
        type: 'clear_area',
        polygon: toPolygonFeature(results[0].geometry, results[0].meta),
      } satisfies ClearAreaFeature

    case 'speed_bump':
      return {
        id: nextId('speed_bump'),
        type: 'speed_bump',
        line: toLineStringFeature(results[0].geometry, results[0].meta),
      } satisfies SpeedBumpFeature

    case 'parking_space':
      return {
        id: nextId('parking_space'),
        type: 'parking_space',
        polygon: toPolygonFeature(results[0].geometry, results[0].meta),
      } satisfies ParkingSpaceFeature

    case 'signal': {
      const stopLine = toLineStringFeature(results[0].geometry, results[0].meta)
      const position = results[1]
        ? toPointFeature(results[1].geometry)
        : deriveSignalMidpoint(stopLine)
      return {
        id: nextId('signal'),
        type: 'signal',
        stopLine,
        position,
        signalType: SignalType.MIX_3_VERTICAL,
      } satisfies SignalFeature
    }

    case 'stop_sign':
      return {
        id: nextId('stop_sign'),
        type: 'stop_sign',
        stopLine: toLineStringFeature(results[0].geometry, results[0].meta),
        stopSignType: StopSignType.ONE_WAY,
      } satisfies StopSignFeature

    default:
      throw new Error(`Unknown element type: ${elementType}`)
  }
}
