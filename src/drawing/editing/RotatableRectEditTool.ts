import * as turf from '@turf/turf'
import { BaseEditTool } from './BaseEditTool'
import type { MapInstance, ToolMeta } from '../primitives/types'
import type { MapElement } from '../../types/editor'
import { useMapStore } from '../../store/mapStore'

const ROTATION_HANDLE_PX = 30

/**
 * Editing tool for rotatable-rectangle elements (crosswalk, junction, etc.).
 * Shows 4 corner drag handles + 1 rotation handle.
 * Vertex convention: p0→p1 = width edge (same as RotatableRectTool).
 */
export class RotatableRectEditTool extends BaseEditTool {
  private element!: MapElement
  private geometryProp!: 'polygon'
  private vertices: [number, number][] = []
  private rotation = 0
  private width = 0
  private height = 0
  private dragHandleIndex = -1
  private dragging = false

  constructor(map: MapInstance) {
    super(map)
  }

  init(element: MapElement, meta: ToolMeta): void {
    this.element = element

    // Determine which property holds the polygon
    if ('polygon' in element) {
      this.geometryProp = 'polygon'
    } else {
      return
    }

    const feature = (element as unknown as Record<string, unknown>)[
      this.geometryProp
    ] as GeoJSON.Feature<GeoJSON.Polygon>
    const coords = feature.geometry.coordinates[0]
    // Strip closing vertex
    this.vertices = coords.slice(0, -1) as [number, number][]

    this.rotation = meta.rotation ?? 0
    this.width = meta.width ?? this.computeEdgeLength(0, 1)
    this.height = meta.height ?? this.computeEdgeLength(1, 2)
  }

  activate(): void {
    this.setCursor('default')
    this.renderHandles()

    this.bindMap('mousedown', (e) => {
      if (e.originalEvent.button !== 0) return
      const hitIdx = this.hitTestHandle(e.point)
      if (hitIdx < 0) return

      this.dragHandleIndex = hitIdx
      this.dragging = true
      e.preventDefault()
      this.map.dragPan.disable()
    })

    this.bindMap('mousemove', (e) => {
      if (!this.dragging) {
        // Show grab cursor when hovering handles
        const hitIdx = this.hitTestHandle(e.point)
        this.setCursor(hitIdx >= 0 ? 'grab' : 'default')
        return
      }

      const cursor: [number, number] = [e.lngLat.lng, e.lngLat.lat]

      if (this.dragHandleIndex === 4) {
        this.handleRotation(cursor)
      } else {
        this.handleCornerDrag(this.dragHandleIndex, cursor)
      }

      this.renderHandles()
    })

    this.bindMap('mouseup', () => {
      if (!this.dragging) return
      this.dragging = false
      this.dragHandleIndex = -1
      this.map.dragPan.enable()
      this.commitToStore()
    })
  }

  hitTestHandle(screenPoint: { x: number; y: number }): number {
    // Test corner handles (0-3)
    for (let i = 0; i < 4; i++) {
      if (this.isNearScreenPoint(screenPoint, this.vertices[i])) return i
    }
    // Test rotation handle (4)
    const rotHandle = this.getRotationHandlePos()
    if (rotHandle && this.isNearScreenPoint(screenPoint, rotHandle)) return 4
    return -1
  }

  private getRotationHandlePos(): [number, number] | null {
    if (this.vertices.length < 4) return null
    // Midpoint of top edge (p0→p1)
    const midTop = turf.midpoint(turf.point(this.vertices[0]), turf.point(this.vertices[1]))
    const midCoord = midTop.geometry.coordinates as [number, number]

    // Offset outward by converting screen pixels to a geographic distance
    // Use the perpendicular direction (away from center)
    const center = turf.midpoint(turf.point(this.vertices[0]), turf.point(this.vertices[2]))
      .geometry.coordinates as [number, number]

    const outBearing = turf.bearing(turf.point(center), turf.point(midCoord))

    // Convert ROTATION_HANDLE_PX to meters using the map's current resolution
    const centerScreen = this.map.project(center)
    const offsetScreen = { x: centerScreen.x + ROTATION_HANDLE_PX, y: centerScreen.y }
    const offsetGeo = this.map.unproject([offsetScreen.x, offsetScreen.y])
    const pxMeters = turf.distance(turf.point(center), turf.point([offsetGeo.lng, offsetGeo.lat]), {
      units: 'meters',
    })

    const dest = turf.destination(turf.point(midCoord), pxMeters, outBearing, { units: 'meters' })
    return dest.geometry.coordinates as [number, number]
  }

