import RBush from 'rbush'
import * as turf from '@turf/turf'
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl'
import type {
  LaneFeature,
  RoadDefinition,
  JunctionFeature,
  CrosswalkFeature,
  SignalFeature,
  StopSignFeature,
  ClearAreaFeature,
  SpeedBumpFeature,
  ParkingSpaceFeature,
} from '../types/editor'
import { buildBBox } from '../geo/bbox'
import { getOrComputeBoundary, pruneCache } from '../geo/boundaryCache'
import { reapplySelectionState } from './selectionStateManager'
import { buildLaneFeaturesInto, type LaneFeatureArrays } from './laneFeatureBuilder'
import { useMapStore } from '../store/mapStore'
import { useUIStore } from '../store/uiStore'

// ── Spatial index types ────────────────────────────────────────────────────

interface SpatialEntry {
  minX: number
  minY: number
  maxX: number
  maxY: number
  id: string
  elementType:
    | 'lane'
    | 'junction'
    | 'crosswalk'
    | 'signal'
    | 'stop_sign'
    | 'clear_area'
    | 'speed_bump'
    | 'parking_space'
}

// ── Module state ───────────────────────────────────────────────────────────

const _tree = new RBush<SpatialEntry>()
const _entryById = new Map<string, SpatialEntry>()

let _visibleLaneIds = new Set<string>()
let _visibleIds: Record<string, Set<string>> = {}

// Immer reference tracking for incremental updates
let _prevLanes: Record<string, LaneFeature> | null = null
let _prevRoads: Record<string, RoadDefinition> | null = null
let _prevJunctions: Record<string, JunctionFeature> | null = null
let _prevCrosswalks: Record<string, CrosswalkFeature> | null = null
let _prevSignals: Record<string, SignalFeature> | null = null
let _prevStopSigns: Record<string, StopSignFeature> | null = null
let _prevClearAreas: Record<string, ClearAreaFeature> | null = null
let _prevSpeedBumps: Record<string, SpeedBumpFeature> | null = null
let _prevParkingSpaces: Record<string, ParkingSpaceFeature> | null = null
let _prevLaneMap = new Map<string, LaneFeature>()

let _unculledMode = false
let _initialized = false

// ── Helpers ────────────────────────────────────────────────────────────────

function src(map: MapLibreMap, id: string): GeoJSONSource | undefined {
  const s = map.getSource(id)
  return s && 'updateData' in s ? (s as GeoJSONSource) : undefined
}

function makeLaneEntry(lane: LaneFeature): SpatialEntry {
  try {
    const cached = getOrComputeBoundary(lane)
    const coords = cached.polygon.geometry.coordinates[0] as number[][]
    const bbox = buildBBox(coords)
    return { ...bbox, id: lane.id, elementType: 'lane' }
  } catch {
    // Fallback to centerline bbox for malformed geometry
    const bbox = buildBBox(lane.centerLine.geometry.coordinates as number[][])
    return { ...bbox, id: lane.id, elementType: 'lane' }
  }
}

function makePolygonEntry(
  id: string,
  coords: number[][],
  elementType: SpatialEntry['elementType']
): SpatialEntry {
  const bbox = buildBBox(coords)
  return { ...bbox, id, elementType }
}

function makeLineEntry(
  id: string,
  coords: number[][],
  elementType: SpatialEntry['elementType']
): SpatialEntry {
  const bbox = buildBBox(coords)
  return { ...bbox, id, elementType }
}

function laneCompositeIds(laneId: string): string[] {
  return [laneId, `${laneId}__left`, `${laneId}__right`, `${laneId}__fwd`, `${laneId}__bwd`]
}

// ── Public API ─────────────────────────────────────────────────────────────

export function isInitialized(): boolean {
  return _initialized
}

export function resetCuller(): void {
  _tree.clear()
  _entryById.clear()
  _visibleLaneIds = new Set()
  _visibleIds = {}
  _prevLanes = null
  _prevRoads = null
  _prevJunctions = null
  _prevCrosswalks = null
  _prevSignals = null
  _prevStopSigns = null
  _prevClearAreas = null
  _prevSpeedBumps = null
  _prevParkingSpaces = null
  _prevLaneMap = new Map()
  _unculledMode = false
  _initialized = false
}

