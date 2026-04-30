import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import { useApolloMapStore } from '@/store/apolloMapStore';
import { computeApolloMapBounds } from '@/io/proto/apolloGeoJson';

/**
 * Render the imported (read-only) Apollo HD-map onto the canvas as a set
 * of categorized layers below the editor's cold layer. Activated whenever
 * `apolloMapStore.rawMap` is non-null, regenerates GeoJSON when it changes.
 *
 * Distinct color palette (cyan family) signals "imported, not editable yet"
 * so the user can tell their own drawings apart from Apollo source data.
 */

const SOURCE = {
  laneCenter: 'apollo-lane-center',
  laneBoundary: 'apollo-lane-boundary',
  roadBoundary: 'apollo-road-boundary',
  crosswalk: 'apollo-crosswalk',
  junction: 'apollo-junction',
  signal: 'apollo-signal',
  stopSign: 'apollo-stop-sign',
  clearArea: 'apollo-clear-area',
  parkingSpace: 'apollo-parking-space',
  speedBump: 'apollo-speed-bump',
} as const;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

interface LayerSpec {
  id: string;
  source: (typeof SOURCE)[keyof typeof SOURCE];
  layer: maplibregl.LayerSpecification;
}

const LAYERS: LayerSpec[] = [
  {
    id: 'apollo-junction-fill',
    source: SOURCE.junction,
    layer: {
      id: 'apollo-junction-fill',
      type: 'fill',
      source: SOURCE.junction,
      paint: {
        'fill-color': '#0e7490',
        'fill-opacity': 0.18,
      },
    },
  },
  {
    id: 'apollo-clear-area-fill',
    source: SOURCE.clearArea,
    layer: {
      id: 'apollo-clear-area-fill',
      type: 'fill',
      source: SOURCE.clearArea,
      paint: {
        'fill-color': '#dc2626',
        'fill-opacity': 0.15,
      },
    },
  },
  {
    id: 'apollo-parking-space-fill',
    source: SOURCE.parkingSpace,
    layer: {
      id: 'apollo-parking-space-fill',
      type: 'fill',
      source: SOURCE.parkingSpace,
      paint: {
        'fill-color': '#16a34a',
        'fill-opacity': 0.18,
      },
    },
  },
  {
    id: 'apollo-crosswalk-fill',
    source: SOURCE.crosswalk,
    layer: {
      id: 'apollo-crosswalk-fill',
      type: 'fill',
      source: SOURCE.crosswalk,
      paint: {
        'fill-color': '#fbbf24',
        'fill-opacity': 0.25,
      },
    },
  },
  {
    id: 'apollo-crosswalk-outline',
    source: SOURCE.crosswalk,
    layer: {
      id: 'apollo-crosswalk-outline',
      type: 'line',
      source: SOURCE.crosswalk,
      paint: { 'line-color': '#f59e0b', 'line-width': 1 },
    },
  },
  {
    id: 'apollo-road-boundary-line',
    source: SOURCE.roadBoundary,
    layer: {
      id: 'apollo-road-boundary-line',
      type: 'line',
      source: SOURCE.roadBoundary,
      paint: { 'line-color': '#94a3b8', 'line-width': 1.5 },
    },
  },
  {
    id: 'apollo-lane-boundary-line',
    source: SOURCE.laneBoundary,
    layer: {
      id: 'apollo-lane-boundary-line',
      type: 'line',
      source: SOURCE.laneBoundary,
      paint: { 'line-color': '#cbd5e1', 'line-width': 1, 'line-opacity': 0.7 },
    },
  },
  {
    id: 'apollo-lane-center-line',
    source: SOURCE.laneCenter,
    layer: {
      id: 'apollo-lane-center-line',
      type: 'line',
      source: SOURCE.laneCenter,
      paint: { 'line-color': '#22d3ee', 'line-width': 1.5, 'line-dasharray': [2, 2] },
    },
  },
  {
    id: 'apollo-speed-bump-line',
    source: SOURCE.speedBump,
    layer: {
      id: 'apollo-speed-bump-line',
      type: 'line',
      source: SOURCE.speedBump,
      paint: { 'line-color': '#a855f7', 'line-width': 3 },
    },
  },
  {
    id: 'apollo-stop-sign-line',
    source: SOURCE.stopSign,
    layer: {
      id: 'apollo-stop-sign-line',
      type: 'line',
      source: SOURCE.stopSign,
      paint: { 'line-color': '#dc2626', 'line-width': 2 },
    },
  },
  {
    id: 'apollo-signal-circle',
    source: SOURCE.signal,
    layer: {
      id: 'apollo-signal-circle',
      type: 'circle',
      source: SOURCE.signal,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 4,
        'circle-color': '#facc15',
        'circle-stroke-color': '#a16207',
        'circle-stroke-width': 1,
      },
    },
  },
  {
    id: 'apollo-signal-line',
    source: SOURCE.signal,
    layer: {
      id: 'apollo-signal-line',
      type: 'line',
      source: SOURCE.signal,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': '#facc15', 'line-width': 2 },
    },
  },
];

export function useApolloLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
) {
  const rawMap = useApolloMapStore((s) => s.rawMap);
  const installedRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const ensureInstalled = () => {
      if (!mapLoadedRef.current) return;
      if (installedRef.current) return;

      // Sources first
      for (const sourceId of Object.values(SOURCE)) {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, { type: 'geojson', data: EMPTY_FC });
        }
      }
      // Layers (insert below the cold layer if present, so user edits sit on top)
      const existingLayers = map.getStyle().layers ?? [];
      const coldLayer = existingLayers.find((l) => l.id.startsWith('cold-'));
      const beforeId = coldLayer?.id;
      for (const spec of LAYERS) {
        if (!map.getLayer(spec.id)) {
          map.addLayer(spec.layer, beforeId);
        }
      }
      installedRef.current = true;
    };

    const apply = () => {
      ensureInstalled();
      if (!installedRef.current) return;

      // All Apollo entity types are bridged into mapStore and rendered by
      // the cold layer. These viewer-layer sources stay empty; they exist
      // only so the layer specs below remain valid.
      for (const sourceId of Object.values(SOURCE)) {
        const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        src?.setData(EMPTY_FC);
      }

      // Auto-fit viewport to imported map bounds.
      if (rawMap) {
        const bounds = computeApolloMapBounds(
          rawMap as Parameters<typeof computeApolloMapBounds>[0],
        );
        if (bounds) {
          map.fitBounds(bounds, { padding: 60, animate: true, duration: 600 });
        }
      }
    };

    apply();
    if (!mapLoadedRef.current) {
      map.once('load', apply);
      return () => {
        map.off('load', apply);
      };
    }
    return undefined;
  }, [rawMap, mapRef, mapLoadedRef]);
}

// (Bounds for auto-fit are now computed by computeApolloMapBounds in
// apolloGeoJson.ts directly from the raw map; the GeoJSON-feature walker
// that used to live here is no longer needed.)
