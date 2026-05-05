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

export function canRenderHotEntity(entity: MapEntity, layerStates: LayerStates): boolean {
  return isEntityTypeInteractive(layerStates, entity.entityType);
}

export function useHotLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
  actorRef: ActorRefFrom<typeof editorMachine>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let frameId: number | null = null;
    let lastRenderState: HotRenderState | null = null;

    const renderHotLayer = () => {
      frameId = null;
      if (!mapLoadedRef.current) return;

      const src = map.getSource('hot') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;

      const snapshot = actorRef.getSnapshot();
      const selectedEntityId = snapshot.context.selectedEntityId;
      const entity = selectedEntityId
        ? (useMapStore.getState().entities.get(selectedEntityId) ?? null)
        : null;
      const layerStates = useUIStore.getState().layerStates;
      const nextState: HotRenderState = {
        selectedEntityId,
        entity,
        isEditingPoint: snapshot.value === 'editingPoint',
        dragPointIndex: snapshot.context.dragPointIndex,
        dragPointType: snapshot.context.dragPointType,
        dragCurrentPoint: snapshot.context.dragCurrentPoint,
        dragAltKey: snapshot.context.dragAltKey,
        canRenderEntity: entity ? canRenderHotEntity(entity, layerStates) : false,
      };

      if (sameHotRenderState(lastRenderState, nextState)) return;
      lastRenderState = nextState;

      if (!selectedEntityId || !entity || !nextState.canRenderEntity) {
        src.setData(EMPTY_FC);
        return;
      }

      const displayEntity =
        nextState.isEditingPoint &&
        nextState.dragCurrentPoint &&
        (nextState.dragPointIndex >= 0 ||
          nextState.dragPointType === 'rotate' ||
          nextState.dragPointType === 'center')
          ? applyDrag(
              entity,
              nextState.dragPointIndex,
              nextState.dragPointType,
              nextState.dragCurrentPoint,
              nextState.dragAltKey,
            )
          : entity;

      src.setData({ type: 'FeatureCollection', features: entityToHotFeatures(displayEntity) });
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
  }, [actorRef, mapLoadedRef, mapRef]);
}