/**
 * Build the RBush index from all current store data.
 * Yields to the UI thread between chunks to avoid freezing.
 */
export async function initFromImport(
  map: MapLibreMap,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const state = useMapStore.getState()
  const {
    lanes,
    roads,
    junctions,
    crosswalks,
    signals,
    stopSigns,
    clearAreas,
    speedBumps,
    parkingSpaces,
  } = state

  _tree.clear()
  _entryById.clear()

  const entries: SpatialEntry[] = []
  const laneArr = Object.values(lanes)

  // Build entries in chunks of 500 for lanes (warm boundary cache)
  const CHUNK = 500
  for (let i = 0; i < laneArr.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, laneArr.length)
    for (let j = i; j < end; j++) {
      try {
        const entry = makeLaneEntry(laneArr[j])
        entries.push(entry)
        _entryById.set(entry.id, entry)
      } catch {
        // skip malformed
      }
    }
    onProgress?.((end / laneArr.length) * 0.7)
    await new Promise((r) => setTimeout(r, 0))
  }

  // Junctions
  for (const j of Object.values(junctions)) {
    const entry = makePolygonEntry(
      j.id,
      j.polygon.geometry.coordinates[0] as number[][],
      'junction'
    )
    entries.push(entry)
    _entryById.set(entry.id, entry)
  }

  // Crosswalks
  for (const cw of Object.values(crosswalks)) {
    const entry = makePolygonEntry(
      cw.id,
      cw.polygon.geometry.coordinates[0] as number[][],
      'crosswalk'
    )
    entries.push(entry)
    _entryById.set(entry.id, entry)
  }

  // Signals
  for (const sig of Object.values(signals)) {
    const entry = makeLineEntry(sig.id, sig.stopLine.geometry.coordinates as number[][], 'signal')
    entries.push(entry)
    _entryById.set(entry.id, entry)
  }

  // Stop signs
  for (const ss of Object.values(stopSigns)) {
    const entry = makeLineEntry(ss.id, ss.stopLine.geometry.coordinates as number[][], 'stop_sign')
    entries.push(entry)
    _entryById.set(entry.id, entry)
  }

  // Clear areas
  for (const ca of Object.values(clearAreas)) {
    const entry = makePolygonEntry(
      ca.id,
      ca.polygon.geometry.coordinates[0] as number[][],
      'clear_area'
    )
    entries.push(entry)
    _entryById.set(entry.id, entry)
  }

  // Speed bumps
  for (const sb of Object.values(speedBumps)) {
    const entry = makeLineEntry(sb.id, sb.line.geometry.coordinates as number[][], 'speed_bump')
    entries.push(entry)
    _entryById.set(entry.id, entry)
  }

  // Parking spaces
  for (const ps of Object.values(parkingSpaces)) {
    const entry = makePolygonEntry(
      ps.id,
      ps.polygon.geometry.coordinates[0] as number[][],
      'parking_space'
    )
    entries.push(entry)
    _entryById.set(entry.id, entry)
  }

  _tree.load(entries)
  onProgress?.(0.9)

  // Snapshot refs for incremental tracking
  _prevLanes = lanes
  _prevRoads = roads
  _prevJunctions = junctions
  _prevCrosswalks = crosswalks
  _prevSignals = signals
  _prevStopSigns = stopSigns
  _prevClearAreas = clearAreas
  _prevSpeedBumps = speedBumps
  _prevParkingSpaces = parkingSpaces
  _prevLaneMap = new Map(Object.entries(lanes))

  // Prune boundary cache for deleted lanes
  pruneCache(new Set(Object.keys(lanes)))

  _initialized = true
  onProgress?.(1)

  syncViewport(map)
}

/**
 * Query the spatial index with the padded viewport and incrementally
 * update MapLibre sources for entering/leaving elements.
 */
