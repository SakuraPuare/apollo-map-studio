import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { useMapStore } from '@/store/mapStore';
import type { SpatialWorkerBridge } from '@/core/workers/spatialBridge';
import type { SerializedEntity } from '@/core/workers/protocol';
import { COLD_LAYER_IDS, buildColdLayerFilter } from '@/components/map/coldLayerConfig';

type EntitySnapshot = Map<string, SerializedEntity>;

function cloneEntities(entities: Map<string, SerializedEntity>): EntitySnapshot {
  return new Map(entities);
}

function diffEntities(
  prev: EntitySnapshot,
  next: Map<string, SerializedEntity>,
) {
  const added: SerializedEntity[] = [];
  const updated: SerializedEntity[] = [];
  const removed: string[] = [];

  for (const [id, entity] of next) {
    const previousEntity = prev.get(id);
    if (!previousEntity) {
      added.push(entity);
      continue;
    }
    if (previousEntity !== entity) {
      updated.push(entity);
    }
  }

  for (const id of prev.keys()) {
    if (!next.has(id)) {
      removed.push(id);
    }
  }

  return { added, updated, removed };
}

function hasEntityChanges(diff: ReturnType<typeof diffEntities>) {
  return diff.added.length > 0 || diff.updated.length > 0 || diff.removed.length > 0;
}

function applyColdSelectionFilter(map: maplibregl.Map, selectedEntityId: string | null) {
  for (const layerId of COLD_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue;
    map.setFilter(layerId, buildColdLayerFilter(layerId, selectedEntityId));
  }
}

export function useColdLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
  actorRef: ActorRefFrom<typeof editorMachine>,
  bridgeRef: React.RefObject<SpatialWorkerBridge | null>,
) {
  const prevEntitiesRef = useRef<EntitySnapshot | null>(null);
  const syncFrameRef = useRef<number | null>(null);
  const syncVersionRef = useRef(0);
  const selectedEntityIdRef = useRef<string | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    const bridge = bridgeRef.current;
    if (!map || !bridge) return;

    let cancelled = false;
    selectedEntityIdRef.current = actorRef.getSnapshot().context.selectedEntityId;

    const syncColdLayer = () => {
      syncFrameRef.current = null;
      if (!mapLoadedRef.current) return;

      const src = map.getSource('cold') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;

      const entities = useMapStore.getState().entities;
      const snapshot = cloneEntities(entities);
      const previousSnapshot = prevEntitiesRef.current;
      const requestVersion = ++syncVersionRef.current;

      if (!previousSnapshot) {
        prevEntitiesRef.current = snapshot;
        bridge.send({
          type: 'SYNC',
          entities: [...entities.values()],
        }).then((result) => {
          if (cancelled || requestVersion !== syncVersionRef.current) return;
          if (result.type === 'COLD_READY') {
            src.setData(result.featureCollection);
          }
        }).catch(() => { /* Worker unavailable — cold layer stays stale */ });
        return;
      }

      const diff = diffEntities(previousSnapshot, entities);
      prevEntitiesRef.current = snapshot;
      if (!hasEntityChanges(diff)) return;

      bridge.send({
        type: 'INCREMENTAL',
        added: diff.added,
        updated: diff.updated,
        removed: diff.removed,
      }).then((result) => {
        if (cancelled || requestVersion !== syncVersionRef.current) return;
        if (result.type === 'COLD_READY') {
          src.setData(result.featureCollection);
        }
      }).catch(() => { /* Worker unavailable — cold layer stays stale */ });
    };

    const scheduleSync = () => {
      if (syncFrameRef.current !== null) return;
      syncFrameRef.current = requestAnimationFrame(syncColdLayer);
    };

    const applySelection = () => {
      if (!mapLoadedRef.current) return;
      applyColdSelectionFilter(map, selectedEntityIdRef.current);
    };

    const onActorChange = () => {
      const selectedEntityId = actorRef.getSnapshot().context.selectedEntityId;
      if (selectedEntityId === selectedEntityIdRef.current) return;
      selectedEntityIdRef.current = selectedEntityId;
      applySelection();
    };

    const actorSubscription = actorRef.subscribe(onActorChange);
    const unsubscribeStore = useMapStore.subscribe((state, prevState) => {
      if (state.entities !== prevState.entities) {
        scheduleSync();
      }
    });

    const onLoad = () => {
      scheduleSync();
      applySelection();
    };

    if (mapLoadedRef.current) {
      onLoad();
      return () => {
        cancelled = true;
        actorSubscription.unsubscribe();
        unsubscribeStore();
        if (syncFrameRef.current !== null) {
          cancelAnimationFrame(syncFrameRef.current);
          syncFrameRef.current = null;
        }
      };
    }

    map.once('load', onLoad);
    return () => {
      cancelled = true;
      actorSubscription.unsubscribe();
      unsubscribeStore();
      map.off('load', onLoad);
      if (syncFrameRef.current !== null) {
        cancelAnimationFrame(syncFrameRef.current);
        syncFrameRef.current = null;
      }
    };
  }, [actorRef]);
}
