import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Feature } from 'geojson'
import { useMapStore } from '../../store/mapStore'
import { useUIStore, toolStateToDrawMode } from '../../store/uiStore'

import {
  initSelectionManager,
  applySelectionState,
  clearSelectionState,
} from '../../map/selectionStateManager'
import {
  syncViewport,
  syncViewportAsync,
  onStoreChange,
  initFromImport,
  resetCuller,
  isInitialized,
} from '../../map/viewportCuller'

import MapContextMenu from './MapContextMenu'
import type { ContextMenuState } from './MapContextMenu'
import { customDrawModes } from '../../draw'
import { createElementFromDraw } from '../../draw/elementFactory'

const BLANK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#1a1a1a' },
    },
  ],
}

export default function MapEditor() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const drawRef = useRef<MapboxDraw | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const setContextMenuRef = useRef(setContextMenu)
  useEffect(() => {
    setContextMenuRef.current = setContextMenu
  })

  const project = useMapStore((s) => s.project)
  const toolState = useUIStore((s) => s.toolState)
  const fitBoundsCounter = useUIStore((s) => s.fitBoundsCounter)
  const flyToCounter = useUIStore((s) => s.flyToCounter)

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  // Initialize MapLibre + Draw once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const center: [number, number] = [0, 0]

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: BLANK_STYLE,
      center,
      zoom: 17,
      bearing: 0,
      pitch: 0,
      attributionControl: false,
    })

    let ready = false

    map.on('load', () => {
      addGridLayer(map)
      addMapElementLayers(map)
      initSelectionManager(map)
      updateGridFromViewport(map)
      ready = true
      // If data already in store (e.g. HMR), initialize culler
      const { lanes } = useMapStore.getState()
      if (Object.keys(lanes).length > 0 && !isInitialized()) {
        initFromImport(map)
      }
    })

    map.on('moveend', () => {
      updateGridFromViewport(map)
      if (ready) syncViewport(map)
    })

    // ── Store subscriptions ──────────────────────────────────────────────
    let dataPending = false
    let asyncRenderInProgress = false
    let reRenderAfterAsync = false

    const renderData = () => {
      if (!ready) return
      if (asyncRenderInProgress) {
        reRenderAfterAsync = true
        return
      }
      if (dataPending) return
      dataPending = true
      requestAnimationFrame(function tryRender() {
        if (!map.isStyleLoaded()) {
          requestAnimationFrame(tryRender)
          return
        }
        dataPending = false

        const { lanes: currentLanes } = useMapStore.getState()
        const needsInit = !isInitialized() && Object.keys(currentLanes).length > 0

        if (needsInit) {
          asyncRenderInProgress = true
          initFromImport(map).then(() => {
            asyncRenderInProgress = false
            if (reRenderAfterAsync) {
              reRenderAfterAsync = false
              renderData()
            }
          })
        } else if (Object.keys(currentLanes).length === 0 && isInitialized()) {
          resetCuller()
        } else {
          onStoreChange(map)
        }
      })
    }

    // Selection changes → feature-state update + ensure selected elements in sources
    let selectionPending = false
    const renderSelection = () => {
      if (!ready || selectionPending) return
      selectionPending = true
      requestAnimationFrame(function trySelection() {
        if (!map.isStyleLoaded()) {
          requestAnimationFrame(trySelection)
          return
        }
        selectionPending = false
        const { selectedIds } = useUIStore.getState()
        const { lanes, roads } = useMapStore.getState()
        applySelectionState(selectedIds, lanes, roads)
        if (isInitialized()) syncViewport(map)
      })
    }

    const unsubMap = useMapStore.subscribe((state, prevState) => {
      if (
        state.lanes !== prevState.lanes ||
        state.roads !== prevState.roads ||
        state.junctions !== prevState.junctions ||
        state.signals !== prevState.signals ||
        state.stopSigns !== prevState.stopSigns ||
        state.crosswalks !== prevState.crosswalks ||
        state.clearAreas !== prevState.clearAreas ||
        state.speedBumps !== prevState.speedBumps ||
        state.parkingSpaces !== prevState.parkingSpaces
      ) {
        renderData()
      }
    })
    const unsubUI = useUIStore.subscribe((state, prevState) => {
      if (state.selectedIds !== prevState.selectedIds) {
        renderSelection()
      }
      if (state.layerVisibility !== prevState.layerVisibility) {
        if (ready && isInitialized()) {
          const { setRenderProgress } = useUIStore.getState()
          setRenderProgress(0)
          syncViewportAsync(map, (p) => useUIStore.getState().setRenderProgress(p)).then(() => {
            useUIStore.getState().setRenderProgress(null)
          })
        }
      }
    })

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: 'simple_select',
      styles: getDrawStyles(),
      modes: {
        ...MapboxDraw.modes,
        ...(customDrawModes as Record<string, object>),
      },
    })

    ;(map as unknown as maplibregl.Map & { addControl: (ctrl: unknown) => void }).addControl(
      draw as unknown as maplibregl.IControl
    )
    drawRef.current = draw
    mapRef.current = map

    // All handlers access store via getState() to avoid stale closures
    map.on('draw.create', (e: { features: Feature[] }) => {
      const feature = e.features[0]
      if (!feature) return

      const { toolState } = useUIStore.getState()
      const { addElement } = useMapStore.getState()
      const { setSelected, setStatus } = useUIStore.getState()

      if (toolState.kind !== 'draw') return

      const element = createElementFromDraw(toolState.intent, feature)

      if (element) {
        addElement(element)
        setSelected([element.id])
        setStatus(`${element.type} ${element.id} created`)
        draw.delete([feature.id as string])
        // Stay in the current drawing mode so the user can draw again immediately.
        // Re-enter the mode in MapboxDraw (custom modes call changeMode('simple_select')
        // internally, so we need to re-activate the draw mode here).
        const currentDrawMode = toolStateToDrawMode(toolState)
        try {
          draw.changeMode(currentDrawMode)
        } catch {
          // ignore if mode is not ready
        }
        // Sync sources after draw creates a new element
        if (isInitialized()) onStoreChange(map)
      }
    })

    map.on('click', (e: maplibregl.MapMouseEvent) => {
      const {
        toolState: ts,
        connectFromId,
        setSelected,
        setConnectFromId,
        setStatus,
      } = useUIStore.getState()
      const { connectLanes } = useMapStore.getState()

      // Don't interfere while actively drawing
      if (ts.kind !== 'select' && ts.kind !== 'connect_lanes') return

      const features = map.queryRenderedFeatures(e.point, {
        layers: [
          'lane-fill',
          'lane-centerlines',
          'lane-boundaries-dotted',
          'lane-boundaries-solid',
          'junction-fills',
          'crosswalk-fills',
          'signal-lines',
          'stop-sign-lines',
          'clear-area-fills',
          'speed-bump-lines',
          'parking-fills',
        ],
      })

      if (features.length > 0) {
        const id = features[0].properties?.id as string | undefined
        if (!id) return

        if (ts.kind === 'connect_lanes') {
          if (!connectFromId) {
            setConnectFromId(id)
            setStatus(`Source: ${id}. Now click the target lane.`)
          } else {
            if (connectFromId === id) {
              setStatus('Cannot connect a lane to itself')
              setConnectFromId(null)
              return
            }
            connectLanes(connectFromId, id)
            // Check if endpoints were snapped
            const storeState = useMapStore.getState()
            const fromLane = storeState.lanes[connectFromId]
            const toLane = storeState.lanes[id]
            const fromEnd = fromLane?.centerLine.geometry.coordinates.at(-1)
            const toStart = toLane?.centerLine.geometry.coordinates[0]
            const snapped =
              fromEnd && toStart && fromEnd[0] === toStart[0] && fromEnd[1] === toStart[1]
            setStatus(`Connected ${connectFromId} → ${id}${snapped ? ' (endpoints snapped)' : ''}`)
            setConnectFromId(null)
          }
        } else {
          setSelected([id])
        }
      } else {
        setSelected([])
      }
    })

    // Right-click context menu
    map.on('contextmenu', (e: maplibregl.MapMouseEvent) => {
      e.preventDefault()
      const features = map.queryRenderedFeatures(e.point, {
        layers: [
          'lane-fill',
          'lane-centerlines',
          'junction-fills',
          'crosswalk-fills',
          'signal-lines',
          'stop-sign-lines',
          'clear-area-fills',
          'speed-bump-lines',
          'parking-fills',
        ],
      })

      if (features.length > 0) {
        const id = features[0].properties?.id as string | undefined
        const type = features[0].properties?.type as string | undefined
        if (id && type) {
          setContextMenuRef.current({
            x: e.originalEvent.clientX,
            y: e.originalEvent.clientY,
            elementId: id,
            elementType: type,
          })
        }
      }
    })

    map.on('dblclick', (e: maplibregl.MapMouseEvent) => {
      const { toolState: ts } = useUIStore.getState()
      // Only enter edit mode from select mode
      if (ts.kind !== 'select') return

      const features = map.queryRenderedFeatures(e.point, {
        layers: ['lane-fill', 'lane-centerlines'],
      })

      if (features.length > 0) {
        const id = features[0].properties?.id as string | undefined
        if (!id) return

        const lane = useMapStore.getState().lanes[id]
        if (lane?.bezierAnchors) {
          e.preventDefault()
          useUIStore.getState().setToolState({
            kind: 'edit_bezier',
            laneId: id,
          })
        }
      }
    })

    return () => {
      unsubMap()
      unsubUI()
      clearSelectionState()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Jump to origin when project is set
  useEffect(() => {
    if (mapRef.current && project) {
      mapRef.current.jumpTo({
        center: [project.originLon, project.originLat],
        zoom: 17,
      })
    }
  }, [project])

  // Fit map to all features when requested (e.g. after import)
  useEffect(() => {
    if (!fitBoundsCounter || !mapRef.current) return
    const { lanes, junctions, crosswalks, clearAreas, parkingSpaces } = useMapStore.getState()

    const allCoords: [number, number][] = []

    for (const lane of Object.values(lanes)) {
      for (const coord of lane.centerLine.geometry.coordinates) {
        allCoords.push(coord as [number, number])
      }
    }
    for (const j of Object.values(junctions)) {
      for (const ring of j.polygon.geometry.coordinates) {
        for (const coord of ring) allCoords.push(coord as [number, number])
      }
    }
    for (const cw of Object.values(crosswalks)) {
      for (const ring of cw.polygon.geometry.coordinates) {
        for (const coord of ring) allCoords.push(coord as [number, number])
      }
    }
    for (const ca of Object.values(clearAreas)) {
      for (const ring of ca.polygon.geometry.coordinates) {
        for (const coord of ring) allCoords.push(coord as [number, number])
      }
    }
    for (const ps of Object.values(parkingSpaces)) {
      for (const ring of ps.polygon.geometry.coordinates) {
        for (const coord of ring) allCoords.push(coord as [number, number])
      }
    }

    if (allCoords.length === 0) return

    let minLng = Infinity,
      maxLng = -Infinity,
      minLat = Infinity,
      maxLat = -Infinity
    for (const [lng, lat] of allCoords) {
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }

    mapRef.current.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 60, maxZoom: 19, animate: false }
    )
  }, [fitBoundsCounter])

  // Jump to a specific element when requested (e.g. from element list)
  useEffect(() => {
    if (!flyToCounter || !mapRef.current) return
    const target = useUIStore.getState().flyToTarget
    if (!target) return
    mapRef.current.jumpTo({
      center: [target.lng, target.lat],
      zoom: Math.max(mapRef.current.getZoom(), 18),
    })
  }, [flyToCounter])

  // Sync draw mode to mapbox-gl-draw
  useEffect(() => {
    const draw = drawRef.current
    if (!draw) return
    const mbMode = toolStateToDrawMode(toolState)
    try {
      draw.deleteAll()
      if (toolState.kind === 'edit_bezier') {
        draw.changeMode(mbMode, { laneId: toolState.laneId })
      } else {
        draw.changeMode(mbMode)
      }
    } catch (err) {
      console.error('[draw] changeMode failed:', mbMode, err)
    }
  }, [toolState])

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />
      <MapContextMenu menu={contextMenu} onClose={closeContextMenu} />
    </div>
  )
}

