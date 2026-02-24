import * as turf from '@turf/turf'
import type { Feature, LineString, Position } from 'geojson'

const SNAP_THRESHOLD_METERS = 5

/**
 * If the end of fromLine is within threshold of the start of toLine,
 * return a copy of toLine with its first coordinate snapped to fromLine's end.
 * Returns null if not within threshold.
 */
export function snapLaneEndpoints(
  fromLine: Feature<LineString>,
  toLine: Feature<LineString>,
  thresholdMeters = SNAP_THRESHOLD_METERS
): { snappedToLine: Feature<LineString> } | null {
  const fromCoords = fromLine.geometry.coordinates
  const toCoords = toLine.geometry.coordinates

  const fromEnd: Position = fromCoords[fromCoords.length - 1]
  const toStart: Position = toCoords[0]

  const distance = turf.distance(turf.point(fromEnd), turf.point(toStart), { units: 'meters' })

  if (distance > thresholdMeters) return null

  const newToCoords = [fromEnd, ...toCoords.slice(1)]
  const snappedToLine: Feature<LineString> = {
    ...toLine,
    geometry: { type: 'LineString', coordinates: newToCoords },
  }

  return { snappedToLine }
}
