import type maplibregl from 'maplibre-gl';
import { LANE_ARROW_COLOR, LANE_ARROW_OPACITY, LANE_ARROW_TEXT_SIZE } from '@/config/mapConstants';
import { COLD_LAYER_FILTERS } from '@/components/map/coldLayerConfig';
import { MAP_ICON_PX } from '@/lib/mapIcons';
import { useSettingsStore } from '@/store/settingsStore';
import { EMPTY_FC, registerRuntimeImages } from './assets';

function addGridLayer(map: maplibregl.Map) {
  map.addSource('grid', { type: 'geojson', data: EMPTY_FC });
  map.addLayer({
    id: 'grid-line',
    type: 'line',
    source: 'grid',
    layout: { visibility: 'none' },
    paint: {
      'line-color': [
        'case',
        ['==', ['get', 'major'], true],
        'rgba(255,255,255,0.18)',
        'rgba(255,255,255,0.07)',
      ],
      'line-width': ['case', ['==', ['get', 'major'], true], 1, 0.5],
    },
  });
}

function addColdLayers(map: maplibregl.Map) {
  map.addSource('cold', { type: 'geojson', data: EMPTY_FC });

  map.addLayer({
    id: 'cold-fill',
    type: 'fill',
    source: 'cold',
    filter: COLD_LAYER_FILTERS['cold-fill'],
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.15],
    },
  });

  map.addLayer({
    id: 'cold-fill-crosswalk',
    type: 'fill',
    source: 'cold',
    filter: COLD_LAYER_FILTERS['cold-fill-crosswalk'],
    paint: { 'fill-pattern': 'zebra-stripe', 'fill-opacity': 0.8 },
  });

  map.addLayer({
    id: 'cold-fill-cleararea',
    type: 'fill',
    source: 'cold',
    filter: COLD_LAYER_FILTERS['cold-fill-cleararea'],
    paint: { 'fill-pattern': 'red-hatch', 'fill-opacity': 0.7 },
  });

  map.addLayer({
    id: 'cold-line',
    type: 'line',
    source: 'cold',
    filter: COLD_LAYER_FILTERS['cold-line'],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['coalesce', ['get', 'lineWidth'], 2],
      'line-opacity': ['coalesce', ['get', 'lineOpacity'], 1],
    },
  });

  map.addLayer({
    id: 'cold-line-dotted',
    type: 'line',
    source: 'cold',
    filter: COLD_LAYER_FILTERS['cold-line-dotted'],
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['coalesce', ['get', 'lineWidth'], 2],
      'line-opacity': ['coalesce', ['get', 'lineOpacity'], 1],
      'line-dasharray': [0.01, 2.2],
    },
  });

  map.addLayer({
    id: 'cold-line-dashed',
    type: 'line',
    source: 'cold',
    filter: COLD_LAYER_FILTERS['cold-line-dashed'],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['coalesce', ['get', 'lineWidth'], 2],
      'line-opacity': ['coalesce', ['get', 'lineOpacity'], 1],
      'line-dasharray': [3, 3],
    },
  });

  map.addLayer({
    id: 'cold-labels',
    type: 'symbol',
    source: 'cold',
    filter: COLD_LAYER_FILTERS['cold-labels'],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['/', ['coalesce', ['get', 'labelSize'], 16], MAP_ICON_PX],
      'icon-anchor': 'center',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-padding': 2,
      // Signal labels carry an `iconRotate` (deg, CW from north) computed
      // from boundary plane × stop line per Dreamview's algorithm, so the
      // icon faces oncoming traffic. Other labels default to 0 (no rotate).
      'icon-rotate': ['coalesce', ['get', 'iconRotate'], 0],
      'icon-rotation-alignment': 'map',
    },
    paint: {
      'icon-opacity': 0.95,
    },
  });

  map.addLayer({
    id: 'cold-lane-arrows',
    type: 'symbol',
    source: 'cold',
    filter: COLD_LAYER_FILTERS['cold-lane-arrows'],
    layout: {
      'symbol-placement': 'line',
      'icon-image': 'lane-arrow',
      'icon-size': LANE_ARROW_TEXT_SIZE / 20,
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'viewport',
      'symbol-spacing': useSettingsStore.getState().laneArrowSpacing,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: {
      'icon-color': LANE_ARROW_COLOR,
      'icon-opacity': LANE_ARROW_OPACITY,
      'icon-halo-color': 'rgba(0,0,0,0.4)',
      'icon-halo-width': 1,
    },
  });
}

