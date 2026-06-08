import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { useMapStore } from '@/store/mapStore';
import { isEntityTypeInteractive, useUIStore, type LayerStates } from '@/store/uiStore';
import { entityToHotFeatures } from '@/lib/geoJsonHelpers';
import { applyDrag } from '@/components/map/entityMutations';
import type { DragPointType } from '@/types/editor';
import type { LngLat } from '@/core/geometry/interpolate';
import type { MapEntity } from '@/types/entities';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export type HotRenderState = {
  selectedEntityId: string | null;
  entity: MapEntity | null;
  isEditingPoint: boolean;
  dragPointIndex: number;
  dragPointType: DragPointType;
  dragCurrentPoint: LngLat | null;
  dragAltKey: boolean;
  canRenderEntity: boolean;
};

export function samePoint(a: LngLat | null, b: LngLat | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1];
}

export function sameHotRenderState(a: HotRenderState | null, b: HotRenderState) {
  return (
    !!a &&
    a.selectedEntityId === b.selectedEntityId &&
    a.entity === b.entity &&
    a.isEditingPoint === b.isEditingPoint &&
    a.dragPointIndex === b.dragPointIndex &&
    a.dragPointType === b.dragPointType &&
    a.dragAltKey === b.dragAltKey &&
    a.canRenderEntity === b.canRenderEntity &&
    samePoint(a.dragCurrentPoint, b.dragCurrentPoint)
  );
}

function canRenderHotEntity(entity: MapEntity, layerStates: LayerStates): boolean {
  return isEntityTypeInteractive(layerStates, entity.entityType);
}

export function hotRenderStateFromSnapshot(
  snapshot: ReturnType<ActorRefFrom<typeof editorMachine>['getSnapshot']>,
): HotRenderState {
  const selectedEntityId = snapshot.context.selectedEntityId;
  const entity = selectedEntityId
    ? (useMapStore.getState().entities.get(selectedEntityId) ?? null)
    : null;
  const layerStates = useUIStore.getState().layerStates;
  return {
    selectedEntityId,
    entity,
    isEditingPoint: snapshot.value === 'editingPoint',
    dragPointIndex: snapshot.context.dragPointIndex,
    dragPointType: snapshot.context.dragPointType,
    dragCurrentPoint: snapshot.context.dragCurrentPoint,
    dragAltKey: snapshot.context.dragAltKey,
    canRenderEntity: entity ? canRenderHotEntity(entity, layerStates) : false,
  };
}

export function hotDisplayEntity(state: HotRenderState): MapEntity | null {
  if (!state.entity) return null;
  return state.isEditingPoint &&
    state.dragCurrentPoint &&
    (state.dragPointIndex >= 0 ||
      state.dragPointType === 'rotate' ||
      state.dragPointType === 'center')
    ? applyDrag(
        state.entity,
        state.dragPointIndex,
        state.dragPointType,
        state.dragCurrentPoint,
        state.dragAltKey,
      )
    : state.entity;
}

export function renderHotFrame({
  map,
  mapLoaded,
  actorRef,
  lastRenderState,
}: {
  map: maplibregl.Map;
  mapLoaded: boolean;
  actorRef: ActorRefFrom<typeof editorMachine>;
  lastRenderState: HotRenderState | null;
}): HotRenderState | null {
  if (!mapLoaded) return lastRenderState;

  const src = map.getSource('hot') as maplibregl.GeoJSONSource | undefined;
  if (!src) return lastRenderState;

  const nextState = hotRenderStateFromSnapshot(actorRef.getSnapshot());

  if (sameHotRenderState(lastRenderState, nextState)) return lastRenderState;

  if (!nextState.selectedEntityId || !nextState.entity || !nextState.canRenderEntity) {
    src.setData(EMPTY_FC);
    return nextState;
  }

  const displayEntity = hotDisplayEntity(nextState);
  src.setData({
    type: 'FeatureCollection',
    features: displayEntity ? entityToHotFeatures(displayEntity) : [],
  });
  return nextState;
}

export function installHotLayer(
  map: maplibregl.Map,
  mapLoadedRef: React.RefObject<boolean>,
  actorRef: ActorRefFrom<typeof editorMachine>,
): () => void {
  let frameId: number | null = null;
  let lastRenderState: HotRenderState | null = null;

  const renderHotLayer = () => {
    frameId = null;
    lastRenderState = renderHotFrame({
      map,
      mapLoaded: mapLoadedRef.current,
      actorRef,
      lastRenderState,
    });
  };

  const scheduleRender = () => {
    if (frameId !== null) return;
    frameId = requestAnimationFrame(renderHotLayer);
  };

  const actorSubscription = actorRef.subscribe(scheduleRender);
  const unsubscribeStore = useMapStore.subscribe((state, prevState) => {
    if (state.entities !== prevState.entities) {
      scheduleRender();
    }
  });
  const unsubscribeUI = useUIStore.subscribe((state, prevState) => {
    if (state.layerStates !== prevState.layerStates) {
      scheduleRender();
    }
  });

  if (mapLoadedRef.current) {
    scheduleRender();
  } else {
    map.once('load', scheduleRender);
  }

  return () => {
    actorSubscription.unsubscribe();
    unsubscribeStore();
    unsubscribeUI();
    map.off('load', scheduleRender);
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
    }
  };
}

export function useHotLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
  actorRef: ActorRefFrom<typeof editorMachine>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    return installHotLayer(map, mapLoadedRef, actorRef);
  }, [actorRef, mapLoadedRef, mapRef]);
}
