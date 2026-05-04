import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { useUIStore } from '@/store/uiStore';

/**
 * 根据当前 zoom 选定网格间距（米）。颗粒度对齐 Photoshop / QGIS：
 * 地图越近间距越小，远了就稀疏，避免高密度线条撑爆 GPU。
 */
export function metersForZoom(zoom: number): { step: number; majorEvery: number } {
  if (zoom >= 20) return { step: 0.5, majorEvery: 10 }; // 0.5m / 5m major
  if (zoom >= 19) return { step: 1, majorEvery: 10 };
  if (zoom >= 18) return { step: 2, majorEvery: 5 };
  if (zoom >= 17) return { step: 5, majorEvery: 5 };
  if (zoom >= 16) return { step: 10, majorEvery: 5 };
  if (zoom >= 15) return { step: 25, majorEvery: 4 };
  if (zoom >= 14) return { step: 50, majorEvery: 4 };
  if (zoom >= 13) return { step: 100, majorEvery: 5 };
  if (zoom >= 12) return { step: 250, majorEvery: 4 };
  if (zoom >= 11) return { step: 500, majorEvery: 4 };
  return { step: 1000, majorEvery: 5 };
}

const METERS_PER_DEG_LAT = 111320;
/** 安全上限：避免极端 zoom-out + step 错配时生成几万条线。 */
export const MAX_LINES_PER_AXIS = 240;

export function buildGrid(map: maplibregl.Map): GeoJSON.FeatureCollection {
  const bounds = map.getBounds();
  const zoom = map.getZoom();
  const { step, majorEvery } = metersForZoom(zoom);

  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const midLat = (south + north) / 2;

  const stepLat = step / METERS_PER_DEG_LAT;
  const stepLng = step / (METERS_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180));

  // snap 到 step 整数倍上，保证缩放/平移时网格不会"漂移"
  const startLat = Math.floor(south / stepLat) * stepLat;
  const startLng = Math.floor(west / stepLng) * stepLng;

  const features: GeoJSON.Feature[] = [];

  // horizontal lines (沿纬度等高线)
  let latIdx = Math.floor(south / stepLat);
  let countLat = 0;
  for (let lat = startLat; lat <= north && countLat < MAX_LINES_PER_AXIS; lat += stepLat) {
    const major = latIdx % majorEvery === 0;
    features.push({
      type: 'Feature',
      properties: { major },
      geometry: {
        type: 'LineString',
        coordinates: [
          [west, lat],
          [east, lat],
        ],
      },
    });
    latIdx++;
    countLat++;
  }

  // vertical lines (沿经度)
  let lngIdx = Math.floor(west / stepLng);
  let countLng = 0;
  for (let lng = startLng; lng <= east && countLng < MAX_LINES_PER_AXIS; lng += stepLng) {
    const major = lngIdx % majorEvery === 0;
    features.push({
      type: 'Feature',
      properties: { major },
      geometry: {
        type: 'LineString',
        coordinates: [
          [lng, south],
          [lng, north],
        ],
      },
    });
    lngIdx++;
    countLng++;
  }

  return { type: 'FeatureCollection', features };
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * 把 ToolStrip 的 toggleGrid 真正落到画布：
 *  - gridEnabled=false → 仅切 visibility:none，不重算
 *  - gridEnabled=true  → 切 visibility:visible，并按 viewport bounds 实时重算
 */
export function useGridLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
) {
  const gridEnabled = useUIStore((s) => s.gridEnabled);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!mapLoadedRef.current) return;
      if (!map.getLayer('grid-line')) return;

      map.setLayoutProperty('grid-line', 'visibility', gridEnabled ? 'visible' : 'none');

      const src = map.getSource('grid') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData(gridEnabled ? buildGrid(map) : EMPTY_FC);
    };

    // 立即应用一次（覆盖首次启用 + 默认隐藏 → 显示）
    apply();

    // 兜底：map 还没 load 就被启用，等 load 完再 apply 一次
    let pendingLoad = false;
    if (!mapLoadedRef.current) {
      pendingLoad = true;
      map.once('load', apply);
    }

    if (!gridEnabled) {
      return () => {
        if (pendingLoad) map.off('load', apply);
      };
    }

    // 启用时才订阅 viewport 变化；关掉就静音，避免无谓重算
    const onMove = () => {
      const src = map.getSource('grid') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData(buildGrid(map));
    };
    map.on('moveend', onMove);
    map.on('zoomend', onMove);
    return () => {
      if (pendingLoad) map.off('load', apply);
      map.off('moveend', onMove);
      map.off('zoomend', onMove);
    };
  }, [gridEnabled, mapRef, mapLoadedRef]);
}