function addHotLayers(map: maplibregl.Map) {
  map.addSource('hot', { type: 'geojson', data: EMPTY_FC });
  map.addLayer({
    id: 'hot-fill',
    type: 'fill',
    source: 'hot',
    filter: ['==', '$type', 'Polygon'],
    paint: { 'fill-color': '#ff4444', 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: 'hot-line',
    type: 'line',
    source: 'hot',
    filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
    paint: {
      'line-color': ['case', ['==', ['get', 'role'], 'handleLine'], '#ffffff', '#ff4444'],
      'line-width': ['case', ['==', ['get', 'role'], 'handleLine'], 1, 2.5],
      'line-dasharray': [
        'case',
        ['==', ['get', 'role'], 'handleLine'],
        ['literal', [3, 2]],
        ['literal', [1, 0]],
      ],
    },
  });
  map.addLayer({
    id: 'hot-points',
    type: 'circle',
    source: 'hot',
    filter: ['==', '$type', 'Point'],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'role'], 'handle'], 5, 7],
      'circle-color': ['case', ['==', ['get', 'role'], 'handle'], '#ffffff', '#ff4444'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
}

function addOverlayLayers(map: maplibregl.Map) {
  map.addSource('overlay', { type: 'geojson', data: EMPTY_FC });
  map.addLayer({
    id: 'overlay-fill',
    type: 'fill',
    source: 'overlay',
    filter: ['==', '$type', 'Polygon'],
    paint: { 'fill-color': '#ffcc00', 'fill-opacity': 0.1 },
  });
  map.addLayer({
    id: 'overlay-line',
    type: 'line',
    source: 'overlay',
    filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
    paint: { 'line-color': '#ffcc00', 'line-width': 2, 'line-dasharray': [4, 3] },
  });
  map.addLayer({
    id: 'overlay-points',
    type: 'circle',
    source: 'overlay',
    filter: ['all', ['==', '$type', 'Point'], ['!=', 'role', 'handle']],
    paint: {
      'circle-radius': 5,
      'circle-color': '#ffcc00',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });
  map.addLayer({
    id: 'overlay-handles',
    type: 'circle',
    source: 'overlay',
    filter: ['all', ['==', '$type', 'Point'], ['==', 'role', 'handle']],
    paint: {
      'circle-radius': 4,
      'circle-color': '#ff66cc',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    },
  });
  map.addLayer({
    id: 'overlay-handle-lines',
    type: 'line',
    source: 'overlay',
    filter: ['==', 'role', 'handleLine'],
    paint: { 'line-color': '#ff66cc', 'line-width': 1, 'line-opacity': 0.6 },
  });
}

function addSnapLayers(map: maplibregl.Map) {
  map.addSource('snap', { type: 'geojson', data: EMPTY_FC });
  map.addLayer({
    id: 'snap-ring',
    type: 'circle',
    source: 'snap',
    filter: ['==', '$type', 'Point'],
    paint: {
      'circle-radius': 9,
      'circle-color': '#000000',
      'circle-opacity': 0,
      'circle-stroke-width': 2,
      'circle-stroke-color': [
        'match',
        ['get', 'kind'],
        'vertex',
        '#00d4ff',
        'edge',
        '#00a8cc',
        '#00d4ff',
      ],
      'circle-stroke-opacity': 0.95,
    },
  });
  map.addLayer({
    id: 'snap-dot',
    type: 'circle',
    source: 'snap',
    filter: ['==', '$type', 'Point'],
    paint: {
      'circle-radius': 2.5,
      'circle-color': ['match', ['get', 'kind'], 'vertex', '#00d4ff', 'edge', '#00a8cc', '#00d4ff'],
    },
  });
}

export function addEditorLayers(map: maplibregl.Map) {
  registerRuntimeImages(map);
  addGridLayer(map);
  addColdLayers(map);
  addHotLayers(map);
  addOverlayLayers(map);
  addSnapLayers(map);
}
