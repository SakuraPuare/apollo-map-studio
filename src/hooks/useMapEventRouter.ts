import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { useUIStore } from '@/store/uiStore';
import type { SpatialWorkerBridge } from '@/core/workers/spatialBridge';
import { isDuplicateInput } from './mapEventRouter/inputDedup';
import { createMapEventHandlers, createRouterContext } from './mapEventRouter/eventHandlers';

export { isDuplicateInput };

export function installMapEventRouter(
  map: maplibregl.Map,
  actorRef: ActorRefFrom<typeof editorMachine>,
  bridgeRef: React.RefObject<SpatialWorkerBridge | null>,
  appMode: ReturnType<typeof useUIStore.getState>['appMode'],
): (() => void) | undefined {
  // scene 模式下绘图 FSM 完全让位给场景编辑（useScenarioAuthoring / useScenarioLayer），
  // 不挂任何地图/窗口监听，避免点选地图实体、Delete 误删地图要素等跨模式串扰。
  if (appMode === 'scene') return undefined;

  const ctx = createRouterContext(map, actorRef, bridgeRef);
  const handlers = createMapEventHandlers(ctx);
  useUIStore.getState().setCurrentZoom(map.getZoom());

  map.on('mousedown', handlers.onMouseDown);
  map.on('click', handlers.onClick);
  map.on('mousemove', handlers.onMouseMove);
  map.on('mouseup', handlers.onMouseUp);
  map.on('dblclick', handlers.onDblClick);
  map.on('zoomend', handlers.onZoomEnd);
  window.addEventListener('keydown', handlers.onKeyDown);

  const unsubSnap = useUIStore.subscribe((s, prev) => {
    if (prev.snapEnabled && !s.snapEnabled && s.currentSnapTarget) {
      useUIStore.getState().setSnapTarget(null);
    }
  });

  return () => {
    map.off('mousedown', handlers.onMouseDown);
    map.off('click', handlers.onClick);
    map.off('mousemove', handlers.onMouseMove);
    map.off('mouseup', handlers.onMouseUp);
    map.off('dblclick', handlers.onDblClick);
    map.off('zoomend', handlers.onZoomEnd);
    window.removeEventListener('keydown', handlers.onKeyDown);
    unsubSnap();
    ctx.cursorScheduler.dispose();
  };
}

export function useMapEventRouter(
  mapRef: React.RefObject<maplibregl.Map | null>,
  actorRef: ActorRefFrom<typeof editorMachine>,
  bridgeRef: React.RefObject<SpatialWorkerBridge | null>,
) {
  const appMode = useUIStore((s) => s.appMode);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    return installMapEventRouter(map, actorRef, bridgeRef, appMode);
  }, [actorRef, bridgeRef, mapRef, appMode]);
}
