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

  /** Timestamp of last mouseUp, for double-click detection. */
  lastMouseUpTime: number

  /** Screen position of last mouseUp, for double-click detection. */
  lastMouseUpScreenPt: { x: number; y: number } | null

  /** Whether Alt key is currently held. */
  altKey: boolean
}

type DrawContext = {
  map: {
    fire: (event: string, data: unknown) => void
    project: (lngLat: { lng: number; lat: number }) => { x: number; y: number }
  }
  changeMode: (mode: string) => void
  updateUIClasses: (opts?: { mouse?: string }) => void
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
    this.updateUIClasses({ mouse: 'add' })
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
    }
  },

  /**
   * No-op: we handle all click logic via onMouseDown / onMouseUp
   * to distinguish click vs drag. Defining onClick prevents MapboxDraw
   * default click handling.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onClick(state: BezierState, e: unknown) {
    // intentionally empty — click logic is handled via onMouseDown/onMouseUp
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

  onMouseUp(
    this: DrawContext,
    state: BezierState,
    e: { lngLat: { lng: number; lat: number }; originalEvent: MouseEvent }
  ) {
    const screenPt = this.map.project(e.lngLat)
    const now = Date.now()

    // Double-click detection (check BEFORE processing this mouseUp)
    if (
      state.lastMouseUpScreenPt &&
      now - state.lastMouseUpTime < DOUBLE_CLICK_MS &&
      screenDist(screenPt, state.lastMouseUpScreenPt) < DOUBLE_CLICK_PX
    ) {
      // Double-click detected: finish drawing.
      // The second click added a duplicate anchor — remove it.
      if (state.hasPendingAnchor && state.anchors.length > 1) {
        state.anchors.pop()
      }
      finishDrawing.call(this, state)
      state.mouseDownScreenPt = null
      state.lastMouseUpTime = 0
      state.lastMouseUpScreenPt = null
      return
    }

    state.lastMouseUpTime = now
    state.lastMouseUpScreenPt = { x: screenPt.x, y: screenPt.y }

    if (!state.isDragging && state.hasPendingAnchor) {
      // Click (no drag): confirm as corner anchor (handles stay null)
      // Already pushed in onMouseDown with null handles — nothing more to do
    }

    // If it was a drag, the handles were already set during onMouseMove.
    // If it was an alt-drag, symmetry was already broken during onMouseMove.

    // Reset mouse state
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
      // Cancel drawing
      state.anchors = []
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

  toDisplayFeatures(state: BezierState, _geojson: unknown, display: (feature: unknown) => void) {
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

  onStop() {
    // cleanup
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
