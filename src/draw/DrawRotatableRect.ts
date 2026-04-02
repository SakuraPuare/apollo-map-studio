/**
 * Custom MapboxDraw mode: draw a rotatable rectangle.
 *
 * 3-click interaction:
 *   1. Click to place the midpoint of one edge.
 *   2. Click to place the midpoint of the opposite edge (defines length + rotation).
 *   3. Move mouse perpendicular + click to set width.
 *
 * Produces a GeoJSON Polygon feature with properties:
 *   _heading  — rotation angle (degrees, bearing of edge1→edge2)
 *   _length   — distance between the two edge midpoints (meters)
 *   _width    — perpendicular extent (meters)
 */

import * as turf from '@turf/turf'
import type { Position } from 'geojson'

interface RectState {
  /** Phase 0: waiting for first click, 1: first edge set, 2: both edges set (setting width) */
  phase: number
  edgeMid1: Position | null
  edgeMid2: Position | null
  currentPos: Position | null
}

function computeRectCoords(edgeMid1: Position, edgeMid2: Position, halfWidth: number): Position[] {
  const bearing = turf.bearing(turf.point(edgeMid1), turf.point(edgeMid2))
  const perpBearing = bearing + 90

  const c1 = turf.destination(turf.point(edgeMid1), halfWidth, perpBearing, { units: 'meters' })
    .geometry.coordinates
  const c2 = turf.destination(turf.point(edgeMid1), halfWidth, perpBearing + 180, {
    units: 'meters',
  }).geometry.coordinates
  const c3 = turf.destination(turf.point(edgeMid2), halfWidth, perpBearing + 180, {
    units: 'meters',
  }).geometry.coordinates
  const c4 = turf.destination(turf.point(edgeMid2), halfWidth, perpBearing, { units: 'meters' })
    .geometry.coordinates

  return [c1, c2, c3, c4, c1]
}

function perpendicularDistance(edgeMid1: Position, edgeMid2: Position, cursor: Position): number {
  // Project cursor onto the perpendicular of the edge1→edge2 line
  const bearing12 = turf.bearing(turf.point(edgeMid1), turf.point(edgeMid2))
  const bearingToCursor = turf.bearing(turf.point(edgeMid1), turf.point(cursor))
  const distToCursor = turf.distance(turf.point(edgeMid1), turf.point(cursor), {
    units: 'meters',
  })
  const angleDiff = ((bearingToCursor - bearing12) * Math.PI) / 180
  return Math.abs(distToCursor * Math.sin(angleDiff))
}

const DrawRotatableRect = {
  onSetup(): RectState {
    return { phase: 0, edgeMid1: null, edgeMid2: null, currentPos: null }
  },

  onClick(state: RectState, e: { lngLat: { lng: number; lat: number } }) {
    const pos: Position = [e.lngLat.lng, e.lngLat.lat]

    if (state.phase === 0) {
      state.edgeMid1 = pos
      state.phase = 1
      return
    }

    if (state.phase === 1) {
      state.edgeMid2 = pos
      state.phase = 2
      return
    }

    if (state.phase === 2 && state.edgeMid1 && state.edgeMid2) {
      const halfWidth = Math.max(perpendicularDistance(state.edgeMid1, state.edgeMid2, pos), 0.5)
      const coords = computeRectCoords(state.edgeMid1, state.edgeMid2, halfWidth)
      const heading = turf.bearing(turf.point(state.edgeMid1), turf.point(state.edgeMid2))
      const length = turf.distance(turf.point(state.edgeMid1), turf.point(state.edgeMid2), {
        units: 'meters',
      })

      const feature = {
        id: `rect_${Date.now()}`,
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [coords],
        },
        properties: {
          _heading: heading,
          _length: length,
          _width: halfWidth * 2,
        },
      }

      ;(this as unknown as { newFeature: (f: unknown) => void }).newFeature?.(feature)

      // Fire draw.create event via the draw instance
      ;(this as unknown as { map: { fire: (event: string, data: unknown) => void } }).map?.fire(
        'draw.create',
        { features: [feature] }
      )
      ;(this as unknown as { changeMode: (mode: string) => void }).changeMode('simple_select')
    }
  },

  onMouseMove(state: RectState, e: { lngLat: { lng: number; lat: number } }) {
    state.currentPos = [e.lngLat.lng, e.lngLat.lat]
  },

  onKeyUp(state: RectState, e: { key: string }) {
    if (e.key === 'Escape') {
      ;(this as unknown as { changeMode: (mode: string) => void }).changeMode('simple_select')
    }
  },

  toDisplayFeatures(state: RectState, geojson: unknown, display: (feature: unknown) => void) {
    // Phase 1: show first point
    if (state.phase >= 1 && state.edgeMid1) {
      display({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: state.edgeMid1 },
        properties: { meta: 'vertex', active: 'true' },
      })
    }

    // Phase 1 + mouse: show line preview from edgeMid1 to cursor
    if (state.phase === 1 && state.edgeMid1 && state.currentPos) {
      display({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [state.edgeMid1, state.currentPos],
        },
        properties: { meta: 'feature', active: 'true' },
      })
      display({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: state.currentPos },
        properties: { meta: 'vertex', active: 'true' },
      })
    }

    // Phase 2: show second point
    if (state.phase >= 2 && state.edgeMid2) {
      display({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: state.edgeMid2 },
        properties: { meta: 'vertex', active: 'true' },
      })
    }

    // Phase 2 + mouse: show rectangle preview
    if (state.phase === 2 && state.edgeMid1 && state.edgeMid2 && state.currentPos) {
      const halfWidth = Math.max(
        perpendicularDistance(state.edgeMid1, state.edgeMid2, state.currentPos),
        0.5
      )
      const coords = computeRectCoords(state.edgeMid1, state.edgeMid2, halfWidth)
      display({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] },
        properties: { meta: 'feature', active: 'true' },
      })
    }
  },

  onStop() {
    // cleanup
  },

  onTrash() {
    ;(this as unknown as { changeMode: (mode: string) => void }).changeMode('simple_select')
  },
}

export default DrawRotatableRect
