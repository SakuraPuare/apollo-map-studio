import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { readMapCenter, readMapZoom, useSettingsStore } from '@/store/settingsStore';
import { DARK_STYLE } from './mapLibreInit/assets';
import { addEditorLayers } from './mapLibreInit/layers';

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
      addEditorLayers(map);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
    // containerRef is a ref — initializer runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const laneArrowSpacing = useSettingsStore((s) => s.laneArrowSpacing);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    map.setLayoutProperty('cold-lane-arrows', 'symbol-spacing', laneArrowSpacing);
  }, [laneArrowSpacing]);

  return { mapRef, mapLoadedRef };
}
