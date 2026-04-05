/**
 * Custom MapboxDraw mode: Photoshop-style bezier pen tool.
 *
 * Interaction:
 *   - Click (no drag)      — Place corner anchor (no handles)
 *   - Click + drag         — Place smooth anchor, pull symmetric handles
 *   - Alt + drag on last   — Break handle symmetry, move handleOut independently
 *   - Mouse move           — Live preview bezier segment from last anchor to cursor
 *   - Backspace            — Remove last anchor
 *   - Enter / double-click — Finish: flatten to LineString, fire draw.create
 *   - Escape               — Cancel, return to simple_select
 */

import type { Position } from 'geojson'
import type { BezierAnchor } from '../geo/bezier'
import { flattenBezier, mirrorHandle } from '../geo/bezier'
import { useUIStore } from '../store/uiStore'

/** Drag detection threshold in screen pixels. */
const DRAG_THRESHOLD_PX = 3

/** Double-click detection: max ms between two mouseUp events. */
const DOUBLE_CLICK_MS = 350

/** Double-click detection: max px distance between two mouseUp positions. */
const DOUBLE_CLICK_PX = 6

interface BezierState {
  /** Confirmed anchors forming the bezier path so far. */
  anchors: BezierAnchor[]

  /** Current mouse position in geo coords (updated on every mouse move). */
  currentPos: Position | null

  /** Screen pixel position recorded at mouseDown, for click-vs-drag detection. */
  mouseDownScreenPt: { x: number; y: number } | null

  /** Geo position at mouseDown. */
  mouseDownGeoPos: Position | null

  /** Whether the user is currently dragging (mouse is down and moved past threshold). */
  isDragging: boolean

  /** Whether mouseDown created a pending anchor (not yet confirmed). */
  hasPendingAnchor: boolean

  /** Whether Alt key is held during drag (break symmetry mode). */
  altDrag: boolean

  /** Timestamp of last click (onClick), for double-click detection. */
  lastMouseUpTime: number

  /** Screen position of last click (onClick), for double-click detection. */
  lastMouseUpScreenPt: { x: number; y: number } | null

  /** Whether Alt key is currently held. */
  altKey: boolean

  /** Placeholder feature kept in draw store so toDisplayFeatures is called on every render. */
  placeholder: PlaceholderFeature | null
}

interface PlaceholderFeature {
  id: string
  changed: () => void
}

type DrawContext = {
  map: {
    fire: (event: string, data: unknown) => void
    project: (lngLat: { lng: number; lat: number }) => { x: number; y: number }
  }
  changeMode: (mode: string) => void
  updateUIClasses?: (opts?: { mouse?: string }) => void
  newFeature: (geojson: object) => PlaceholderFeature
  addFeature: (feature: PlaceholderFeature) => void
  deleteFeature: (ids: string[]) => void
}

function screenDist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Build a single bezier preview segment from the last confirmed anchor
 * to a virtual anchor at the cursor position (corner anchor with no handles).
 */
function buildPreviewSegment(lastAnchor: BezierAnchor, cursorPos: Position): Position[] {
  const virtualAnchor: BezierAnchor = {
    position: cursorPos,
    handleIn: null,
    handleOut: null,
    symmetric: false,
  }
  return flattenBezier([lastAnchor, virtualAnchor])
}

