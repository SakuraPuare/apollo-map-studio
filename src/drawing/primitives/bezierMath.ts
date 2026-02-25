/**
 * Cubic bezier curve math utilities.
 */

/** Evaluate a cubic bezier at parameter t ∈ [0, 1] */
export function cubicBezier(
  p0: [number, number],
  cp1: [number, number],
  cp2: [number, number],
  p1: [number, number],
  t: number
): [number, number] {
  const t2 = t * t
  const t3 = t2 * t
  const mt = 1 - t
  const mt2 = mt * mt
  const mt3 = mt2 * mt

  return [
    mt3 * p0[0] + 3 * mt2 * t * cp1[0] + 3 * mt * t2 * cp2[0] + t3 * p1[0],
    mt3 * p0[1] + 3 * mt2 * t * cp1[1] + 3 * mt * t2 * cp2[1] + t3 * p1[1],
  ]
}

/** Evaluate the derivative of a cubic bezier at parameter t */
export function cubicBezierDerivative(
  p0: [number, number],
  cp1: [number, number],
  cp2: [number, number],
  p1: [number, number],
  t: number
): [number, number] {
  const mt = 1 - t
  return [
    3 * mt * mt * (cp1[0] - p0[0]) + 6 * mt * t * (cp2[0] - cp1[0]) + 3 * t * t * (p1[0] - cp2[0]),
    3 * mt * mt * (cp1[1] - p0[1]) + 6 * mt * t * (cp2[1] - cp1[1]) + 3 * t * t * (p1[1] - cp2[1]),
  ]
}

export interface BezierSegment {
  anchor0: [number, number]
  cp1: [number, number] // control point near anchor0
  cp2: [number, number] // control point near anchor1
  anchor1: [number, number]
}

/**
 * Sample a cubic bezier curve into a polyline with approximately
 * the given number of samples per segment.
 */
export function sampleBezierCurve(
  segments: BezierSegment[],
  samplesPerSegment = 20
): [number, number][] {
  if (segments.length === 0) return []

  const points: [number, number][] = [segments[0].anchor0]

  for (const seg of segments) {
    for (let i = 1; i <= samplesPerSegment; i++) {
      const t = i / samplesPerSegment
      points.push(cubicBezier(seg.anchor0, seg.cp1, seg.cp2, seg.anchor1, t))
    }
  }

  return points
}

/**
 * Compute the approximate arc length of a bezier segment
 * by sampling and summing chord lengths.
 */
export function bezierSegmentLength(seg: BezierSegment, samples = 50): number {
  let length = 0
  let prev = seg.anchor0
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    const curr = cubicBezier(seg.anchor0, seg.cp1, seg.cp2, seg.anchor1, t)
    const dx = curr[0] - prev[0]
    const dy = curr[1] - prev[1]
    length += Math.sqrt(dx * dx + dy * dy)
    prev = curr
  }
  return length
}

/**
 * Create default symmetric control points for an anchor pair.
 * The control points are placed at 1/3 and 2/3 along the straight line.
 */
export function defaultControlPoints(
  p0: [number, number],
  p1: [number, number]
): { cp1: [number, number]; cp2: [number, number] } {
  return {
    cp1: [p0[0] + (p1[0] - p0[0]) / 3, p0[1] + (p1[1] - p0[1]) / 3],
    cp2: [p0[0] + ((p1[0] - p0[0]) * 2) / 3, p0[1] + ((p1[1] - p0[1]) * 2) / 3],
  }
}

/**
 * Reflect a control point across an anchor to create a smooth tangent.
 */
export function reflectControlPoint(
  cp: [number, number],
  anchor: [number, number]
): [number, number] {
  return [2 * anchor[0] - cp[0], 2 * anchor[1] - cp[1]]
}
