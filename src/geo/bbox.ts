/** Compute the axis-aligned bounding box for an array of [x, y] coordinates. */
export function buildBBox(coords: number[][]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const [x, y] of coords) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}