// ============================================================
// Map Layer Management (module-level, no closure issues)
// ============================================================

/** Round a value down to a "nice" number (1, 2, 5 × 10^n) for grid spacing. */
function niceStep(value: number): number {
  const exp = Math.floor(Math.log10(value))
  const base = 10 ** exp
  const norm = value / base
  if (norm <= 1) return base
  if (norm <= 2) return 2 * base
  if (norm <= 5) return 5 * base
  return 10 * base
}

/** Build a grid GeoJSON that covers the given map viewport. */
function buildViewportGrid(map: MapLibreMap): GeoJSON.FeatureCollection {
  const bounds = map.getBounds()
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()

  // Pad by 50% so panning doesn't immediately show blank areas
  const lngSpan = ne.lng - sw.lng
  const latSpan = ne.lat - sw.lat
  const padLng = lngSpan * 0.5
  const padLat = latSpan * 0.5

  const minLng = sw.lng - padLng
  const maxLng = ne.lng + padLng
  const minLat = sw.lat - padLat
  const maxLat = ne.lat + padLat

  // Pick a step that yields ~80-120 lines per axis
  const step = niceStep(Math.max(lngSpan, latSpan) / 100)

  // Snap start coordinates to step multiples for stable grid positions
  const startLng = Math.floor(minLng / step) * step
  const startLat = Math.floor(minLat / step) * step

  const gridLines: [number, number][][] = []
  for (let lng = startLng; lng <= maxLng; lng += step) {
    gridLines.push([
      [lng, minLat],
      [lng, maxLat],
    ])
  }
  for (let lat = startLat; lat <= maxLat; lat += step) {
    gridLines.push([
      [minLng, lat],
      [maxLng, lat],
    ])
  }

  return {
    type: 'FeatureCollection',
    features: gridLines.map((coords) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: coords },
      properties: {},
    })),
  }
}

