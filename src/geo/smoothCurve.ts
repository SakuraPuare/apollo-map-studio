/**
 * Smooth a polyline using Chaikin's corner-cutting algorithm.
 * This is a placeholder for a full Bezier/pen tool implementation.
 *
 * Each iteration replaces each segment with two new points at 25% and 75%
 * along the segment, progressively rounding corners while preserving
 * the overall shape.
 */

import type { Position } from 'geojson'

export function smoothPolyline(coords: Position[], iterations = 3): Position[] {
  if (coords.length < 3) return coords

  let result = coords
  for (let i = 0; i < iterations; i++) {
    result = chaikinStep(result)
  }
  return result
}

function chaikinStep(coords: Position[]): Position[] {
  if (coords.length < 2) return coords

  const out: Position[] = [coords[0]] // keep first point

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i]
    const p1 = coords[i + 1]

    // 25% point
    const q: Position = [p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25]
    // 75% point
    const r: Position = [p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75]

    out.push(q, r)
  }

  out.push(coords[coords.length - 1]) // keep last point
  return out
}
