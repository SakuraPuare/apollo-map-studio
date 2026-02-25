import { BasePrimitiveTool } from './BasePrimitiveTool'
import type { PrimitiveTool } from './types'
import { type BezierSegment, defaultControlPoints, sampleBezierCurve } from './bezierMath'

/**
 * Pen-tool style bezier curve drawing.
 *
 * Interaction:
 * - Click to place an anchor (sharp corner, no tangent handles)
 * - Click + drag to place an anchor with symmetric tangent handles
 * - Double-click or Enter to finish
 * - Escape to undo last anchor
 *
 * Output: sampled LineString + control point metadata in ToolMeta.
 */
export class BezierTool extends BasePrimitiveTool {
  readonly toolType: PrimitiveTool = 'bezier'

  /** Anchor points placed by the user */
  private anchors: [number, number][] = []
  /**
   * Outgoing control point for each anchor.
   * cpOut[i] = the handle extending from anchor[i] toward anchor[i+1].
   * If null, the anchor has no tangent (sharp corner).
   */
  private cpOut: ([number, number] | null)[] = []
  /**
   * Incoming control point for each anchor.
   * cpIn[i] = the handle extending from anchor[i] toward anchor[i-1].
   */
  private cpIn: ([number, number] | null)[] = []

  private dragging = false
  private dragAnchorIdx = -1
  private cursorPos: [number, number] | null = null

  activate(): void {
    this.anchors = []
    this.cpOut = []
    this.cpIn = []
    this.dragging = false
    this.setCursor('crosshair')

    this.bindMap('mousedown', (e) => {
      if (e.originalEvent.button !== 0) return
      const pos: [number, number] = [e.lngLat.lng, e.lngLat.lat]

      // Start a new anchor — the drag will determine if it gets handles
      this.anchors.push(pos)
      this.cpOut.push(null)
      this.cpIn.push(null)
      this.dragging = true
      this.dragAnchorIdx = this.anchors.length - 1

      // Prevent map panning while we might be dragging a handle
      e.preventDefault()
      this.renderPreview()
    })

    this.bindMap('mousemove', (e) => {
      this.cursorPos = [e.lngLat.lng, e.lngLat.lat]

      if (this.dragging && this.dragAnchorIdx >= 0) {
        const anchor = this.anchors[this.dragAnchorIdx]
        const dx = this.cursorPos[0] - anchor[0]
        const dy = this.cursorPos[1] - anchor[1]

        // Only create handles if drag distance is significant
        const screenDist = Math.hypot(
          e.point.x - this.map.project(anchor).x,
          e.point.y - this.map.project(anchor).y
        )
        if (screenDist > 5) {
          // cpOut extends toward cursor
          this.cpOut[this.dragAnchorIdx] = [anchor[0] + dx, anchor[1] + dy]
          // cpIn is the reflection (symmetric tangent)
          this.cpIn[this.dragAnchorIdx] = [anchor[0] - dx, anchor[1] - dy]
        }
      }

      this.renderPreview()
    })

    this.bindMap('mouseup', () => {
      this.dragging = false
      this.dragAnchorIdx = -1
    })

    this.bindMap('dblclick', (e) => {
      e.preventDefault()
      // Remove the extra anchor added by the last click of the double-click
      if (this.anchors.length > 1) {
        this.anchors.pop()
        this.cpOut.pop()
        this.cpIn.pop()
      }
      this.finish()
    })

    this.bindKey((e) => {
      if (e.key === 'Escape') {
        if (this.anchors.length <= 1) {
          this.onCancel()
        } else {
          // Remove last anchor
          this.anchors.pop()
          this.cpOut.pop()
          this.cpIn.pop()
          this.renderPreview()
        }
      } else if (e.key === 'Enter') {
        this.finish()
      }
    })
  }

  private finish(): void {
    if (this.anchors.length < 2) return

    const segments = this.buildSegments()
    const sampledCoords = sampleBezierCurve(segments)

    // Collect anchor and control point metadata
    const bezierAnchors = [...this.anchors]
    const bezierControlPoints: [number, number][] = []
    for (const seg of segments) {
      bezierControlPoints.push(seg.cp1, seg.cp2)
    }

    this.onComplete({
      tool: 'bezier',
      geometry: { type: 'LineString', coordinates: sampledCoords },
      meta: {
        tool: 'bezier',
        bezierAnchors,
        bezierControlPoints,
      },
    })
  }

  private buildSegments(): BezierSegment[] {
    const segments: BezierSegment[] = []
    for (let i = 0; i < this.anchors.length - 1; i++) {
      const a0 = this.anchors[i]
      const a1 = this.anchors[i + 1]

      // Control point leaving a0 (outgoing)
      let cp1 = this.cpOut[i]
      // Control point arriving at a1 (incoming)
      let cp2 = this.cpIn[i + 1]

      // If no handle set, use default 1/3 interpolation
      if (!cp1 && !cp2) {
        const defaults = defaultControlPoints(a0, a1)
        cp1 = defaults.cp1
        cp2 = defaults.cp2
      } else if (!cp1) {
        cp1 = defaultControlPoints(a0, cp2!).cp1
      } else if (!cp2) {
        cp2 = defaultControlPoints(cp1, a1).cp2
      }

      segments.push({ anchor0: a0, cp1, cp2: cp2!, anchor1: a1 })
    }
    return segments
  }

  private renderPreview(): void {
    const features: GeoJSON.Feature[] = []
    const pointFeatures: GeoJSON.Feature[] = []

    // Build and sample the current curve
    if (this.anchors.length >= 2) {
      const segments = this.buildSegments()
      const sampled = sampleBezierCurve(segments)
      if (sampled.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: sampled },
          properties: {},
        })
      }

      // Draw tangent handle lines
      for (let i = 0; i < this.anchors.length; i++) {
        const anchor = this.anchors[i]
        if (this.cpOut[i]) {
          features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [anchor, this.cpOut[i]!] },
            properties: { dashed: true },
          })
          pointFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: this.cpOut[i]! },
            properties: { isHandle: true },
          })
        }
        if (this.cpIn[i]) {
          features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [anchor, this.cpIn[i]!] },
            properties: { dashed: true },
          })
          pointFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: this.cpIn[i]! },
            properties: { isHandle: true },
          })
        }
      }
    }

    // Rubber-band from last anchor to cursor
    if (this.anchors.length >= 1 && this.cursorPos && !this.dragging) {
      const lastAnchor = this.anchors[this.anchors.length - 1]
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [lastAnchor, this.cursorPos],
        },
        properties: { dashed: true },
      })
    }

    // Anchor points
    for (const a of this.anchors) {
      pointFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: a },
        properties: {},
      })
    }

    // Cursor
    if (this.cursorPos && !this.dragging) {
      pointFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: this.cursorPos },
        properties: { isHandle: true },
      })
    }

    this.updatePreview(features, pointFeatures)
  }
}
