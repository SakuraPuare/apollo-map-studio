import type maplibregl from 'maplibre-gl';
import type { LngLat } from '@/core/geometry/interpolate';
import type { SpatialWorkerBridge } from '@/core/workers/spatialBridge';
import { useSettingsStore } from '@/store/settingsStore';

export type HitFilter = (entityType: string) => boolean;

export function toLngLat(e: maplibregl.MapMouseEvent): LngLat {
  return [e.lngLat.lng, e.lngLat.lat];
}

export function hitBbox(point: maplibregl.PointLike): [maplibregl.PointLike, maplibregl.PointLike] {
  const p = point as maplibregl.Point;
  const pad = useSettingsStore.getState().hitBboxPadding;
  return [
    [p.x - pad, p.y - pad],
    [p.x + pad, p.y + pad],
  ];
}

export function pixelToRadius(map: maplibregl.Map, px: number): number {
  const zoom = map.getZoom();
  return (px * 360) / (512 * Math.pow(2, zoom));
}

export function workerHitTest(
  map: maplibregl.Map,
  bridge: SpatialWorkerBridge | null,
  e: maplibregl.MapMouseEvent,
  filter?: HitFilter,
): Promise<string | null> {
  if (!bridge) return Promise.resolve(null);
  const pt = toLngLat(e);
  return bridge
    .send({
      type: 'HIT_TEST',
      point: pt,
      radius: pixelToRadius(map, useSettingsStore.getState().hitTestRadius),
    })
    .then((result) => {
      if (result.type !== 'HIT_RESULT' || result.hits.length === 0) return null;
      const hit = filter ? result.hits.find((h) => filter(h.entityType)) : result.hits[0];
      return hit?.id ?? null;
    })
    .catch(() => null);
}
