import { BasePrimitiveTool } from './BasePrimitiveTool'
import type { PrimitiveTool } from './types'

const CLOSE_THRESHOLD_PX = 10

/**
 * Multi-point polygon drawing tool.
 * Click to add vertices, click near first vertex or double-click to close.
 */
export class PolygonTool extends BasePrimitiveTool {
  readonly toolType: PrimitiveTool = 'polygon'
  private vertices: [number, number][] = []
  private cursorPos: [number, number] | null = null

  activate(): void {
    this.vertices = []
    this.cursorPos = null
    this.setCursor('crosshair')

    this.bindMap('click', (e) => {
      const pos: [number, number] = [e.lngLat.lng, e.lngLat.lat]

      // Check if clicking near the first vertex to close the polygon
      if (this.vertices.length >= 3) {
        const first = this.map.project(this.vertices[0] as [number, number])
        const click = e.point
        const dist = Math.hypot(first.x - click.x, first.y - click.y)
        if (dist < CLOSE_THRESHOLD_PX) {
          this.finish()
          return
        }
      }

      this.vertices.push(pos)
      this.renderPreview()
    })

    this.bindMap('dblclick', (e) => {
      e.preventDefault()
      this.finish()
    })

    this.bindMap('mousemove', (e) => {
      this.cursorPos = [e.lngLat.lng, e.lngLat.lat]
      this.renderPreview()
    })

    this.bindKey((e) => {
      if (e.key === 'Escape') {
        if (this.vertices.length === 0) {
          this.onCancel()
        } else {
          this.vertices.pop()
          this.renderPreview()
        }
      } else if (e.key === 'Enter') {
        this.finish()
      }
    })
  }

  private finish(): void {
    if (this.vertices.length < 3) return
    // Close the polygon ring
    const ring = [...this.vertices, this.vertices[0]]
    this.onComplete({
      tool: 'polygon',
      geometry: { type: 'Polygon', coordinates: [ring] },
      meta: { tool: 'polygon' },
    })
  }

  private renderPreview(): void {
    const features: GeoJSON.Feature[] = []
    const pointFeatures: GeoJSON.Feature[] = []

    // Polygon fill + outline when >= 3 vertices
    if (this.vertices.length >= 3) {
      const ring = this.cursorPos
        ? [...this.vertices, this.cursorPos, this.vertices[0]]
        : [...this.vertices, this.vertices[0]]
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {},
      })
    } else if (this.vertices.length >= 2) {
      // Just a line between confirmed vertices
      const coords = this.cursorPos ? [...this.vertices, this.cursorPos] : this.vertices
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      })
    } else if (this.vertices.length === 1 && this.cursorPos) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [this.vertices[0], this.cursorPos],
        },
        properties: { dashed: true },
      })
    }

    // Vertex points
    for (const v of this.vertices) {
      pointFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: v },
        properties: {},
      })
    }

    // Cursor point
    if (this.cursorPos) {
      pointFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: this.cursorPos },
        properties: { isHandle: true },
      })
    }

    this.updatePreview(features, pointFeatures)
  }
}
