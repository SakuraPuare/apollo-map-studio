/**
 * Cubic Bezier curve utilities for the pen tool.
 * Handles evaluation, adaptive flattening, and handle mirroring.
 */

import type { Position } from 'geojson'

export interface BezierAnchor {
  position: Position // [lng, lat]
  handleIn: Position | null // incoming control point
  handleOut: Position | null // outgoing control point
  symmetric: boolean // true = handles mirror each other
}

/** Evaluate a cubic bezier at parameter t ∈ [0, 1]. */
export function evaluateCubicBezier(
  p0: Position,
  p1: Position,
  p2: Position,
  p3: Position,
  t: number
): Position {
  const u = 1 - t
  const uu = u * u
  const uuu = uu * u
  const tt = t * t
  const ttt = tt * t

  return [
    uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0],
    uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1],
  ]
}

/** Mirror a handle across an anchor point: 2*anchor - handle. */
export function mirrorHandle(anchor: Position, handle: Position): Position {
  return [2 * anchor[0] - handle[0], 2 * anchor[1] - handle[1]]
}

/**
 * Flatten a bezier path (sequence of anchors) to a dense polyline.
 * Uses adaptive subdivision: tight curves get more points, straight segments fewer.
 *
 * @param anchors - The bezier anchor sequence (≥2 anchors)
 * @param tolerance - Max allowed deviation in degrees (~0.000003° ≈ 0.3m at equator)
 * @returns Dense polyline coordinates
 */
export function flattenBezier(anchors: BezierAnchor[], tolerance = 0.000003): Position[] {
  if (anchors.length < 2) {
    return anchors.map((a) => a.position)
  }

  const result: Position[] = [anchors[0].position]

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i]
    const b = anchors[i + 1]
    const p0 = a.position
    const p1 = a.handleOut ?? a.position
    const p2 = b.handleIn ?? b.position
    const p3 = b.position

    subdivideBezierSegment(p0, p1, p2, p3, tolerance, 0, result)
    result.push(p3)
  }

  return result
}

const MAX_DEPTH = 8

/**
 * Recursively subdivide a cubic bezier segment until the chord
 * approximation is within tolerance.
 */
function subdivideBezierSegment(
  p0: Position,
  p1: Position,
  p2: Position,
  p3: Position,
  tolerance: number,
  depth: number,
  out: Position[]
): void {
  if (depth >= MAX_DEPTH) return

  // Check if the control points deviate from the chord p0→p3
  const deviation = Math.max(pointToLineDistance(p1, p0, p3), pointToLineDistance(p2, p0, p3))

  if (deviation <= tolerance) return

  // De Casteljau split at t=0.5
  const mid01: Position = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
  const mid12: Position = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
  const mid23: Position = [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2]
  const mid012: Position = [(mid01[0] + mid12[0]) / 2, (mid01[1] + mid12[1]) / 2]
  const mid123: Position = [(mid12[0] + mid23[0]) / 2, (mid12[1] + mid23[1]) / 2]
  const midpoint: Position = [(mid012[0] + mid123[0]) / 2, (mid012[1] + mid123[1]) / 2]

  // Recurse left half, emit midpoint, recurse right half
  subdivideBezierSegment(p0, mid01, mid012, midpoint, tolerance, depth + 1, out)
  out.push(midpoint)
  subdivideBezierSegment(midpoint, mid123, mid23, p3, tolerance, depth + 1, out)
}

/** Perpendicular distance from point to line segment (in coordinate space). */
function pointToLineDistance(point: Position, lineStart: Position, lineEnd: Position): number {
  const dx = lineEnd[0] - lineStart[0]
  const dy = lineEnd[1] - lineStart[1]
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) {
    // Degenerate: start === end
    const ex = point[0] - lineStart[0]
    const ey = point[1] - lineStart[1]
    return Math.sqrt(ex * ex + ey * ey)
  }
  // Cross product gives area of parallelogram; divide by base length for height
  const cross = Math.abs((point[0] - lineStart[0]) * dy - (point[1] - lineStart[1]) * dx)
  return cross / Math.sqrt(lenSq)
}
