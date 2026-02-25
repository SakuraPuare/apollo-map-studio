import * as turf from '@turf/turf'
import { BasePrimitiveTool } from './BasePrimitiveTool'
import type { PrimitiveTool } from './types'

/**
 * Rotatable rectangle drawing tool.
 * Phase 1: Click to set origin, drag/move to define one edge (direction + width).
 * Phase 2: Move perpendicular to define height, click to confirm.
 */
export class RotatableRectTool extends BasePrimitiveTool {
  readonly toolType: PrimitiveTool = 'rotatable_rect'
  private phase: 'edge' | 'height' = 'edge'
  private origin: [number, number] | null = null
  private edgeEnd: [number, number] | null = null
  private cursorPos: [number, number] | null = null

  activate(): void {
    this.phase = 'edge'
    this.origin = null
    this.edgeEnd = null
    this.cursorPos = null
    this.setCursor('crosshair')

    this.bindMap('click', (e) => {
      const pos: [number, number] = [e.lngLat.lng, e.lngLat.lat]

      if (this.phase === 'edge') {
        if (!this.origin) {
          this.origin = pos
        } else {
          this.edgeEnd = pos
          this.phase = 'height'
        }
      } else {
        // Phase 'height' — confirm rectangle
        this.finish()
      }
    })

    this.bindMap('mousemove', (e) => {
      this.cursorPos = [e.lngLat.lng, e.lngLat.lat]
      this.renderPreview()
    })

    this.bindKey((e) => {
      if (e.key === 'Escape') {
        if (this.phase === 'height') {
          // Go back to edge phase
          this.phase = 'edge'
          this.edgeEnd = null
          this.renderPreview()
        } else if (this.origin) {
          this.origin = null
          this.renderPreview()
        } else {
          this.onCancel()
        }
      } else if (e.key === 'Enter' && this.phase === 'height') {
        this.finish()
      }
    })
  }

  private finish(): void {
    if (!this.origin || !this.edgeEnd || !this.cursorPos) return
    const rect = this.computeRect(this.origin, this.edgeEnd, this.cursorPos)
    if (!rect) return
    this.onComplete({
      tool: 'rotatable_rect',
      geometry: {
        type: 'Polygon',
        coordinates: [[...rect.vertices, rect.vertices[0]]],
      },
      meta: {
        tool: 'rotatable_rect',
        rotation: rect.rotation,
        width: rect.width,
        height: rect.height,
      },
    })
  }

  private computeRect(
    origin: [number, number],
    edgeEnd: [number, number],
    cursor: [number, number]
  ): {
    vertices: [number, number][]
    rotation: number
    width: number
    height: number
  } | null {
    // Edge defines direction and width
    const bearing = turf.bearing(turf.point(origin), turf.point(edgeEnd))
    const width = turf.distance(turf.point(origin), turf.point(edgeEnd), { units: 'meters' })
    if (width < 0.01) return null

    // Project cursor onto the perpendicular direction to get height
    const perpBearing = bearing + 90
    const cursorPoint = turf.point(cursor)
    const edgeMid = turf.midpoint(turf.point(origin), turf.point(edgeEnd))

    // Compute signed distance from cursor to the edge line
    // by projecting onto the perpendicular axis
    const perpDist = turf.distance(edgeMid, cursorPoint, { units: 'meters' })

    // Determine sign: which side of the edge is the cursor on
    const edgeBearingRad = (bearing * Math.PI) / 180
    const dx = cursor[0] - (origin[0] + edgeEnd[0]) / 2
    const dy = cursor[1] - (origin[1] + edgeEnd[1]) / 2
    const perpX = -Math.sin(edgeBearingRad)
    const perpY = Math.cos(edgeBearingRad)
    const sign = dx * perpX + dy * perpY >= 0 ? 1 : -1
    const height = perpDist * sign

    if (Math.abs(height) < 0.01) return null

    // Compute 4 corners
    const actualPerpBearing = sign >= 0 ? perpBearing : perpBearing + 180
    const absHeight = Math.abs(height)

    const p0 = origin
    const p1 = edgeEnd
    const p2Pt = turf.destination(turf.point(edgeEnd), absHeight, actualPerpBearing, {
      units: 'meters',
    })
    const p3Pt = turf.destination(turf.point(origin), absHeight, actualPerpBearing, {
      units: 'meters',
    })

    const p2 = p2Pt.geometry.coordinates as [number, number]
    const p3 = p3Pt.geometry.coordinates as [number, number]

    // Rotation angle in radians: bearing of the first edge from East, CCW
    const rotation = ((90 - bearing) * Math.PI) / 180

    return {
      vertices: [p0, p1, p2, p3],
      rotation,
      width,
      height: absHeight,
    }
  }

  private renderPreview(): void {
    const features: GeoJSON.Feature[] = []
    const pointFeatures: GeoJSON.Feature[] = []

    if (this.phase === 'edge') {
      if (this.origin && this.cursorPos) {
        // Show the edge being defined
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [this.origin, this.cursorPos],
          },
          properties: { dashed: true },
        })
        pointFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: this.origin },
          properties: {},
        })
        pointFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: this.cursorPos },
          properties: { isHandle: true },
        })
      }
    } else if (this.origin && this.edgeEnd && this.cursorPos) {
      // Show rectangle preview
      const rect = this.computeRect(this.origin, this.edgeEnd, this.cursorPos)
      if (rect) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[...rect.vertices, rect.vertices[0]]],
          },
          properties: {},
        })
        for (const v of rect.vertices) {
          pointFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: v },
            properties: {},
          })
        }
      }
    }

    this.updatePreview(features, pointFeatures)
  }
}
