import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useSelector } from '@xstate/react';
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
  const entities = useMapStore((s) => s.entities);
  const selectedEntityId = useSelector(actorRef, (s) => s.context.selectedEntityId);
  const prevEntitiesRef = useRef<EntitySnapshot | null>(null);
  const syncFrameRef = useRef<number | null>(null);
  const syncVersionRef = useRef(0);

  useEffect(() => {
    const map = mapRef.current;
    const bridge = bridgeRef.current;
    if (!map || !bridge) return;

    let cancelled = false;

    const syncColdLayer = () => {
      syncFrameRef.current = null;
      if (!mapLoadedRef.current) return;

      const src = map.getSource('cold') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;

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
      if (syncFrameRef.current !== null) {
        cancelAnimationFrame(syncFrameRef.current);
      }
      syncFrameRef.current = requestAnimationFrame(syncColdLayer);
    };

    if (mapLoadedRef.current) {
      scheduleSync();
      return () => {
        cancelled = true;
        if (syncFrameRef.current !== null) {
          cancelAnimationFrame(syncFrameRef.current);
          syncFrameRef.current = null;
        }
      };
    }

    map.once('load', syncColdLayer);
    return () => {
      cancelled = true;
      map.off('load', syncColdLayer);
      if (syncFrameRef.current !== null) {
        cancelAnimationFrame(syncFrameRef.current);
        syncFrameRef.current = null;
      }
    };
  }, [entities]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateFilter = () => {
      if (!mapLoadedRef.current) return;
      applyColdSelectionFilter(map, selectedEntityId);
    };

    if (mapLoadedRef.current) {
      updateFilter();
      return;
    }

    map.once('load', updateFilter);
    return () => {
      map.off('load', updateFilter);
    };
  }, [selectedEntityId]);
}
