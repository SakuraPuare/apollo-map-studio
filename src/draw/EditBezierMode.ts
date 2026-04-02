/**
 * Custom MapboxDraw mode: Edit an existing bezier curve.
 *
 * Interaction:
 *   - mouseDown on anchor       — Start dragging anchor (moves handles with it)
 *   - mouseDown on handle       — Start dragging that handle
 *   - Alt + drag handle         — Break symmetry, only move this handle
 *   - mouseMove (dragging)      — Update target position, re-flatten, update preview
 *   - Enter                     — Commit changes to mapStore
 *   - Escape                    — Cancel, discard changes, return to simple_select
 *   - Delete / Backspace        — Delete last anchor (if ≥2 remain)
 */

import type { Position } from 'geojson'
import type { BezierAnchor } from '../geo/bezier'
import { flattenBezier, mirrorHandle } from '../geo/bezier'
import { useMapStore } from '../store/mapStore'
import { useUIStore } from '../store/uiStore'

/** Hit-test radius in screen pixels. */
const HIT_RADIUS_PX = 10

type DragTarget =
  | { kind: 'anchor'; anchorIndex: number }
  | { kind: 'handleIn'; anchorIndex: number }
  | { kind: 'handleOut'; anchorIndex: number }

interface EditBezierState {
  /** The lane id being edited. */
  laneId: string

  /** Deep-cloned anchors from the lane's bezierAnchors. */
  anchors: BezierAnchor[]

  /** Currently active drag target, or null if not dragging. */
  dragTarget: DragTarget | null

  /** Whether Alt key is held (break symmetry mode). */
  altKey: boolean

  /** Geo offset from the drag target's position to the mouseDown position (for anchors). */
  dragOffset: Position | null
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
 * Hit-test all anchors and handle endpoints against a screen-space click position.
 * Returns the closest target within HIT_RADIUS_PX, with handles prioritized over anchors.
 */
function hitTest(
  map: DrawContext['map'],
  anchors: BezierAnchor[],
  clickScreen: { x: number; y: number }
): DragTarget | null {
  let bestHandle: { target: DragTarget; dist: number } | null = null
  let bestAnchor: { target: DragTarget; dist: number } | null = null

  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i]

    // Check handle endpoints first (they get priority)
    if (anchor.handleIn) {
      const sp = map.project({ lng: anchor.handleIn[0], lat: anchor.handleIn[1] })
      const d = screenDist(sp, clickScreen)
      if (d <= HIT_RADIUS_PX && (!bestHandle || d < bestHandle.dist)) {
        bestHandle = { target: { kind: 'handleIn', anchorIndex: i }, dist: d }
      }
    }

    if (anchor.handleOut) {
      const sp = map.project({ lng: anchor.handleOut[0], lat: anchor.handleOut[1] })
      const d = screenDist(sp, clickScreen)
      if (d <= HIT_RADIUS_PX && (!bestHandle || d < bestHandle.dist)) {
        bestHandle = { target: { kind: 'handleOut', anchorIndex: i }, dist: d }
      }
    }

    // Check anchor point
    const sp = map.project({ lng: anchor.position[0], lat: anchor.position[1] })
    const d = screenDist(sp, clickScreen)
    if (d <= HIT_RADIUS_PX && (!bestAnchor || d < bestAnchor.dist)) {
      bestAnchor = { target: { kind: 'anchor', anchorIndex: i }, dist: d }
    }
  }

  // Handles take priority over anchors
  if (bestHandle) return bestHandle.target
  if (bestAnchor) return bestAnchor.target
  return null
}