  private handleCornerDrag(cornerIdx: number, cursor: [number, number]): void {
    const fixedIdx = (cornerIdx + 2) % 4
    const fixed = this.vertices[fixedIdx]

    // Edge bearing from the stored rotation
    const edgeBearing = 90 - (this.rotation * 180) / Math.PI

    const cursorBearing = turf.bearing(turf.point(fixed), turf.point(cursor))
    const dist = turf.distance(turf.point(fixed), turf.point(cursor), { units: 'meters' })

    const angleDiff = ((cursorBearing - edgeBearing) * Math.PI) / 180
    const widthComponent = dist * Math.cos(angleDiff)
    const heightComponent = dist * Math.sin(angleDiff)

    // Reject degenerate rectangles
    if (Math.abs(widthComponent) < 0.01 || Math.abs(heightComponent) < 0.01) return

    const newWidth = Math.abs(widthComponent)
    const newHeight = Math.abs(heightComponent)

    // Rebuild vertices from fixed point
    // Determine which direction the edges go based on signs
    const wBearing = widthComponent >= 0 ? edgeBearing : edgeBearing + 180
    const hBearing = heightComponent >= 0 ? edgeBearing + 90 : edgeBearing - 90

    // fixed is at (fixedIdx+2)%4 = cornerIdx position in the new rect
    // We need to build p0,p1,p2,p3 keeping the vertex convention
    const fp = turf.point(fixed)
    const wEdge = turf.destination(fp, newWidth, wBearing, { units: 'meters' }).geometry
      .coordinates as [number, number]
    const hEdge = turf.destination(fp, newHeight, hBearing, { units: 'meters' }).geometry
      .coordinates as [number, number]
    const diag = turf.destination(turf.point(wEdge), newHeight, hBearing, { units: 'meters' })
      .geometry.coordinates as [number, number]

    // Map back to the correct vertex ordering
    // fixedIdx=0: fixed=p0, wEdge=p1, diag=p2, hEdge=p3
    const newVerts: [number, number][] = [fixed, wEdge, diag, hEdge]
    // Rotate the array so that fixedIdx stays at its position
    for (let i = 0; i < fixedIdx; i++) {
      newVerts.unshift(newVerts.pop()!)
    }

    this.vertices = newVerts
    this.width = newWidth
    this.height = newHeight
  }

  private handleRotation(cursor: [number, number]): void {
    const center = turf.midpoint(turf.point(this.vertices[0]), turf.point(this.vertices[2]))
      .geometry.coordinates as [number, number]

    const cursorBearing = turf.bearing(turf.point(center), turf.point(cursor))

    // The rotation handle extends from the top edge midpoint outward,
    // so the cursor bearing points in the direction perpendicular to the top edge.
    // top edge bearing = cursorBearing - 90 (the edge is to the left of the outward direction)
    // but we need the p0→p1 edge direction, which is the "width" edge:
    // The top edge midpoint is between p0 and p1.
    // Center → topMid is perpendicular to p0→p1.
    // So p0→p1 bearing = cursorBearing + 90 or cursorBearing - 90.
    // From RotatableRectTool: rotation = ((90 - bearing) * Math.PI) / 180
    // where bearing = turf.bearing(p0, p1)
    // We know center→topMid direction = cursorBearing,
    // and topMid is the midpoint of p0,p1 which is on the opposite side of center from the height edge.
    // So p0→p1 bearing ≈ cursorBearing + 90 (or - 90 depending on orientation).
    // Let's derive: center→topMid goes outward along the height axis,
    // and p0→p1 is perpendicular to that. In the original tool, bearing(p0,p1) = 90 - rotation*180/π
    // and the outward direction from center to topMid = bearing + 90 = 90 - rotation*180/π + 90 = 180 - rotation*180/π
    // Now cursorBearing ≈ that outward direction, so:
    // 180 - rotation*180/π = cursorBearing
    // rotation = (180 - cursorBearing) * π / 180

    const newEdgeBearing = cursorBearing - 90
    this.rotation = ((90 - newEdgeBearing) * Math.PI) / 180

    // Rebuild vertices from center
    const halfW = this.width / 2
    const halfH = this.height / 2

    const cp = turf.point(center)

    // p0→p1 direction is newEdgeBearing
    const midTop = turf.destination(cp, halfH, cursorBearing, { units: 'meters' }).geometry
      .coordinates as [number, number]
    const midBot = turf.destination(cp, halfH, cursorBearing + 180, { units: 'meters' }).geometry
      .coordinates as [number, number]

    this.vertices = [
      turf.destination(turf.point(midTop), halfW, newEdgeBearing + 180, { units: 'meters' })
        .geometry.coordinates as [number, number],
      turf.destination(turf.point(midTop), halfW, newEdgeBearing, { units: 'meters' }).geometry
        .coordinates as [number, number],
      turf.destination(turf.point(midBot), halfW, newEdgeBearing, { units: 'meters' }).geometry
        .coordinates as [number, number],
      turf.destination(turf.point(midBot), halfW, newEdgeBearing + 180, { units: 'meters' })
        .geometry.coordinates as [number, number],
    ]
  }

  private commitToStore(): void {
    const feature = (this.element as unknown as Record<string, unknown>)[
      this.geometryProp
    ] as GeoJSON.Feature<GeoJSON.Polygon>

    const updatedFeature: GeoJSON.Feature<GeoJSON.Polygon> = {
      ...feature,
      geometry: {
        type: 'Polygon',
        coordinates: [[...this.vertices, this.vertices[0]]],
      },
      properties: {
        ...feature.properties,
        _toolMeta: {
          tool: 'rotatable_rect' as const,
          rotation: this.rotation,
          width: this.width,
          height: this.height,
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

    if (this.vertices.length < 4) return

    // Rectangle outline
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[...this.vertices, this.vertices[0]]],
      },
      properties: {},
    })

    // Corner handle points
    for (const v of this.vertices) {
      pointFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: v },
        properties: { isHandle: true },
      })
    }

    // Rotation handle
    const rotPos = this.getRotationHandlePos()
    if (rotPos) {
      // Connector line from top edge midpoint to rotation handle
      const midTop = turf.midpoint(turf.point(this.vertices[0]), turf.point(this.vertices[1]))
        .geometry.coordinates as [number, number]

      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [midTop, rotPos],
        },
        properties: { dashed: true },
      })

      pointFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: rotPos },
        properties: { isHandle: true },
      })
    }

    this.updatePreview(features, pointFeatures)
  }

  private computeEdgeLength(i: number, j: number): number {
    return turf.distance(turf.point(this.vertices[i]), turf.point(this.vertices[j]), {
      units: 'meters',
    })
  }
}