function addGridLayer(map: MapLibreMap) {
  map.addSource('grid', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addLayer({
    id: 'grid-lines',
    type: 'line',
    source: 'grid',
    paint: { 'line-color': '#2a2d2e', 'line-width': 0.5, 'line-opacity': 0.5 },
  })
}

function updateGridFromViewport(map: MapLibreMap) {
  const source = map.getSource('grid')
  if (source && 'setData' in source) {
    ;(source as maplibregl.GeoJSONSource).setData(buildViewportGrid(map))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas-based pattern + icon images
// ─────────────────────────────────────────────────────────────────────────────

/** Render a canvas and return a MapLibre-compatible RGBA image object. */
function makeImg(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void
): { width: number; height: number; data: Uint8ClampedArray } {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  draw(ctx)
  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data }
}

/**
 * Register fill-pattern and line-pattern images with the map.
 * Must be called after map 'load' fires.
 */
function addPatternImages(map: MapLibreMap) {
  // ── Crosswalk: horizontal zebra stripes (white / transparent) ────────────
  // 16 × 16 tile: top 8 rows white, bottom 8 rows transparent → stripes when tiled
  map.addImage(
    'pattern-crosswalk',
    makeImg(16, 16, (ctx) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)'
      ctx.fillRect(0, 0, 16, 8)
    })
  )

  // ── Clear area: yellow diagonal cross-hatch ───────────────────────────────
  // 20 × 20 tile with two sets of diagonal lines (/ and \)
  map.addImage(
    'pattern-clear-area',
    makeImg(20, 20, (ctx) => {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'square'
      for (let i = -20; i < 40; i += 10) {
        ctx.beginPath()
        ctx.moveTo(i, 20)
        ctx.lineTo(i + 20, 0)
        ctx.stroke() // /
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i + 20, 20)
        ctx.stroke() // \
      }
    })
  )

  // ── Speed bump: alternating orange | dark vertical bars ──────────────────
  // 16 × 16 tile: left half orange, right half near-black → speed bump markings
  map.addImage(
    'pattern-speed-bump',
    makeImg(16, 16, (ctx) => {
      ctx.fillStyle = 'rgb(251, 146, 60)'
      ctx.fillRect(0, 0, 8, 16)
      ctx.fillStyle = 'rgb(28, 25, 23)'
      ctx.fillRect(8, 0, 8, 16)
    })
  )

  // ── Parking: fine blue grid lines ─────────────────────────────────────────
  // 20 × 20 tile with centered cross
  map.addImage(
    'pattern-parking',
    makeImg(20, 20, (ctx) => {
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(10, 0)
      ctx.lineTo(10, 20)
      ctx.moveTo(0, 10)
      ctx.lineTo(20, 10)
      ctx.stroke()
    })
  )
}

