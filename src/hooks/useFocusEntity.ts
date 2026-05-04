import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { boundsCenter, boundsForEntity, isTinyBounds } from '@/core/geometry/entityBounds';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';

const FOCUS_PADDING = 120;
const FOCUS_DURATION_MS = 550;
const MIN_FOCUS_ZOOM = 18;
const TINY_FOCUS_ZOOM = 20;

export function useFocusEntity(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
) {
  const request = useUIStore((s) => s.focusEntityRequest);
  const clearFocusEntityRequest = useUIStore((s) => s.clearFocusEntityRequest);
  const entities = useMapStore((s) => s.entities);

  useEffect(() => {
    if (!request) return;
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const entity = entities.get(request.entityId);
    const bounds = entity ? boundsForEntity(entity) : null;
    if (!bounds) {
      clearFocusEntityRequest(request.requestId);
      return;
    }

    if (isTinyBounds(bounds)) {
      map.easeTo({
        center: boundsCenter(bounds),
        zoom: Math.max(map.getZoom(), TINY_FOCUS_ZOOM),
        duration: FOCUS_DURATION_MS,
      });
    } else {
      map.fitBounds(
        new maplibregl.LngLatBounds([bounds.minX, bounds.minY], [bounds.maxX, bounds.maxY]),
        {
          padding: FOCUS_PADDING,
          duration: FOCUS_DURATION_MS,
          maxZoom: Math.max(map.getZoom(), MIN_FOCUS_ZOOM),
        },
      );
    }

    clearFocusEntityRequest(request.requestId);
  }, [clearFocusEntityRequest, entities, mapLoadedRef, mapRef, request]);
}
