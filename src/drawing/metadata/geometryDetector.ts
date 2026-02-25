import type { Feature, Polygon } from 'geojson'
import type { ToolMeta } from '../primitives/types'

/**
 * Heuristic geometry detection for maps without mantissa encoding.
 * Three-level fallback: encoded → detected → default.
 */

/** Detect if a polygon is a rotatable rectangle (4 vertices with right angles) */
export function detectRotatableRect(polygon: Feature<Polygon>): ToolMeta | null {
  const coords = polygon.geometry.coordinates[0]
  if (!coords || coords.length < 4) return null

  // Remove closing vertex if present
  const vertices =
    coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
      ? coords.slice(0, -1)
      : coords

  if (vertices.length !== 4) return null

  // Check all 4 angles are approximately 90°
  for (let i = 0; i < 4; i++) {
    const a = vertices[i]
    const b = vertices[(i + 1) % 4]
    const c = vertices[(i + 2) % 4]
    const angle = angleBetweenPoints(a, b, c)
    // Tolerance ~1° (0.018 radians)
    if (Math.abs(angle - Math.PI / 2) > 0.018) return null
  }

  // It's a rectangle — extract rotation, width, height
  const p0 = vertices[0]
  const p1 = vertices[1]
  const p2 = vertices[2]

  const dx01 = p1[0] - p0[0]
  const dy01 = p1[1] - p0[1]
  const rotation = Math.atan2(dy01, dx01)

  const width = Math.sqrt(dx01 * dx01 + dy01 * dy01) * 111320 // rough deg→m at equator
  const dx12 = p2[0] - p1[0]
  const dy12 = p2[1] - p1[1]
  const height = Math.sqrt(dx12 * dx12 + dy12 * dy12) * 111320

  return {
    tool: 'rotatable_rect',
    rotation,
    width,
    height,
  }
}

/**
 * Detect the most likely drawing tool for any geometry.
 * Used as Level 2 fallback when mantissa decoding fails.
 */
export function detectToolFromGeometry(geometryType: string, polygon?: Feature<Polygon>): ToolMeta {
  if (geometryType === 'Polygon' && polygon) {
    const rectMeta = detectRotatableRect(polygon)
    if (rectMeta) return rectMeta
    return { tool: 'polygon' }
  }

  if (geometryType === 'LineString') return { tool: 'line' }
  if (geometryType === 'Point') return { tool: 'point' }

  // Level 3: absolute default
  return { tool: 'polygon' }
}

/** Compute the angle at vertex b in the triangle a-b-c (in radians) */
function angleBetweenPoints(a: number[], b: number[], c: number[]): number {
  const ba = [a[0] - b[0], a[1] - b[1]]
  const bc = [c[0] - b[0], c[1] - b[1]]
  const dot = ba[0] * bc[0] + ba[1] * bc[1]
  const magBA = Math.sqrt(ba[0] * ba[0] + ba[1] * ba[1])
  const magBC = Math.sqrt(bc[0] * bc[0] + bc[1] * bc[1])
  if (magBA === 0 || magBC === 0) return 0
  const cos = Math.max(-1, Math.min(1, dot / (magBA * magBC)))
  return Math.acos(cos)
}