export function syncViewport(map: MapLibreMap): void {
  if (!_initialized) return

  const state = useMapStore.getState()
  const {
    lanes,
    roads,
    junctions,
    crosswalks,
    signals,
    stopSigns,
    clearAreas,
    speedBumps,
    parkingSpaces,
  } = state
  const { selectedIds, layerVisibility } = useUIStore.getState()
  const selectedSet = new Set(selectedIds)

  // Compute padded viewport bounds (50% padding on each side)
  const bounds = map.getBounds()
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()
  const lngSpan = ne.lng - sw.lng
  const latSpan = ne.lat - sw.lat
  const padLng = lngSpan * 0.5
  const padLat = latSpan * 0.5

  const queryBBox = {
    minX: sw.lng - padLng,
    minY: sw.lat - padLat,
    maxX: ne.lng + padLng,
    maxY: ne.lat + padLat,
  }

  const results = _tree.search(queryBBox)

  // Hysteresis for unculled mode
  if (!_unculledMode && results.length > 10000) {
    _unculledMode = true
  } else if (_unculledMode && results.length < 8000) {
    _unculledMode = false
  }

  // Partition results by type
  const queryLaneIds = new Set<string>()
  const queryIds: Record<string, Set<string>> = {
    junctions: new Set(),
    crosswalks: new Set(),
    signals: new Set(),
    'stop-signs': new Set(),
    'clear-areas': new Set(),
    'speed-bumps': new Set(),
    'parking-spaces': new Set(),
  }

  const typeToSource: Record<string, string> = {
    junction: 'junctions',
    crosswalk: 'crosswalks',
    signal: 'signals',
    stop_sign: 'stop-signs',
    clear_area: 'clear-areas',
    speed_bump: 'speed-bumps',
    parking_space: 'parking-spaces',
  }

  for (const entry of results) {
    if (entry.elementType === 'lane') {
      queryLaneIds.add(entry.id)
    } else {
      const srcName = typeToSource[entry.elementType]
      if (srcName) queryIds[srcName].add(entry.id)
    }
  }

  // Force-include selected elements
  for (const selId of selectedSet) {
    if (lanes[selId]) queryLaneIds.add(selId)
    else if (junctions[selId]) queryIds['junctions'].add(selId)
    else if (crosswalks[selId]) queryIds['crosswalks'].add(selId)
    else if (signals[selId]) queryIds['signals'].add(selId)
    else if (stopSigns[selId]) queryIds['stop-signs'].add(selId)
    else if (clearAreas[selId]) queryIds['clear-areas'].add(selId)
    else if (speedBumps[selId]) queryIds['speed-bumps'].add(selId)
    else if (parkingSpaces[selId]) queryIds['parking-spaces'].add(selId)
  }

  // ── Sync lanes ─────────────────────────────────────────────────────────

  if (layerVisibility['lanes'] !== false) {
    const entering = new Set<string>()
    const leaving = new Set<string>()
    const changed = new Set<string>()

    for (const id of queryLaneIds) {
      if (!_visibleLaneIds.has(id)) {
        entering.add(id)
      } else if (_prevLaneMap.get(id) !== lanes[id]) {
        changed.add(id)
      }
    }
    for (const id of _visibleLaneIds) {
      if (!queryLaneIds.has(id)) {
        leaving.add(id)
      }
    }

    // Remove leaving + changed
    if (leaving.size > 0 || changed.size > 0) {
      const removeIds: string[] = []
      for (const id of leaving) {
        removeIds.push(...laneCompositeIds(id))
      }
      for (const id of changed) {
        removeIds.push(...laneCompositeIds(id))
      }

      const fillSrc = src(map, 'lane-fills')
      const centerSrc = src(map, 'lane-centers')
      const boundarySrc = src(map, 'lane-boundaries')
      const arrowSrc = src(map, 'lane-arrows')

      if (fillSrc) {
        const fillRemove = [...leaving, ...changed]
        fillSrc.updateData({ remove: fillRemove })
      }
      if (centerSrc) {
        const centerRemove = [...leaving, ...changed]
        centerSrc.updateData({ remove: centerRemove })
      }
      if (boundarySrc) {
        const bndRemove: string[] = []
        for (const id of [...leaving, ...changed]) {
          bndRemove.push(`${id}__left`, `${id}__right`)
        }
        boundarySrc.updateData({ remove: bndRemove })
      }
      if (arrowSrc) {
        const arrowRemove: string[] = []
        for (const id of [...leaving, ...changed]) {
          arrowRemove.push(`${id}__fwd`, `${id}__bwd`)
        }
        arrowSrc.updateData({ remove: arrowRemove })
      }
    }

    // Add entering + changed
    if (entering.size > 0 || changed.size > 0) {
      const out: LaneFeatureArrays = { fill: [], center: [], boundary: [], arrow: [], conn: [] }
      for (const id of entering) {
        const lane = lanes[id]
        if (lane) {
          try {
            buildLaneFeaturesInto(lane, lanes, roads, out)
          } catch {
            // skip malformed
          }
        }
      }
      for (const id of changed) {
        const lane = lanes[id]
        if (lane) {
          try {
            buildLaneFeaturesInto(lane, lanes, roads, out)
          } catch {
            // skip malformed
          }
        }
      }

      const fillSrc = src(map, 'lane-fills')
      const centerSrc = src(map, 'lane-centers')
      const boundarySrc = src(map, 'lane-boundaries')
      const arrowSrc = src(map, 'lane-arrows')

      if (fillSrc && out.fill.length > 0) fillSrc.updateData({ add: out.fill })
      if (centerSrc && out.center.length > 0) centerSrc.updateData({ add: out.center })
      if (boundarySrc && out.boundary.length > 0) boundarySrc.updateData({ add: out.boundary })
      if (arrowSrc && out.arrow.length > 0) arrowSrc.updateData({ add: out.arrow })
    }

    _visibleLaneIds = queryLaneIds

    // Update lane ref map for change detection
    for (const id of queryLaneIds) {
      _prevLaneMap.set(id, lanes[id])
    }
  } else {
    // Lanes hidden — remove all
    if (_visibleLaneIds.size > 0) {
      src(map, 'lane-fills')?.updateData({ removeAll: true })
      src(map, 'lane-centers')?.updateData({ removeAll: true })
      src(map, 'lane-boundaries')?.updateData({ removeAll: true })
      src(map, 'lane-arrows')?.updateData({ removeAll: true })
      _visibleLaneIds = new Set()
    }
  }

  // ── Connections: full rebuild for all visible lanes ──────────────────

  if (layerVisibility['connections'] !== false && layerVisibility['lanes'] !== false) {
    const connFeatures: GeoJSON.Feature[] = []

    for (const id of _visibleLaneIds) {
      const lane = lanes[id]
      if (!lane) continue
      for (const succId of lane.successorIds) {
        const succ = lanes[succId]
        if (!succ) continue
        const fromCoords = lane.centerLine.geometry.coordinates
        const toCoords = succ.centerLine.geometry.coordinates
        connFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [fromCoords[fromCoords.length - 1], toCoords[0]],
          },
          properties: {
            id: `${lane.id}__${succId}`,
            fromId: lane.id,
            toId: succId,
          },
          id: `${lane.id}__${succId}`,
        })
      }
    }

    // Also include connections from off-screen predecessors to visible lanes
    for (const id of _visibleLaneIds) {
      const lane = lanes[id]
      if (!lane) continue
      for (const predId of lane.predecessorIds) {
        if (_visibleLaneIds.has(predId)) continue // already handled above
        const pred = lanes[predId]
        if (!pred) continue
        const fromCoords = pred.centerLine.geometry.coordinates
        const toCoords = lane.centerLine.geometry.coordinates
        connFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [fromCoords[fromCoords.length - 1], toCoords[0]],
          },
          properties: {
            id: `${predId}__${id}`,
            fromId: predId,
            toId: id,
          },
          id: `${predId}__${id}`,
        })
      }
    }

    const connSrc = src(map, 'lane-connections')
    if (connSrc) {
      connSrc.setData({
        type: 'FeatureCollection',
        features: connFeatures,
      })
    }
  } else {
    const connSrc = src(map, 'lane-connections')
    if (connSrc) {
      connSrc.setData({ type: 'FeatureCollection', features: [] })
    }
  }

  // ── Sync other element types ────────────────────────────────────────

  type ElementSyncConfig = {
    sourceId: string
    centroidSourceId?: string
    visibilityKey: string
    elements: Record<string, { id: string }>
    toFeature: (el: Record<string, unknown>) => GeoJSON.Feature
    toCentroid?: (el: Record<string, unknown>) => GeoJSON.Feature
  }

  const syncConfigs: ElementSyncConfig[] = [
    {
      sourceId: 'junctions',
      visibilityKey: 'junctions',
      elements: junctions as unknown as Record<string, { id: string }>,
      toFeature: (el) => ({
        type: 'Feature',
        geometry: (el as unknown as JunctionFeature).polygon.geometry,
        properties: { id: (el as unknown as JunctionFeature).id, type: 'junction' },
        id: (el as unknown as JunctionFeature).id,
      }),
    },
    {
      sourceId: 'crosswalks',
      centroidSourceId: 'crosswalk-centers',
      visibilityKey: 'crosswalks',
      elements: crosswalks as unknown as Record<string, { id: string }>,
      toFeature: (el) => ({
        type: 'Feature',
        geometry: (el as unknown as CrosswalkFeature).polygon.geometry,
        properties: { id: (el as unknown as CrosswalkFeature).id, type: 'crosswalk' },
        id: (el as unknown as CrosswalkFeature).id,
      }),
      toCentroid: (el) => {
        const cw = el as unknown as CrosswalkFeature
        const center = turf.centroid(cw.polygon)
        return {
          type: 'Feature',
          geometry: center.geometry,
          properties: { id: cw.id, type: 'crosswalk' },
          id: cw.id,
        }
      },
    },
    {
      sourceId: 'signals',
      visibilityKey: 'signals',
      elements: signals as unknown as Record<string, { id: string }>,
      toFeature: (el) => ({
        type: 'Feature',
        geometry: (el as unknown as SignalFeature).stopLine.geometry,
        properties: { id: (el as unknown as SignalFeature).id, type: 'signal' },
        id: (el as unknown as SignalFeature).id,
      }),
    },
    {
      sourceId: 'stop-signs',
      visibilityKey: 'stopSigns',
      elements: stopSigns as unknown as Record<string, { id: string }>,
      toFeature: (el) => ({
        type: 'Feature',
        geometry: (el as unknown as StopSignFeature).stopLine.geometry,
        properties: { id: (el as unknown as StopSignFeature).id, type: 'stop_sign' },
        id: (el as unknown as StopSignFeature).id,
      }),
    },
    {
      sourceId: 'clear-areas',
      centroidSourceId: 'clear-area-centers',
      visibilityKey: 'clearAreas',
      elements: clearAreas as unknown as Record<string, { id: string }>,
      toFeature: (el) => ({
        type: 'Feature',
        geometry: (el as unknown as ClearAreaFeature).polygon.geometry,
        properties: { id: (el as unknown as ClearAreaFeature).id, type: 'clear_area' },
        id: (el as unknown as ClearAreaFeature).id,
      }),
      toCentroid: (el) => {
        const ca = el as unknown as ClearAreaFeature
        const center = turf.centroid(ca.polygon)
        return {
          type: 'Feature',
          geometry: center.geometry,
          properties: { id: ca.id, type: 'clear_area' },
          id: ca.id,
        }
      },
    },
    {
      sourceId: 'speed-bumps',
      visibilityKey: 'speedBumps',
      elements: speedBumps as unknown as Record<string, { id: string }>,
      toFeature: (el) => ({
        type: 'Feature',
        geometry: (el as unknown as SpeedBumpFeature).line.geometry,
        properties: { id: (el as unknown as SpeedBumpFeature).id, type: 'speed_bump' },
        id: (el as unknown as SpeedBumpFeature).id,
      }),
    },
    {
      sourceId: 'parking-spaces',
      centroidSourceId: 'parking-centers',
      visibilityKey: 'parkingSpaces',
      elements: parkingSpaces as unknown as Record<string, { id: string }>,
      toFeature: (el) => ({
        type: 'Feature',
        geometry: (el as unknown as ParkingSpaceFeature).polygon.geometry,
        properties: { id: (el as unknown as ParkingSpaceFeature).id, type: 'parking_space' },
        id: (el as unknown as ParkingSpaceFeature).id,
      }),
      toCentroid: (el) => {
        const ps = el as unknown as ParkingSpaceFeature
        const center = turf.centroid(ps.polygon)
        return {
          type: 'Feature',
          geometry: center.geometry,
          properties: { id: ps.id, type: 'parking_space' },
          id: ps.id,
        }
      },
    },
  ]

  for (const cfg of syncConfigs) {
    const visible = layerVisibility[cfg.visibilityKey] !== false
    const prev = _visibleIds[cfg.sourceId] ?? new Set()
    const curr = visible ? (queryIds[cfg.sourceId] ?? new Set()) : new Set<string>()

    const entering: string[] = []
    const leaving: string[] = []

    for (const id of curr) {
      if (!prev.has(id)) entering.push(id)
    }
    for (const id of prev) {
      if (!curr.has(id)) leaving.push(id)
    }

    const s = src(map, cfg.sourceId)
    if (s) {
      if (leaving.length > 0) {
        s.updateData({ remove: leaving })
      }
      if (entering.length > 0) {
        const features: GeoJSON.Feature[] = []
        for (const id of entering) {
          const el = cfg.elements[id]
          if (el) {
            try {
              features.push(cfg.toFeature(el as unknown as Record<string, unknown>))
            } catch {
              // skip malformed
            }
          }
        }
        if (features.length > 0) s.updateData({ add: features })
      }
    }

    // Centroid source
    if (cfg.centroidSourceId && cfg.toCentroid) {
      const cs = src(map, cfg.centroidSourceId)
      if (cs) {
        if (leaving.length > 0) {
          cs.updateData({ remove: leaving })
        }
        if (entering.length > 0) {
          const centroids: GeoJSON.Feature[] = []
          for (const id of entering) {
            const el = cfg.elements[id]
            if (el) {
              try {
                centroids.push(cfg.toCentroid(el as unknown as Record<string, unknown>))
              } catch {
                // skip
              }
            }
          }
          if (centroids.length > 0) cs.updateData({ add: centroids })
        }
      }
    }

    _visibleIds[cfg.sourceId] = curr
  }

  reapplySelectionState()
}