/**
 * Register icon images for centroid / line-center labels.
 * Each icon is a filled circle with a distinctive symbol inside.
 */
function addIconImages(map: MapLibreMap) {
  const S = 36 // icon size in px

  /** Circle background + caller-drawn symbol */
  const circleIcon = (bg: string, draw: (ctx: CanvasRenderingContext2D) => void) =>
    makeImg(S, S, (ctx) => {
      ctx.fillStyle = bg
      ctx.beginPath()
      ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.30)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      draw(ctx)
    })

  // Crosswalk: stick-figure pedestrian inside a purple circle
  map.addImage(
    'icon-crosswalk',
    circleIcon('rgba(216,180,254,0.95)', (ctx) => {
      const cx = S / 2
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      // head
      ctx.beginPath()
      ctx.arc(cx, 9, 3.5, 0, Math.PI * 2)
      ctx.fill()
      // body
      ctx.beginPath()
      ctx.moveTo(cx, 13)
      ctx.lineTo(cx, 22)
      ctx.stroke()
      // arms
      ctx.beginPath()
      ctx.moveTo(cx - 5, 16)
      ctx.lineTo(cx + 5, 16)
      ctx.stroke()
      // legs
      ctx.beginPath()
      ctx.moveTo(cx, 22)
      ctx.lineTo(cx - 4, 28)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx, 22)
      ctx.lineTo(cx + 4, 28)
      ctx.stroke()
    })
  )

  // Clear area: white × inside an amber circle
  map.addImage(
    'icon-clear-area',
    circleIcon('rgba(234,179,8,0.95)', (ctx) => {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 3.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(10, 10)
      ctx.lineTo(S - 10, S - 10)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(S - 10, 10)
      ctx.lineTo(10, S - 10)
      ctx.stroke()
    })
  )

  // Speed bump: double chevron (⌄⌄) inside an orange circle
  map.addImage(
    'icon-speed-bump',
    circleIcon('rgba(251,146,60,0.95)', (ctx) => {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(8, 13)
      ctx.lineTo(S / 2, 20)
      ctx.lineTo(S - 8, 13)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(8, 21)
      ctx.lineTo(S / 2, 28)
      ctx.lineTo(S - 8, 21)
      ctx.stroke()
    })
  )

  // Parking: bold "P" inside a blue circle
  map.addImage(
    'icon-parking',
    circleIcon('rgba(59,130,246,0.95)', (ctx) => {
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.round(S * 0.58)}px Arial, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('P', S / 2 + 1, S / 2 + 1)
    })
  )
}

