import { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import {
  LANE_ARROW_CHAR, LANE_ARROW_TEXT_SIZE,
  LANE_ARROW_COLOR, LANE_ARROW_OPACITY,
} from '@/config/mapConstants';
import { readMapCenter, readMapZoom, useSettingsStore } from '@/store/settingsStore';

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: 'dark-blank',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#1a1a2e' },
    },
  ],
};

/** 生成条纹图案并注册到 MapLibre */
function addStripeImage(
  map: maplibregl.Map, id: string, size: number,
  stripeW: number, gap: number,
  r: number, g: number, b: number, a: number,
  diagonal: boolean,
) {
  const data = new Uint8Array(size * size * 4);
  const period = stripeW + gap;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pos = diagonal ? ((x + y) % period + period) % period : (y % period + period) % period;
      if (pos < stripeW) {
        const idx = (y * size + x) * 4;
        data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = a;
      }
    }
  }
  map.addImage(id, { width: size, height: size, data });
}

export function useMapLibreInit(containerRef: React.RefObject<HTMLDivElement | null>) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: readMapCenter(),
      zoom: readMapZoom(),
      doubleClickZoom: false,
    });

    map.on('load', () => {
      mapLoadedRef.current = true;

      // ─── 生成条纹图案 ───
      addStripeImage(map, 'zebra-stripe', 16, 4, 4, 255, 255, 255, 255, false);     // 白色水平条纹（斑马线，细密）
      addStripeImage(map, 'red-hatch', 12, 2, 4, 255, 68, 102, 200, true);         // 红色斜线（禁停区，细密连续）

      // ─── 冷层 ───
      map.addSource('cold', { type: 'geojson', data: EMPTY_FC });

      // 冷层 z0：多边形实色填充
      map.addLayer({
        id: 'cold-fill',
        type: 'fill',
        source: 'cold',
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.15],
        },
      });

      // 冷层 z1：人行横道条纹叠加
      map.addLayer({
        id: 'cold-fill-crosswalk',
        type: 'fill',
        source: 'cold',
        filter: ['all', ['==', '$type', 'Polygon'], ['==', 'entityType', 'crosswalk']],
        paint: { 'fill-pattern': 'zebra-stripe', 'fill-opacity': 0.8 },
      });

      // 冷层 z2：禁停区红色斜线叠加
      map.addLayer({
        id: 'cold-fill-cleararea',
        type: 'fill',
        source: 'cold',
        filter: ['all', ['==', '$type', 'Polygon'], ['==', 'entityType', 'clearArea']],
        paint: { 'fill-pattern': 'red-hatch', 'fill-opacity': 0.7 },
      });

      // 冷层 z3：实线（排除 dashed 特征）
      map.addLayer({
        id: 'cold-line',
        type: 'line',
        source: 'cold',
        filter: ['all',
          ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
          ['!has', 'dashed'],
          ['!has', 'noStroke'],
        ],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['coalesce', ['get', 'lineWidth'], 2],
          'line-opacity': ['coalesce', ['get', 'lineOpacity'], 1],
        },
      });

      // 冷层 z3b：虚线（减速带条纹/让行线/道闸等）
      map.addLayer({
        id: 'cold-line-dashed',
        type: 'line',
        source: 'cold',
        filter: ['all',
          ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
          ['has', 'dashed'],
        ],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['coalesce', ['get', 'lineWidth'], 2],
          'line-opacity': ['coalesce', ['get', 'lineOpacity'], 1],
          'line-dasharray': [3, 3],
        },
      });

      // 冷层 z4：标注符号
      map.addLayer({
        id: 'cold-labels',
        type: 'symbol',
        source: 'cold',
        filter: ['==', 'role', 'label'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': ['coalesce', ['get', 'labelSize'], 14],
          'text-font': ['Open Sans Regular'],
          'text-anchor': 'center',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-padding': 2,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 2,
          'text-opacity': 0.95,
        },
      });

      // 冷层 z5：车道方向箭头（沿中心线布置）
      map.addLayer({
        id: 'cold-lane-arrows',
        type: 'symbol',
        source: 'cold',
        filter: ['all', ['==', '$type', 'LineString'], ['==', 'role', 'laneCenter']],
        layout: {
          'symbol-placement': 'line',
          'text-field': LANE_ARROW_CHAR,
          'text-size': LANE_ARROW_TEXT_SIZE,
          'text-font': ['Open Sans Regular'],
          'text-rotation-alignment': 'map',
          'text-pitch-alignment': 'viewport',
          'symbol-spacing': useSettingsStore.getState().laneArrowSpacing,
          'text-keep-upright': false,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': LANE_ARROW_COLOR,
          'text-opacity': LANE_ARROW_OPACITY,
          'text-halo-color': 'rgba(0,0,0,0.4)',
          'text-halo-width': 1,
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

  // 实时响应箭头间距设置变更
  const laneArrowSpacing = useSettingsStore((s) => s.laneArrowSpacing);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    map.setLayoutProperty('cold-lane-arrows', 'symbol-spacing', laneArrowSpacing);
  }, [laneArrowSpacing]);

  return { mapRef, mapLoadedRef };
}
