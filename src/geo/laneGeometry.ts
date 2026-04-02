import * as turf from '@turf/turf'
import type { Feature, LineString, Polygon, Point, Position } from 'geojson'
import type { LaneSampleAssociation } from '../types/apollo-map'

/**
 * Remove near-duplicate consecutive points from a LineString.
 * Points closer than `minDistMeters` are collapsed to avoid
 * degenerate segments that cause miter spikes in lineOffset.
 */
function deduplicateVertices(line: Feature<LineString>, minDistMeters = 0.05): Feature<LineString> {
  const coords = line.geometry.coordinates
  if (coords.length < 2) return line

  const cleaned: Position[] = [coords[0]]
  for (let i = 1; i < coords.length; i++) {
    const prev = cleaned[cleaned.length - 1]
    const cur = coords[i]
    const dist = turf.distance(turf.point(prev), turf.point(cur), { units: 'meters' })
    if (dist >= minDistMeters) {
      cleaned.push(cur)
    }
  }
  // Always keep the last point
  const last = coords[coords.length - 1]
  const keptLast = cleaned[cleaned.length - 1]
  if (keptLast[0] !== last[0] || keptLast[1] !== last[1]) {
    cleaned.push(last)
  }

  if (cleaned.length < 2) return line

  return {
    ...line,
    geometry: { ...line.geometry, coordinates: cleaned },
  }
}

/**
 * Remove outlier vertices from an offset line.
 * Any vertex farther than `maxDistMeters` from the original centerline
 * is replaced by the nearest point on the centerline offset by the
 * expected distance — effectively clamping miter spikes.
 */
function clampOffsetOutliers(
  offsetLine: Feature<LineString>,
  centerLine: Feature<LineString>,
  expectedDistMeters: number
): Feature<LineString> {
  const maxDist = expectedDistMeters * 3
  const coords = offsetLine.geometry.coordinates
  const clamped: Position[] = []

  for (const coord of coords) {
    const nearest = turf.nearestPointOnLine(centerLine, turf.point(coord), { units: 'meters' })
    const dist = nearest.properties?.dist ?? 0
    if (dist <= maxDist) {
      clamped.push(coord)
    } else {
      // Replace with the nearest point on the centerline — not perfect,
      // but prevents the polygon from flying off screen.
      clamped.push(nearest.geometry.coordinates)
    }
  }

  return {
    ...offsetLine,
    geometry: { ...offsetLine.geometry, coordinates: clamped },
  }
}

/**
 * Compute left and right boundary lines by offsetting the center line.
 * Returns GeoJSON LineString features in WGS84.
 *
 * Pre-cleans near-duplicate vertices and post-clamps miter spikes
 * to prevent outlier points from corrupting the fill polygon.
 */
export function computeBoundaries(
  centerLine: Feature<LineString>,
  widthMeters: number
): { left: Feature<LineString>; right: Feature<LineString> } {
  const halfWidth = widthMeters / 2
  const cleaned = deduplicateVertices(centerLine)

  let left = turf.lineOffset(cleaned, halfWidth, { units: 'meters' })
  let right = turf.lineOffset(cleaned, -halfWidth, { units: 'meters' })

  left = clampOffsetOutliers(left, cleaned, halfWidth)
  right = clampOffsetOutliers(right, cleaned, halfWidth)

  return { left, right }
}

/**
 * Sample the lane width at every meter along the centerline.
 * Returns LaneSampleAssociation[] for left and right boundaries.
 */
export function computeLaneSamples(
  centerLine: Feature<LineString>,
  widthMeters: number
): { leftSample: LaneSampleAssociation[]; rightSample: LaneSampleAssociation[] } {
  const totalLength = turf.length(centerLine, { units: 'meters' })
  const halfWidth = widthMeters / 2
  const leftSample: LaneSampleAssociation[] = []
  const rightSample: LaneSampleAssociation[] = []

  for (let s = 0; s <= totalLength; s += 1.0) {
    leftSample.push({ s, width: halfWidth })
    rightSample.push({ s, width: halfWidth })
  }
  // Always include the endpoint
  if (totalLength % 1.0 !== 0) {
    leftSample.push({ s: totalLength, width: halfWidth })
    rightSample.push({ s: totalLength, width: halfWidth })
  }

  return { leftSample, rightSample }
}

/**
 * Sample points along a line at 1m intervals.
 * Used for generating Curve segments.
 */
export function sampleLineEveryMeter(line: Feature<LineString>, intervalMeters = 1.0): Position[] {
  const totalLength = turf.length(line, { units: 'meters' })
  const points: Position[] = []

  for (let s = 0; s <= totalLength; s += intervalMeters) {
    const pt = turf.along(line, s, { units: 'meters' })
    points.push(pt.geometry.coordinates)
  }

  // Include exact endpoint
  const coords = line.geometry.coordinates
  const last = coords[coords.length - 1]
  const lastSampled = points[points.length - 1]
  if (lastSampled[0] !== last[0] || lastSampled[1] !== last[1]) {
    points.push(last)
  }

  return points
}

/**
 * Compute the heading (bearing) at the start of a line segment, in radians.
 */
export function computeStartHeading(line: Feature<LineString>): number {
  const coords = line.geometry.coordinates
  if (coords.length < 2) return 0
  const bearing = turf.bearing(turf.point(coords[0]), turf.point(coords[1]))
  // Convert from compass bearing (N=0, CW) to math angle (E=0, CCW)
  return ((90 - bearing) * Math.PI) / 180
}

/**
 * Find the s-coordinate of a point on a line (distance from start).
 */
export function pointToS(line: Feature<LineString>, point: Position): number {
  const nearestPoint = turf.nearestPointOnLine(line, turf.point(point))
  return nearestPoint.properties?.location ?? 0
}

/**
 * Get start and end points of a line.
 */
export function lineEndpoints(line: Feature<LineString>): {
  start: Position
  end: Position
} {
  const coords = line.geometry.coordinates
  return {
    start: coords[0],
    end: coords[coords.length - 1],
  }
}

/**
 * Build a filled lane polygon from left + right boundary lines.
 * Ring: left-start → left-end → right-end → right-start → close
 */
export function buildLanePolygon(
  left: Feature<LineString>,
  right: Feature<LineString>
): Feature<Polygon> {
  const leftCoords = left.geometry.coordinates
  const rightCoords = right.geometry.coordinates
  const ring: Position[] = [...leftCoords, ...rightCoords.slice().reverse(), leftCoords[0]]
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: {},
  }
}

/**
 * Return the midpoint of the centerline and the overall bearing (degrees CW from N).
 * Used for direction arrows.
 */
export function laneMidpointInfo(centerLine: Feature<LineString>): {
  point: Feature<Point>
  bearing: number
} {
  const totalLength = turf.length(centerLine, { units: 'meters' })
  const mid = turf.along(centerLine, totalLength / 2, { units: 'meters' })

  // Bearing from first to last point gives the overall lane direction
  const coords = centerLine.geometry.coordinates
  const bearing = turf.bearing(turf.point(coords[0]), turf.point(coords[coords.length - 1]))

  return { point: mid, bearing }
}
