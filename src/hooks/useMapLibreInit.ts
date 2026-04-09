import { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: 'dark-blank',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#1a1a2e' },
    },
  ],
};

export function useMapLibreInit(containerRef: React.RefObject<HTMLDivElement | null>) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [116.4, 39.9],
      zoom: 15,
      doubleClickZoom: false,
    });

    map.on('load', () => {
      mapLoadedRef.current = true;

      // cold layer
      map.addSource('cold', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'cold-fill',
        type: 'fill',
        source: 'cold',
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 },
      });
      map.addLayer({
        id: 'cold-line',
        type: 'line',
        source: 'cold',
        filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
      });
      map.addLayer({
        id: 'cold-vertices',
        type: 'circle',
        source: 'cold',
        filter: ['all', ['==', '$type', 'Point'], ['==', 'role', 'vertex']],
        paint: {
          'circle-radius': 3.5,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      });

      // hot layer
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
          'line-dasharray': ['case', ['==', ['get', 'role'], 'handleLine'], ['literal', [3, 2]], ['literal', [1, 0]]],
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

      // overlay layer
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
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, []);

  return { mapRef, mapLoadedRef };
}
