import { BaseEditTool } from './BaseEditTool'
import type { MapInstance, ToolMeta } from '../primitives/types'
import type { MapElement } from '../../types/editor'
import { useMapStore } from '../../store/mapStore'
import {
  type BezierSegment,
  defaultControlPoints,
  reflectControlPoint,
  sampleBezierCurve,
} from '../primitives/bezierMath'

type DragType = 'anchor' | 'cpOut' | 'cpIn'

/**
 * Editing tool for bezier-curve elements (lanes, speed bumps, etc.).
 * Shows anchor points and control point handles for tangent editing.
 */
export class BezierEditTool extends BaseEditTool {
  private element!: MapElement
  private geometryProp!: string

  private anchors: [number, number][] = []
  private cpOut: ([number, number] | null)[] = []
  private cpIn: ([number, number] | null)[] = []

  private dragType: DragType | null = null
  private dragIndex = -1
  private dragging = false

  constructor(map: MapInstance) {
    super(map)
  }

  init(element: MapElement, meta: ToolMeta): void {
    this.element = element

    // Determine which property holds the LineString geometry
    if ('centerLine' in element) {
      this.geometryProp = 'centerLine'
    } else if ('line' in element) {
      this.geometryProp = 'line'
    } else if ('stopLine' in element) {
      this.geometryProp = 'stopLine'
    } else {
      return
    }

    // Reconstruct anchors and control points from _toolMeta
    if (meta.bezierAnchors && meta.bezierAnchors.length >= 2) {
      this.anchors = meta.bezierAnchors.map((a) => [...a] as [number, number])
    } else {
      // Fallback: use geometry endpoints as anchors
      const feature = (element as unknown as Record<string, unknown>)[
        this.geometryProp
      ] as GeoJSON.Feature<GeoJSON.LineString>
      const coords = feature.geometry.coordinates
      this.anchors = [coords[0] as [number, number], coords[coords.length - 1] as [number, number]]
    }

    const N = this.anchors.length
    this.cpOut = new Array(N).fill(null)
    this.cpIn = new Array(N).fill(null)

    if (meta.bezierControlPoints && meta.bezierControlPoints.length >= 2) {
      // Storage format: [cp1_seg0, cp2_seg0, cp1_seg1, cp2_seg1, ...]
      for (let seg = 0; seg < N - 1; seg++) {
        const cp1 = meta.bezierControlPoints[seg * 2]
        const cp2 = meta.bezierControlPoints[seg * 2 + 1]
        if (cp1) this.cpOut[seg] = [...cp1] as [number, number]
        if (cp2) this.cpIn[seg + 1] = [...cp2] as [number, number]
      }
    }
  }

  activate(): void {
    this.setCursor('default')
    this.renderHandles()

    this.bindMap('mousedown', (e) => {
      if (e.originalEvent.button !== 0) return
      const hit = this.hitTestHandleDetailed(e.point)
      if (!hit) return

      this.dragType = hit.type
      this.dragIndex = hit.index
      this.dragging = true
      e.preventDefault()
      this.map.dragPan.disable()
    })

    this.bindMap('mousemove', (e) => {
      if (!this.dragging) {
        const hit = this.hitTestHandleDetailed(e.point)
        this.setCursor(hit ? 'grab' : 'default')
        return
      }

      const cursor: [number, number] = [e.lngLat.lng, e.lngLat.lat]

      if (this.dragType === 'anchor') {
        this.handleAnchorDrag(this.dragIndex, cursor)
      } else if (this.dragType === 'cpOut') {
        this.handleControlPointDrag('cpOut', this.dragIndex, cursor)
      } else if (this.dragType === 'cpIn') {
        this.handleControlPointDrag('cpIn', this.dragIndex, cursor)
      }

      this.renderHandles()
    })

    this.bindMap('mouseup', () => {
      if (!this.dragging) return
      this.dragging = false
      this.dragType = null
      this.dragIndex = -1
      this.map.dragPan.enable()
      this.commitToStore()
    })
  }

