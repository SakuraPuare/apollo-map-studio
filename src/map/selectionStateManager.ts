import type { Map as MapLibreMap } from 'maplibre-gl'
import type { LaneFeature, RoadDefinition } from '../types/editor'

/**
 * All GeoJSON source IDs that participate in selection highlighting.
 * These sources must be created with `promoteId: 'id'`.
 */
export const SELECTABLE_SOURCES = [
  'lane-fills',
  'lane-centers',
  'junctions',
  'crosswalks',
  'signals',
  'stop-signs',
  'clear-areas',
  'speed-bumps',
  'parking-spaces',
] as const

// ── Internal state ──────────────────────────────────────────────────────
let _map: MapLibreMap | null = null
let _currentSelectedSet = new Set<string>()

/**
 * Initialize the selection manager with a MapLibre map instance.
 * Call once after map 'load' fires.
 */
export function initSelectionManager(map: MapLibreMap): void {
  _map = map
  _currentSelectedSet = new Set()
}

/**
 * Expand raw selectedIds: if a road is selected, include all its lanes.
 */
function expandSelection(
  selectedIds: string[],
  lanes: Record<string, LaneFeature>,
  roads: Record<string, RoadDefinition>
): Set<string> {
  const expanded = new Set(selectedIds)
  for (const selId of selectedIds) {
    if (roads[selId]) {
      for (const id in lanes) {
        if (lanes[id].roadId === selId) expanded.add(id)
      }
    }
  }
  return expanded
}

/**
 * Apply selection state by diffing old vs new selected IDs.
 * Only calls setFeatureState/removeFeatureState for changed IDs.
 *
 * Performance: O(k * s) where k = changed IDs (usually 1-2), s = 9 sources.
 * Typically < 1ms even for road selection with many lanes.
 */
export function applySelectionState(
  selectedIds: string[],
  lanes: Record<string, LaneFeature>,
  roads: Record<string, RoadDefinition>
): void {
  if (!_map) return

  const newSelected = expandSelection(selectedIds, lanes, roads)

  // Diff: find IDs to deselect and IDs to select
  const toDeselect: string[] = []
  const toSelect: string[] = []

  for (const id of _currentSelectedSet) {
    if (!newSelected.has(id)) toDeselect.push(id)
  }
  for (const id of newSelected) {
    if (!_currentSelectedSet.has(id)) toSelect.push(id)
  }

  // Apply changes — setFeatureState on a nonexistent feature ID is a no-op
  for (const id of toDeselect) {
    for (const source of SELECTABLE_SOURCES) {
      _map.removeFeatureState({ source, id }, 'selected')
    }
  }
  for (const id of toSelect) {
    for (const source of SELECTABLE_SOURCES) {
      _map.setFeatureState({ source, id }, { selected: true })
    }
  }

  // Update tracked state for future diffs and reapply
  _currentSelectedSet = newSelected
}

/**
 * Re-apply current selection state to all sources.
 * Must be called after any setData() call, because setData clears
 * MapLibre's internal feature state for that source.
 */
export function reapplySelectionState(): void {
  if (!_map || _currentSelectedSet.size === 0) return

  for (const id of _currentSelectedSet) {
    for (const source of SELECTABLE_SOURCES) {
      _map.setFeatureState({ source, id }, { selected: true })
    }
  }
}

/**
 * Clear all selection state and reset internal tracking.
 */
export function clearSelectionState(): void {
  if (_map) {
    for (const id of _currentSelectedSet) {
      for (const source of SELECTABLE_SOURCES) {
        _map.removeFeatureState({ source, id }, 'selected')
      }
    }
  }
  _currentSelectedSet = new Set()
  _map = null
}