const DrawBezierMode = {
  onSetup(this: DrawContext): BezierState {
    this.updateUIClasses?.({ mouse: 'add' })
    const placeholder = this.newFeature({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [] },
    })
    this.addFeature(placeholder)
    return {
      anchors: [],
      currentPos: null,
      mouseDownScreenPt: null,
      mouseDownGeoPos: null,
      isDragging: false,
      hasPendingAnchor: false,
      altDrag: false,
      lastMouseUpTime: 0,
      lastMouseUpScreenPt: null,
      altKey: false,
      placeholder,
    }
  },

  /**
   * MapboxDraw calls onClick for simple clicks and onMouseUp ONLY for drags.
   * Anchor confirmation for non-drag clicks must happen here.
   */
  onClick(
    this: DrawContext,
    state: BezierState,
    e: { lngLat: { lng: number; lat: number }; originalEvent: MouseEvent }
  ) {
    const screenPt = this.map.project(e.lngLat)
    const now = Date.now()

    // Double-click: finish drawing. The second mouseDown already pushed a duplicate
    // anchor — pop it before finishing.
    if (
      state.lastMouseUpScreenPt &&
      now - state.lastMouseUpTime < DOUBLE_CLICK_MS &&
      screenDist(screenPt, state.lastMouseUpScreenPt) < DOUBLE_CLICK_PX
    ) {
      if (state.hasPendingAnchor && state.anchors.length > 1) {
        state.anchors.pop()
      }
      finishDrawing.call(this, state)
      state.mouseDownScreenPt = null
      state.lastMouseUpTime = 0
      state.lastMouseUpScreenPt = null
      return
    }

    // Single click: anchor was already pushed in onMouseDown with null handles. Confirm it.
    state.lastMouseUpTime = now
    state.lastMouseUpScreenPt = { x: screenPt.x, y: screenPt.y }
    state.mouseDownScreenPt = null
    state.mouseDownGeoPos = null
    state.isDragging = false
    state.hasPendingAnchor = false
    state.altDrag = false
  },

  onMouseDown(
    this: DrawContext,
    state: BezierState,
    e: { lngLat: { lng: number; lat: number }; originalEvent: MouseEvent }
  ) {
    const screenPt = this.map.project(e.lngLat)
    state.mouseDownScreenPt = { x: screenPt.x, y: screenPt.y }
    state.mouseDownGeoPos = [e.lngLat.lng, e.lngLat.lat]
    state.isDragging = false
    state.altDrag = state.altKey
    state.hasPendingAnchor = false

    // If Alt is held and we have at least one anchor, this is a handle-break drag
    // on the last anchor. Don't create a new pending anchor.
    if (state.altKey && state.anchors.length > 0) {
      state.hasPendingAnchor = false
      return
    }

    // Create a pending anchor at the mouseDown position (will be confirmed on mouseUp)
    const pendingAnchor: BezierAnchor = {
      position: [e.lngLat.lng, e.lngLat.lat],
      handleIn: null,
      handleOut: null,
      symmetric: false,
    }
    state.anchors.push(pendingAnchor)
    state.hasPendingAnchor = true
  },

  onMouseMove(
    this: DrawContext,
    state: BezierState,
    e: { lngLat: { lng: number; lat: number }; originalEvent: MouseEvent }
  ) {
    const geoPos: Position = [e.lngLat.lng, e.lngLat.lat]
    state.currentPos = geoPos
    state.placeholder?.changed()

    // If mouse button is not pressed (no mouseDownScreenPt), this is just a hover preview
    if (!state.mouseDownScreenPt) return

    const screenPt = this.map.project(e.lngLat)

    // Check drag threshold
    if (!state.isDragging) {
      if (screenDist(screenPt, state.mouseDownScreenPt) > DRAG_THRESHOLD_PX) {
        state.isDragging = true
      } else {
        return
      }
    }

    // --- Dragging ---

    if (state.altDrag && state.anchors.length > 0) {
      // Alt-drag: break symmetry on last anchor's handleOut
      const last = state.anchors[state.anchors.length - 1]
      last.symmetric = false
      last.handleOut = geoPos
      // handleIn stays where it was
      return
    }

    if (state.hasPendingAnchor && state.anchors.length > 0) {
      // Normal drag: pull symmetric handles on the pending (last) anchor
      const last = state.anchors[state.anchors.length - 1]
      last.handleOut = geoPos
      last.handleIn = mirrorHandle(last.position, geoPos)
      last.symmetric = true
    }
  },

  /**
   * MapboxDraw only calls onMouseUp for drags (not simple clicks — those go to onClick).
   * Handles were already set during onMouseMove; just reset mouse tracking state.
   */
  onMouseUp(state: BezierState) {
    state.mouseDownScreenPt = null
    state.mouseDownGeoPos = null
    state.isDragging = false
    state.hasPendingAnchor = false
    state.altDrag = false
  },

  onKeyDown(_state: BezierState, e: { key: string; originalEvent: KeyboardEvent }) {
    if (e.key === 'Alt') {
      _state.altKey = true
    }
    // Prevent browser defaults for Backspace (navigation) and Enter
    if (e.key === 'Backspace' || e.key === 'Enter') {
      e.originalEvent?.preventDefault?.()
    }
  },

  onKeyUp(this: DrawContext, state: BezierState, e: { key: string; originalEvent: KeyboardEvent }) {
    if (e.key === 'Alt') {
      state.altKey = false
    }

    if (e.key === 'Escape') {
      // Cancel drawing and reset tool state
      state.anchors = []
      useUIStore.getState().setToolState({ kind: 'select' })
      this.changeMode('simple_select')
      return
    }

    if (e.key === 'Backspace') {
      // Remove last anchor
      if (state.anchors.length > 0) {
        state.anchors.pop()
      }
      return
    }

    if (e.key === 'Enter') {
      finishDrawing.call(this, state)
    }
  },

  toDisplayFeatures(
    state: BezierState,
    geojson: { properties?: { id?: string } },
    display: (feature: unknown) => void
  ) {
    // Only handle our placeholder feature; pass everything else through unchanged.
    if (!state.placeholder || geojson.properties?.id !== state.placeholder.id) {
      display(geojson)
      return
    }

    const { anchors, currentPos } = state

    // --- Curve body: flattened bezier through all confirmed anchors ---
    if (anchors.length >= 2) {
      const bodyCoords = flattenBezier(anchors)
      if (bodyCoords.length >= 2) {
        display({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: bodyCoords },
          properties: { meta: 'feature', active: 'true' },
        })
      }
    }

    // --- Preview segment: bezier from last anchor to cursor ---
    if (anchors.length >= 1 && currentPos && !state.isDragging) {
      const lastAnchor = anchors[anchors.length - 1]
      const previewCoords = buildPreviewSegment(lastAnchor, currentPos)
      if (previewCoords.length >= 2) {
        display({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: previewCoords },
          properties: { meta: 'feature', active: 'true', guide: 'true' },
        })
      }
    }

    // --- Anchor points ---
    for (const anchor of anchors) {
      display({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: anchor.position },
        properties: { meta: 'vertex', active: 'true' },
      })

      // --- Handle lines and endpoints ---
      if (anchor.handleIn) {
        // Handle line: anchor to handleIn
        display({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [anchor.position, anchor.handleIn],
          },
          properties: { meta: 'feature', active: 'true', guide: 'true', handle: 'true' },
        })
        // Handle endpoint
        display({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: anchor.handleIn },
          properties: { meta: 'midpoint', active: 'true' },
        })
      }

      if (anchor.handleOut) {
        // Handle line: anchor to handleOut
        display({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [anchor.position, anchor.handleOut],
          },
          properties: { meta: 'feature', active: 'true', guide: 'true', handle: 'true' },
        })
        // Handle endpoint
        display({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: anchor.handleOut },
          properties: { meta: 'midpoint', active: 'true' },
        })
      }
    }
  },

  onStop(this: DrawContext, state: BezierState) {
    if (state.placeholder) {
      this.deleteFeature([state.placeholder.id])
      state.placeholder = null
    }
  },

  onTrash(this: DrawContext) {
    this.changeMode('simple_select')
  },
}

/**
 * Finish drawing: flatten the bezier path to a LineString, fire draw.create,
 * and switch to simple_select.
 */
function finishDrawing(this: DrawContext, state: BezierState): void {
  if (state.anchors.length < 2) {
    // Not enough anchors for a line — just cancel
    state.anchors = []
    this.changeMode('simple_select')
    return
  }

  const coords = flattenBezier(state.anchors)

  const feature = {
    id: `bezier_${Date.now()}`,
    type: 'Feature' as const,
    geometry: {
      type: 'LineString' as const,
      coordinates: coords,
    },
    properties: {
      _bezierAnchors: JSON.stringify(state.anchors),
    },
  }

  this.map.fire('draw.create', { features: [feature] })
  state.anchors = []
  this.changeMode('simple_select')
}

export default DrawBezierMode