const EditBezierMode = {
  onSetup(this: DrawContext, opts: { laneId: string }): EditBezierState {
    this.updateUIClasses({ mouse: 'move' })

    const lane = useMapStore.getState().lanes[opts.laneId]
    if (!lane || !lane.bezierAnchors) {
      // No bezier data — cannot edit, bail to simple_select
      useUIStore.getState().setStatus('No bezier data on this lane')
      this.changeMode('simple_select')
      return {
        laneId: opts.laneId,
        anchors: [],
        dragTarget: null,
        altKey: false,
        dragOffset: null,
      }
    }

    // Deep clone the anchors so edits don't mutate the store until commit
    const anchors: BezierAnchor[] = JSON.parse(JSON.stringify(lane.bezierAnchors))

    useUIStore
      .getState()
      .setStatus('Editing bezier — drag anchors/handles, Enter to commit, Esc to cancel')

    return {
      laneId: opts.laneId,
      anchors,
      dragTarget: null,
      altKey: false,
      dragOffset: null,
    }
  },

  /**
   * No-op: we handle all click logic via onMouseDown / onMouseUp
   * to distinguish click vs drag. Defining onClick prevents MapboxDraw
   * default click handling.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onClick(state: EditBezierState, e: unknown) {
    // intentionally empty — interaction handled via onMouseDown/onMouseMove/onMouseUp
  },

  onMouseDown(
    this: DrawContext,
    state: EditBezierState,
    e: { lngLat: { lng: number; lat: number }; originalEvent: MouseEvent }
  ) {
    const screenPt = this.map.project(e.lngLat)
    const target = hitTest(this.map, state.anchors, screenPt)

    if (!target) {
      state.dragTarget = null
      return
    }

    state.altKey = e.originalEvent.altKey
    state.dragTarget = target

    // For anchor drags, record offset so anchor follows mouse smoothly
    if (target.kind === 'anchor') {
      const anchor = state.anchors[target.anchorIndex]
      state.dragOffset = [anchor.position[0] - e.lngLat.lng, anchor.position[1] - e.lngLat.lat]
    } else {
      state.dragOffset = null
    }
  },

  onMouseMove(
    this: DrawContext,
    state: EditBezierState,
    e: { lngLat: { lng: number; lat: number }; originalEvent: MouseEvent }
  ) {
    if (!state.dragTarget) return

    const geoPos: Position = [e.lngLat.lng, e.lngLat.lat]
    const anchor = state.anchors[state.dragTarget.anchorIndex]

    if (state.dragTarget.kind === 'anchor') {
      // Move anchor and its handles together
      const offset = state.dragOffset ?? [0, 0]
      const newPos: Position = [geoPos[0] + offset[0], geoPos[1] + offset[1]]
      const dx = newPos[0] - anchor.position[0]
      const dy = newPos[1] - anchor.position[1]

      anchor.position = newPos
      if (anchor.handleIn) {
        anchor.handleIn = [anchor.handleIn[0] + dx, anchor.handleIn[1] + dy]
      }
      if (anchor.handleOut) {
        anchor.handleOut = [anchor.handleOut[0] + dx, anchor.handleOut[1] + dy]
      }
    } else if (state.dragTarget.kind === 'handleIn') {
      if (state.altKey || e.originalEvent.altKey) {
        // Alt-drag: break symmetry, only move this handle
        anchor.symmetric = false
        anchor.handleIn = geoPos
      } else {
        anchor.handleIn = geoPos
        if (anchor.symmetric && anchor.handleOut) {
          anchor.handleOut = mirrorHandle(anchor.position, geoPos)
        }
      }
    } else if (state.dragTarget.kind === 'handleOut') {
      if (state.altKey || e.originalEvent.altKey) {
        // Alt-drag: break symmetry, only move this handle
        anchor.symmetric = false
        anchor.handleOut = geoPos
      } else {
        anchor.handleOut = geoPos
        if (anchor.symmetric && anchor.handleIn) {
          anchor.handleIn = mirrorHandle(anchor.position, geoPos)
        }
      }
    }
  },

  onMouseUp(
    this: DrawContext,
    state: EditBezierState,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _e: { lngLat: { lng: number; lat: number }; originalEvent: MouseEvent }
  ) {
    state.dragTarget = null
    state.dragOffset = null
  },

  onKeyDown(_state: EditBezierState, e: { key: string; originalEvent: KeyboardEvent }) {
    if (e.key === 'Alt') {
      _state.altKey = true
    }
    // Prevent browser defaults for Backspace (navigation) and Enter
    if (e.key === 'Backspace' || e.key === 'Enter' || e.key === 'Delete') {
      e.originalEvent?.preventDefault?.()
    }
  },

  onKeyUp(
    this: DrawContext,
    state: EditBezierState,
    e: { key: string; originalEvent: KeyboardEvent }
  ) {
    if (e.key === 'Alt') {
      state.altKey = false
    }

    if (e.key === 'Escape') {
      // Cancel: discard changes, return to simple_select
      useUIStore.getState().setStatus('')
      useUIStore.getState().setToolState({ kind: 'select' })
      this.changeMode('simple_select')
      return
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      // Delete last anchor (keep at least 2)
      if (state.anchors.length > 2) {
        state.anchors.pop()
      }
      return
    }

    if (e.key === 'Enter') {
      commitEdit.call(this, state)
    }
  },

  toDisplayFeatures(
    state: EditBezierState,
    _geojson: unknown,
    display: (feature: unknown) => void
  ) {
    const { anchors } = state

    // --- Curve body: flattened bezier through all anchors ---
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
 * Commit the bezier edit: flatten anchors, update lane in mapStore,
 * and switch back to simple_select.
 */
function commitEdit(this: DrawContext, state: EditBezierState): void {
  if (state.anchors.length < 2) {
    useUIStore.getState().setStatus('Need at least 2 anchors to commit')
    return
  }

  const coords = flattenBezier(state.anchors)
  const lane = useMapStore.getState().lanes[state.laneId]

  if (!lane) {
    useUIStore.getState().setStatus('Lane not found')
    this.changeMode('simple_select')
    return
  }

  const updatedLane = {
    ...lane,
    centerLine: {
      ...lane.centerLine,
      geometry: {
        ...lane.centerLine.geometry,
        coordinates: coords,
      },
    },
    bezierAnchors: structuredClone(state.anchors),
  }

  useMapStore.getState().updateElement(updatedLane)
  useUIStore.getState().setToolState({ kind: 'select' })
  useUIStore.getState().setSelected([state.laneId])
  useUIStore.getState().setStatus('')
  this.changeMode('simple_select')
}

export default EditBezierMode
