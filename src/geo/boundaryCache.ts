import { computeBoundaries, buildLanePolygon, laneMidpointInfo } from './laneGeometry'
import type { Feature, LineString, Polygon, Point } from 'geojson'
import type { LaneFeature } from '../types/editor'

interface CachedBoundary {
  centerLineRef: Feature<LineString>
  width: number
  left: Feature<LineString>
  right: Feature<LineString>
  polygon: Feature<Polygon>
  midpoint: { point: Feature<Point>; bearing: number }
}

const cache = new Map<string, CachedBoundary>()

/**
 * Get cached boundary data for a lane, or compute and cache it.
 * Uses reference equality on centerLine + width to detect invalidation.
 * With Immer, unchanged lanes keep the same object references.
 */
export function getOrComputeBoundary(lane: LaneFeature): CachedBoundary {
  const entry = cache.get(lane.id)
  if (entry && entry.centerLineRef === lane.centerLine && entry.width === lane.width) {
    return entry
  }

  const { left, right } = computeBoundaries(lane.centerLine, lane.width)
  const polygon = buildLanePolygon(left, right)
  const midpoint = laneMidpointInfo(lane.centerLine)
  const newEntry: CachedBoundary = {
    centerLineRef: lane.centerLine,
    width: lane.width,
    left,
    right,
    polygon,
    midpoint,
  }
  cache.set(lane.id, newEntry)
  return newEntry
}

export function clearBoundaryCache() {
  cache.clear()
}

/**
 * Remove cache entries for lanes that no longer exist.
 */
export function pruneCache(currentLaneIds: Set<string>) {
  for (const id of cache.keys()) {
    if (!currentLaneIds.has(id)) {
      cache.delete(id)
    }
  }
}

/**
 * Pre-compute boundaries for a batch of lanes asynchronously,
 * yielding to the UI thread between chunks to prevent freezing.
 */
export async function precomputeBoundariesAsync(
  lanes: LaneFeature[],
  onProgress?: (fraction: number) => void,
  chunkSize = 200
): Promise<void> {
  for (let i = 0; i < lanes.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, lanes.length)
    for (let j = i; j < end; j++) {
      try {
        getOrComputeBoundary(lanes[j])
      } catch {
        // skip malformed geometry
      }
    }
    onProgress?.(end / lanes.length)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