  hitTestHandle(screenPoint: { x: number; y: number }): number {
    const hit = this.hitTestHandleDetailed(screenPoint)
    if (!hit) return -1
    const N = this.anchors.length
    if (hit.type === 'anchor') return hit.index
    if (hit.type === 'cpOut') return N + hit.index
    return 2 * N + hit.index
  }

  private hitTestHandleDetailed(screenPoint: {
    x: number
    y: number
  }): { type: DragType; index: number } | null {
    // Check anchors first (higher priority)
    for (let i = 0; i < this.anchors.length; i++) {
      if (this.isNearScreenPoint(screenPoint, this.anchors[i])) {
        return { type: 'anchor', index: i }
      }
    }
    // Check control points
    for (let i = 0; i < this.anchors.length; i++) {
      if (this.cpOut[i] && this.isNearScreenPoint(screenPoint, this.cpOut[i]!)) {
        return { type: 'cpOut', index: i }
      }
      if (this.cpIn[i] && this.isNearScreenPoint(screenPoint, this.cpIn[i]!)) {
        return { type: 'cpIn', index: i }
      }
    }
    return null
  }

  private handleAnchorDrag(idx: number, cursor: [number, number]): void {
    const dx = cursor[0] - this.anchors[idx][0]
    const dy = cursor[1] - this.anchors[idx][1]

    this.anchors[idx] = cursor

    // Move associated control points with the anchor
    if (this.cpOut[idx]) {
      this.cpOut[idx] = [this.cpOut[idx]![0] + dx, this.cpOut[idx]![1] + dy]
    }
    if (this.cpIn[idx]) {
      this.cpIn[idx] = [this.cpIn[idx]![0] + dx, this.cpIn[idx]![1] + dy]
    }
  }

  private handleControlPointDrag(
    type: 'cpOut' | 'cpIn',
    idx: number,
    cursor: [number, number]
  ): void {
    if (type === 'cpOut') {
      this.cpOut[idx] = cursor
      // Reflect to maintain C1 continuity
      if (this.cpIn[idx]) {
        this.cpIn[idx] = reflectControlPoint(cursor, this.anchors[idx])
      }
    } else {
      this.cpIn[idx] = cursor
      if (this.cpOut[idx]) {
        this.cpOut[idx] = reflectControlPoint(cursor, this.anchors[idx])
      }
    }
  }

  private buildSegments(): BezierSegment[] {
    const segments: BezierSegment[] = []
    for (let i = 0; i < this.anchors.length - 1; i++) {
      const a0 = this.anchors[i]
      const a1 = this.anchors[i + 1]

      let cp1 = this.cpOut[i]
      let cp2 = this.cpIn[i + 1]

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

  private commitToStore(): void {
    const segments = this.buildSegments()
    const newCoords = sampleBezierCurve(segments)

    const newControlPoints: [number, number][] = []
    for (const seg of segments) {
      newControlPoints.push(seg.cp1, seg.cp2)
    }

    const feature = (this.element as unknown as Record<string, unknown>)[
      this.geometryProp
    ] as GeoJSON.Feature<GeoJSON.LineString>

    const updatedFeature: GeoJSON.Feature<GeoJSON.LineString> = {
      ...feature,
      geometry: {
        type: 'LineString',
        coordinates: newCoords,
      },
      properties: {
        ...feature.properties,
        _toolMeta: {
          tool: 'bezier' as const,
          bezierAnchors: this.anchors.map((a) => [...a] as [number, number]),
          bezierControlPoints: newControlPoints,
        },
      },
    }

    const updated = {
      ...this.element,
      [this.geometryProp]: updatedFeature,
    } as MapElement

    useMapStore.getState().updateElement(updated)
    this.element = updated
  }

  private renderHandles(): void {
    const features: GeoJSON.Feature[] = []
    const pointFeatures: GeoJSON.Feature[] = []

    // Sampled curve
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
    }

    // Tangent handle lines and control points
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

    // Anchor points (rendered after control points so they appear on top)
    for (const a of this.anchors) {
      pointFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: a },
        properties: {},
      })
    }

    this.updatePreview(features, pointFeatures)
  }
}