function addMapElementLayers(map: MapLibreMap) {
  // Register all canvas-generated patterns + icons before any layers use them
  addPatternImages(map)
  addIconImages(map)

  const addGeoJSONSource = (id: string, opts?: Partial<maplibregl.GeoJSONSourceSpecification>) =>
    map.addSource(id, { type: 'geojson', data: emptyFC(), ...opts })

  // ── Lane fills (polygon per lane, colored by type) ──────────────────
  // Selection highlighting uses feature-state instead of data properties
  addGeoJSONSource('lane-fills', { promoteId: 'id' })
  map.addLayer({
    id: 'lane-fill',
    type: 'fill',
    source: 'lane-fills',
    paint: {
      'fill-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#fbbf24',
        ['coalesce', ['get', 'fillColor'], '#1d4ed8'],
      ],
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        0.45,
        ['case', ['boolean', ['get', 'hasRoad'], false], 0.25, 0.12],
      ],
    },
  })

  // ── Lane centerlines (dashed, selected = highlight) ──────────────────
  addGeoJSONSource('lane-centers', { promoteId: 'id' })
  map.addLayer({
    id: 'lane-centerlines',
    type: 'line',
    source: 'lane-centers',
    paint: {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#fbbf24',
        '#475569',
      ],
      'line-width': 1,
      'line-dasharray': [5, 5],
    },
  })

  // ── Boundaries: dotted (type 1 DOTTED_YELLOW, 2 DOTTED_WHITE) ────────
  addGeoJSONSource('lane-boundaries', { promoteId: 'id' })
  map.addLayer({
    id: 'lane-boundaries-dotted',
    type: 'line',
    source: 'lane-boundaries',
    filter: ['in', ['get', 'boundaryType'], ['literal', [1, 2]]],
    paint: {
      'line-color': ['coalesce', ['get', 'boundaryColor'], '#cbd5e1'],
      'line-width': 1.5,
      'line-dasharray': [6, 4],
    },
  })

  // ── Boundaries: solid (type 3 SOLID_YELLOW, 4 SOLID_WHITE, 5 DOUBLE, 6 CURB) ─
  map.addLayer({
    id: 'lane-boundaries-solid',
    type: 'line',
    source: 'lane-boundaries',
    filter: ['in', ['get', 'boundaryType'], ['literal', [3, 4, 5, 6]]],
    paint: {
      'line-color': ['coalesce', ['get', 'boundaryColor'], '#cbd5e1'],
      'line-width': ['match', ['get', 'boundaryType'], 6, 3, 5, 2, 2],
    },
  })

  // ── Direction + turn arrows (symbol at lane midpoint) ────────────────
  addGeoJSONSource('lane-arrows', { promoteId: 'id' })
  map.addLayer({
    id: 'lane-arrows',
    type: 'symbol',
    source: 'lane-arrows',
    layout: {
      'text-field': '▲',
      'text-size': 14,
      'text-rotate': ['get', 'bearing'],
      'text-rotation-alignment': 'map',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': ['coalesce', ['get', 'arrowColor'], '#e2e8f0'],
      'text-halo-color': '#1e1e1e',
      'text-halo-width': 1,
    },
  })

  // Connection arrows
  addGeoJSONSource('lane-connections', { promoteId: 'id' })
  map.addLayer({
    id: 'lane-connections',
    type: 'line',
    source: 'lane-connections',
    paint: { 'line-color': '#3b82f6', 'line-width': 1, 'line-dasharray': [3, 3] },
  })

  // Junctions
  addGeoJSONSource('junctions', { promoteId: 'id' })
  map.addLayer({
    id: 'junction-fills',
    type: 'fill',
    source: 'junctions',
    paint: {
      'fill-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#fbbf24',
        '#818cf8',
      ],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.45, 0.2],
    },
  })
  map.addLayer({
    id: 'junction-outlines',
    type: 'line',
    source: 'junctions',
    paint: {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#fbbf24',
        '#818cf8',
      ],
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.5],
    },
  })

  // ── Crosswalks ────────────────────────────────────────────────────────────
  addGeoJSONSource('crosswalks', { promoteId: 'id' })
  addGeoJSONSource('crosswalk-centers', { promoteId: 'id' })
  map.addLayer({
    id: 'crosswalk-fills',
    type: 'fill',
    source: 'crosswalks',
    paint: {
      'fill-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#fbbf24',
        '#f0abfc',
      ],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.45, 0.25],
    },
  })
  map.addLayer({
    id: 'crosswalk-pattern',
    type: 'fill',
    source: 'crosswalks',
    paint: { 'fill-pattern': 'pattern-crosswalk', 'fill-opacity': 0.9 },
  })
  map.addLayer({
    id: 'crosswalk-outlines',
    type: 'line',
    source: 'crosswalks',
    paint: {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#fbbf24',
        '#e9d5ff',
      ],
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 2],
    },
  })

  // ── Signals ───────────────────────────────────────────────────────────────
  addGeoJSONSource('signals', { promoteId: 'id' })
  map.addLayer({
    id: 'signal-lines',
    type: 'line',
    source: 'signals',
    paint: {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#fbbf24',
        '#4ade80',
      ],
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 5, 3],
    },
  })

  // ── Stop signs ────────────────────────────────────────────────────────────
  addGeoJSONSource('stop-signs', { promoteId: 'id' })
  map.addLayer({
    id: 'stop-sign-lines',
    type: 'line',
    source: 'stop-signs',
    paint: {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#fbbf24',
        '#f87171',
      ],
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 5, 3],
    },
  })

  // ── Clear areas ───────────────────────────────────────────────────────────
  addGeoJSONSource('clear-areas', { promoteId: 'id' })
  addGeoJSONSource('clear-area-centers', { promoteId: 'id' })
  map.addLayer({
    id: 'clear-area-fills',
    type: 'fill',
    source: 'clear-areas',
    paint: {
      'fill-color': '#fbbf24',
      'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.3, 0.08],
    },
  })
  map.addLayer({
    id: 'clear-area-pattern',
    type: 'fill',
    source: 'clear-areas',
    paint: { 'fill-pattern': 'pattern-clear-area', 'fill-opacity': 0.85 },
  })
  map.addLayer({
    id: 'clear-area-outlines',
    type: 'line',
    source: 'clear-areas',
    paint: {
      'line-color': '#fbbf24',
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3.5, 2],
      'line-dasharray': [5, 3],
    },
  })

  // ── Speed bumps ───────────────────────────────────────────────────────────
  addGeoJSONSource('speed-bumps', { promoteId: 'id' })
  map.addLayer({
    id: 'speed-bump-casing',
    type: 'line',
    source: 'speed-bumps',
    layout: { 'line-cap': 'butt', 'line-join': 'miter' },
    paint: {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#fbbf24',
        '#1c1917',
      ],
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 18, 14],
    },
  })
  map.addLayer({
    id: 'speed-bump-lines',
    type: 'line',
    source: 'speed-bumps',
    layout: { 'line-cap': 'butt', 'line-join': 'miter' },
    paint: { 'line-pattern': 'pattern-speed-bump', 'line-width': 10 },
  })

  // ── Parking spaces ────────────────────────────────────────────────────────
  addGeoJSONSource('parking-spaces', { promoteId: 'id' })
  addGeoJSONSource('parking-centers', { promoteId: 'id' })
  map.addLayer({
    id: 'parking-fills',
    type: 'fill',
    source: 'parking-spaces',
    paint: {
      'fill-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#fbbf24',
        '#7dd3fc',
      ],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.4, 0.15],
    },
  })
  map.addLayer({
    id: 'parking-pattern',
    type: 'fill',
    source: 'parking-spaces',
    paint: { 'fill-pattern': 'pattern-parking', 'fill-opacity': 0.7 },
  })
  map.addLayer({
    id: 'parking-outlines',
    type: 'line',
    source: 'parking-spaces',
    paint: {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#fbbf24',
        '#38bdf8',
      ],
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 2],
    },
  })

  // ── Centroid icons (rendered last so they sit on top of all fills) ────────
  map.addLayer({
    id: 'crosswalk-icons',
    type: 'symbol',
    source: 'crosswalk-centers',
    layout: {
      'icon-image': 'icon-crosswalk',
      'icon-size': 0.75,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
  map.addLayer({
    id: 'clear-area-icons',
    type: 'symbol',
    source: 'clear-area-centers',
    layout: {
      'icon-image': 'icon-clear-area',
      'icon-size': 0.75,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
  map.addLayer({
    id: 'speed-bump-icons',
    type: 'symbol',
    source: 'speed-bumps',
    layout: {
      'symbol-placement': 'line-center',
      'icon-image': 'icon-speed-bump',
      'icon-size': 0.72,
      'icon-rotation-alignment': 'viewport',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
  map.addLayer({
    id: 'parking-icons',
    type: 'symbol',
    source: 'parking-centers',
    layout: {
      'icon-image': 'icon-parking',
      'icon-size': 0.9,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

function getDrawStyles() {
  return [
    {
      id: 'gl-draw-line',
      type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#3b82f6', 'line-dasharray': [0.2, 2], 'line-width': 2 },
    },
    {
      id: 'gl-draw-polygon-fill',
      type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint: { 'fill-color': '#3b82f6', 'fill-outline-color': '#3b82f6', 'fill-opacity': 0.1 },
    },
    {
      id: 'gl-draw-polygon-stroke-active',
      type: 'line',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#3b82f6', 'line-dasharray': [0.2, 2], 'line-width': 2 },
    },
    {
      id: 'gl-draw-point-active',
      type: 'circle',
      filter: ['all', ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
      paint: { 'circle-radius': 4, 'circle-color': '#3b82f6' },
    },
  ]
}
