/**
 * Creates a MapElement from a completed drawing.
 * Extracted from MapEditor.tsx's draw.create handler.
 */

import type { Feature } from 'geojson'
import type { DrawIntent, MapElement, LaneFeature } from '../types/editor'
import { ElementType, ShapeType } from '../types/shapes'
import { BoundaryType, LaneDirection, LaneTurn, LaneType } from '../types/apollo-map'
import { smoothPolyline } from '../geo/smoothCurve'
import type { BezierAnchor } from '../geo/bezier'

let idCounter = 0
export function nextId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++idCounter}`
}

export function createElementFromDraw(intent: DrawIntent, feature: Feature): MapElement | null {
  switch (intent.elementType) {
    case ElementType.Lane:
      return createLane(feature, intent.shape)
    case ElementType.Junction:
      return createPolygonElement(feature, 'junction')
    case ElementType.Crosswalk:
      return createPolygonElement(feature, 'crosswalk')
    case ElementType.ClearArea:
      return createPolygonElement(feature, 'clear_area')
    case ElementType.ParkingSpace:
      return createParkingSpace(feature)
    case ElementType.SpeedBump:
      return createLineElement(feature, 'speed_bump')
    case ElementType.Signal:
      return createSignal(feature)
    case ElementType.StopSign:
      return createStopSign(feature)
    default:
      return null
  }
}

function createLane(feature: Feature, shape: ShapeType): LaneFeature | null {
  if (feature.geometry.type !== 'LineString') return null

  let centerLine = feature as Feature<import('geojson').LineString>
  let bezierAnchors: BezierAnchor[] | undefined

  if (shape === ShapeType.Curve) {
    const rawAnchors = (feature.properties as Record<string, unknown> | null)?._bezierAnchors
    if (typeof rawAnchors === 'string') {
      // DrawBezierMode fired draw.create with _bezierAnchors — coordinates are already
      // flattened from the bezier; use them as-is and store the anchor data.
      bezierAnchors = JSON.parse(rawAnchors) as BezierAnchor[]
    } else {
      // Fallback: apply Chaikin smoothing for curves without bezier data.
      const smoothed = smoothPolyline(centerLine.geometry.coordinates)
      centerLine = {
        ...centerLine,
        geometry: { ...centerLine.geometry, coordinates: smoothed },
      }
    }
  }

  return {
    id: nextId('lane'),
    type: 'lane',
    centerLine,
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
    ...(bezierAnchors !== undefined && { bezierAnchors }),
  }
}

function createPolygonElement(
  feature: Feature,
  type: 'junction' | 'crosswalk' | 'clear_area'
): MapElement | null {
  if (feature.geometry.type !== 'Polygon') return null
  return {
    id: nextId(type),
    type,
    polygon: feature as Feature<import('geojson').Polygon>,
  }
}

function createParkingSpace(feature: Feature): MapElement | null {
  if (feature.geometry.type !== 'Polygon') return null
  return {
    id: nextId('parking_space'),
    type: 'parking_space',
    polygon: feature as Feature<import('geojson').Polygon>,
    heading: (feature.properties as Record<string, unknown> | null)?._heading as number | undefined,
  }
}

function createLineElement(feature: Feature, type: 'speed_bump'): MapElement | null {
  if (feature.geometry.type !== 'LineString') return null
  return {
    id: nextId(type),
    type,
    line: feature as Feature<import('geojson').LineString>,
  }
}

function createSignal(feature: Feature): MapElement | null {
  if (feature.geometry.type !== 'LineString') return null
  const coords = feature.geometry.coordinates
  const midIdx = Math.floor(coords.length / 2)
  return {
    id: nextId('signal'),
    type: 'signal',
    stopLine: feature as Feature<import('geojson').LineString>,
    position: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords[midIdx] },
      properties: null,
    } as Feature<import('geojson').Point>,
    signalType: 5,
  }
}

function createStopSign(feature: Feature): MapElement | null {
  if (feature.geometry.type !== 'LineString') return null
  return {
    id: nextId('stop_sign'),
    type: 'stop_sign',
    stopLine: feature as Feature<import('geojson').LineString>,
    stopSignType: 1,
  }
}