/**
 * Called after store mutations. Maintains the RBush index incrementally
 * by diffing Immer references, then syncs the viewport.
 */
export function onStoreChange(map: MapLibreMap): void {
  if (!_initialized) return

  updateIndex()
  syncViewport(map)
}

// ── Index maintenance ──────────────────────────────────────────────────────

function updateIndex(): void {
  const state = useMapStore.getState()
  const {
    lanes,
    roads,
    junctions,
    crosswalks,
    signals,
    stopSigns,
    clearAreas,
    speedBumps,
    parkingSpaces,
  } = state

  let changeCount = 0

  // Detect changed road IDs (affects lane fill colors)
  const changedRoadIds = new Set<string>()
  if (_prevRoads && roads !== _prevRoads) {
    for (const id of Object.keys(roads)) {
      if (roads[id] !== _prevRoads[id]) changedRoadIds.add(id)
    }
    for (const id of Object.keys(_prevRoads)) {
      if (!(id in roads)) changedRoadIds.add(id)
    }
  }

  // ── Lanes ────────────────────────────────────────────────────────────

  if (_prevLanes && lanes !== _prevLanes) {
    const prevKeys = Object.keys(_prevLanes)
    const currKeys = Object.keys(lanes)

    // Removed lanes
    for (const id of prevKeys) {
      if (!(id in lanes)) {
        const entry = _entryById.get(id)
        if (entry) {
          _tree.remove(entry)
          _entryById.delete(id)
        }
        _prevLaneMap.delete(id)
        changeCount++
      }
    }

    // Added or changed lanes
    for (const id of currKeys) {
      const curr = lanes[id]
      const prev = _prevLanes[id]
      const roadChanged = curr.roadId ? changedRoadIds.has(curr.roadId) : false
      if (curr !== prev || roadChanged) {
        const oldEntry = _entryById.get(id)
        if (oldEntry) _tree.remove(oldEntry)
        try {
          const newEntry = makeLaneEntry(curr)
          _tree.insert(newEntry)
          _entryById.set(id, newEntry)
        } catch {
          // skip malformed
        }
        _prevLaneMap.set(id, curr)
        changeCount++
      }
    }
  }

  // ── Generic element updater ──────────────────────────────────────────

  function syncElements<T extends { id: string }>(
    prev: Record<string, T> | null,
    curr: Record<string, T>,
    elementType: SpatialEntry['elementType'],
    getCoords: (el: T) => number[][]
  ): void {
    if (!prev || curr === prev) return

    for (const id of Object.keys(prev)) {
      if (!(id in curr)) {
        const entry = _entryById.get(id)
        if (entry) {
          _tree.remove(entry)
          _entryById.delete(id)
        }
        changeCount++
      }
    }

    for (const id of Object.keys(curr)) {
      if (curr[id] !== prev[id]) {
        const oldEntry = _entryById.get(id)
        if (oldEntry) _tree.remove(oldEntry)
        try {
          const coords = getCoords(curr[id])
          const bbox = buildBBox(coords)
          const newEntry: SpatialEntry = { ...bbox, id, elementType }
          _tree.insert(newEntry)
          _entryById.set(id, newEntry)
        } catch {
          // skip malformed
        }
        changeCount++
      }
    }
  }

  syncElements(
    _prevJunctions,
    junctions,
    'junction',
    (j) => j.polygon.geometry.coordinates[0] as number[][]
  )
  syncElements(
    _prevCrosswalks,
    crosswalks,
    'crosswalk',
    (cw) => cw.polygon.geometry.coordinates[0] as number[][]
  )
  syncElements(
    _prevSignals,
    signals,
    'signal',
    (s) => s.stopLine.geometry.coordinates as number[][]
  )
  syncElements(
    _prevStopSigns,
    stopSigns,
    'stop_sign',
    (ss) => ss.stopLine.geometry.coordinates as number[][]
  )
  syncElements(
    _prevClearAreas,
    clearAreas,
    'clear_area',
    (ca) => ca.polygon.geometry.coordinates[0] as number[][]
  )
  syncElements(
    _prevSpeedBumps,
    speedBumps,
    'speed_bump',
    (sb) => sb.line.geometry.coordinates as number[][]
  )
  syncElements(
    _prevParkingSpaces,
    parkingSpaces,
    'parking_space',
    (ps) => ps.polygon.geometry.coordinates[0] as number[][]
  )

  // Large change detection: if > 500 changes or > 30% of total, do full rebuild
  const totalElements = _entryById.size
  if (changeCount > 500 || (totalElements > 0 && changeCount / totalElements > 0.3)) {
    // Full index rebuild
    _tree.clear()
    _entryById.clear()
    const entries: SpatialEntry[] = []

    for (const lane of Object.values(lanes)) {
      try {
        const entry = makeLaneEntry(lane)
        entries.push(entry)
        _entryById.set(entry.id, entry)
      } catch {
        /* skip */
      }
    }
    for (const j of Object.values(junctions)) {
      const entry = makePolygonEntry(
        j.id,
        j.polygon.geometry.coordinates[0] as number[][],
        'junction'
      )
      entries.push(entry)
      _entryById.set(entry.id, entry)
    }
    for (const cw of Object.values(crosswalks)) {
      const entry = makePolygonEntry(
        cw.id,
        cw.polygon.geometry.coordinates[0] as number[][],
        'crosswalk'
      )
      entries.push(entry)
      _entryById.set(entry.id, entry)
    }
    for (const sig of Object.values(signals)) {
      const entry = makeLineEntry(sig.id, sig.stopLine.geometry.coordinates as number[][], 'signal')
      entries.push(entry)
      _entryById.set(entry.id, entry)
    }
    for (const ss of Object.values(stopSigns)) {
      const entry = makeLineEntry(
        ss.id,
        ss.stopLine.geometry.coordinates as number[][],
        'stop_sign'
      )
      entries.push(entry)
      _entryById.set(entry.id, entry)
    }
    for (const ca of Object.values(clearAreas)) {
      const entry = makePolygonEntry(
        ca.id,
        ca.polygon.geometry.coordinates[0] as number[][],
        'clear_area'
      )
      entries.push(entry)
      _entryById.set(entry.id, entry)
    }
    for (const sb of Object.values(speedBumps)) {
      const entry = makeLineEntry(sb.id, sb.line.geometry.coordinates as number[][], 'speed_bump')
      entries.push(entry)
      _entryById.set(entry.id, entry)
    }
    for (const ps of Object.values(parkingSpaces)) {
      const entry = makePolygonEntry(
        ps.id,
        ps.polygon.geometry.coordinates[0] as number[][],
        'parking_space'
      )
      entries.push(entry)
      _entryById.set(entry.id, entry)
    }

    _tree.load(entries)
  }

  // Update Immer reference snapshots
  _prevLanes = lanes
  _prevRoads = roads
  _prevJunctions = junctions
  _prevCrosswalks = crosswalks
  _prevSignals = signals
  _prevStopSigns = stopSigns
  _prevClearAreas = clearAreas
  _prevSpeedBumps = speedBumps
  _prevParkingSpaces = parkingSpaces

  pruneCache(new Set(Object.keys(lanes)))
}
