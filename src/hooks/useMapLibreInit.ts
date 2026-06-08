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
    const canvas = map.getCanvas();
    canvas.dataset.testid = 'maplibre-canvas';
    canvas.dataset.mapReady = 'false';
    canvas.ariaLabel = 'MapLibre canvas';

    const onLoad = () => {
      if (mapLoadedRef.current) return;
      addEditorLayers(map);
      mapLoadedRef.current = true;
      canvas.dataset.mapReady = 'true';
    };

    map.on('load', onLoad);
    if (map.loaded()) onLoad();

    mapRef.current = map;
    return () => {
      map.off('load', onLoad);
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, [containerRef]);

  const laneArrowSpacing = useSettingsStore((s) => s.laneArrowSpacing);
  const laneArrowSize = useSettingsStore((s) => s.laneArrowSize);
  const laneArrowOpacity = useSettingsStore((s) => s.laneArrowOpacity);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    map.setLayoutProperty('cold-lane-arrows', 'symbol-spacing', laneArrowSpacing);
    map.setLayoutProperty('cold-lane-arrows', 'icon-size', laneArrowSize / 20);
    map.setPaintProperty('cold-lane-arrows', 'icon-opacity', laneArrowOpacity);
  }, [laneArrowOpacity, laneArrowSize, laneArrowSpacing]);

  return { mapRef, mapLoadedRef };
}
