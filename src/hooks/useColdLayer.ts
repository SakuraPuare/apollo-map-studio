import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import type { GeoJSONFeatureId, GeoJSONSourceDiff } from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { useMapStore } from '@/store/mapStore';
import { useTaskProgressStore } from '@/store/taskProgressStore';
import type { SpatialWorkerBridge } from '@/core/workers/spatialBridge';
import type { EntityFeatureGroup, SerializedEntity } from '@/core/workers/protocol';
import { COLD_LAYER_IDS, buildColdLayerFilter } from '@/components/map/coldLayerConfig';

type EntitySnapshot = Map<string, SerializedEntity>;
const SOURCE_UPDATE_CHUNK_SIZE = 4_000;
const FULL_SYNC_ENTITY_CHANGE_THRESHOLD = 5_000;

/**
 * Group a flat feature collection into per-entity buckets keyed by
 * `properties.id`. Used to seed the entity feature cache from a SYNC response.
 */
export function groupFeaturesByEntity(features: GeoJSON.Feature[]): Map<string, GeoJSON.Feature[]> {
  const buckets = new Map<string, GeoJSON.Feature[]>();
  for (const f of features) {
    const id = typeof f.properties?.id === 'string' ? (f.properties.id as string) : '__unkeyed';
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = [];
      buckets.set(id, bucket);
    }
    bucket.push(f);
  }
  return buckets;
}

function groupsToFeatureMap(groups: EntityFeatureGroup[]): Map<string, GeoJSON.Feature[]> {
  const out = new Map<string, GeoJSON.Feature[]>();
  for (const group of groups) out.set(group.id, group.features);
  return out;
}

function featureId(feature: GeoJSON.Feature): GeoJSONFeatureId | null {
  if (typeof feature.id === 'string' || typeof feature.id === 'number') return feature.id;
  const promoted = feature.properties?.featureId;
  if (typeof promoted === 'string' || typeof promoted === 'number') return promoted;
  return null;
}

function withPromotedFeatureId(feature: GeoJSON.Feature): GeoJSON.Feature {
  const id = featureId(feature);
  if (id == null || feature.properties?.featureId === id) return feature;
  return { ...feature, properties: { ...feature.properties, featureId: id } };
}

function setColdSourceData(
  src: maplibregl.GeoJSONSource,
  features: GeoJSON.Feature[],
): Promise<unknown> | maplibregl.GeoJSONSource {
  return src.setData(
    { type: 'FeatureCollection', features: features.map(withPromotedFeatureId) },
    true,
  );
}

function updateColdSourceChunk(
  src: maplibregl.GeoJSONSource,
  diff: GeoJSONSourceDiff,
): Promise<unknown> | maplibregl.GeoJSONSource {
  return src.updateData(diff, true);
}

export function flattenEntityFeatures(
  cache: Map<string, GeoJSON.Feature[]>,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const bucket of cache.values()) features.push(...bucket);
  return { type: 'FeatureCollection', features };
}

async function rebuildColdSourceFromCache(
  src: maplibregl.GeoJSONSource,
  cache: Map<string, GeoJSON.Feature[]>,
) {
  await setColdSourceData(src, []);
  let chunk: GeoJSON.Feature[] = [];
  for (const bucket of cache.values()) {
    for (const feature of bucket) {
      chunk.push(withPromotedFeatureId(feature));
      if (chunk.length >= SOURCE_UPDATE_CHUNK_SIZE) {
        await updateColdSourceChunk(src, { add: chunk });
        chunk = [];
      }
    }
  }
  if (chunk.length > 0) await updateColdSourceChunk(src, { add: chunk });
}

async function applyColdDeltaToSource(
  src: maplibregl.GeoJSONSource,
  previousFeatures: GeoJSON.Feature[],
  changed: EntityFeatureGroup[],
) {
  const remove = previousFeatures.map(featureId).filter((id): id is GeoJSONFeatureId => id != null);
  if (remove.length > 0) await updateColdSourceChunk(src, { remove });

  let add: GeoJSON.Feature[] = [];
  for (const group of changed) {
    for (const feature of group.features) {
      add.push(withPromotedFeatureId(feature));
      if (add.length >= SOURCE_UPDATE_CHUNK_SIZE) {
        await updateColdSourceChunk(src, { add });
        add = [];
      }
    }
  }
  if (add.length > 0) await updateColdSourceChunk(src, { add });
}

function cloneEntities(entities: Map<string, SerializedEntity>): EntitySnapshot {
  return new Map(entities);
}

export function diffEntities(prev: EntitySnapshot, next: Map<string, SerializedEntity>) {
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

export function hasEntityChanges(diff: ReturnType<typeof diffEntities>) {
  return diff.added.length > 0 || diff.updated.length > 0 || diff.removed.length > 0;
}

function diffSize(diff: ReturnType<typeof diffEntities>) {
  return diff.added.length + diff.updated.length + diff.removed.length;
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
  // P1: per-entity feature cache mirrors the worker's output. INCREMENTAL
  // responses ship only the changed entities (COLD_DELTA), and we merge
  // them into this map before rebuilding the flat FC for maplibre.
  const entityFeatureCacheRef = useRef<Map<string, GeoJSON.Feature[]>>(new Map());

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

      const syncAllColdFeatures = async (renderTaskId: string) => {
        if (entities.size > 0) {
          useTaskProgressStore.getState().beginTask({
            id: renderTaskId,
            label: 'Rendering map layers',
            detail: `${entities.size.toLocaleString()} entities`,
            progress: null,
            visibleAfterMs: 1000,
          });
        }
        try {
          const result = await bridge.send({
            type: 'SYNC',
            entities: [...entities.values()],
          });
          if (cancelled || requestVersion !== syncVersionRef.current) return;
          if (result.type === 'COLD_READY') {
            entityFeatureCacheRef.current = groupsToFeatureMap(result.groups);
            if (result.featureCollection) {
              await setColdSourceData(src, result.featureCollection.features);
            } else {
              await rebuildColdSourceFromCache(src, entityFeatureCacheRef.current);
            }
          }
        } catch {
          /* Worker unavailable — cold layer stays stale */
        } finally {
          useTaskProgressStore.getState().endTask(renderTaskId);
        }
      };

      if (!previousSnapshot) {
        prevEntitiesRef.current = snapshot;
        void syncAllColdFeatures('cold-layer-sync');
        return;
      }

      const diff = diffEntities(previousSnapshot, entities);
      prevEntitiesRef.current = snapshot;
      if (!hasEntityChanges(diff)) return;

      if (diffSize(diff) > FULL_SYNC_ENTITY_CHANGE_THRESHOLD) {
        void syncAllColdFeatures('cold-layer-sync');
        return;
      }

      bridge
        .send({
          type: 'INCREMENTAL',
          added: diff.added,
          updated: diff.updated,
          removed: diff.removed,
        })
        .then(async (result) => {
          if (cancelled || requestVersion !== syncVersionRef.current) return;
          if (result.type === 'COLD_DELTA') {
            const cache = entityFeatureCacheRef.current;
            const previousFeatures: GeoJSON.Feature[] = [];
            for (const id of result.removed) {
              previousFeatures.push(...(cache.get(id) ?? []));
              cache.delete(id);
            }
            for (const group of result.changed) {
              previousFeatures.push(...(cache.get(group.id) ?? []));
              cache.set(group.id, group.features);
            }
            await applyColdDeltaToSource(src, previousFeatures, result.changed);
          } else if (result.type === 'COLD_READY') {
            // Back-compat path (shouldn't fire on INCREMENTAL post-P1).
            entityFeatureCacheRef.current = groupsToFeatureMap(result.groups);
            if (result.featureCollection) {
              await setColdSourceData(src, result.featureCollection.features);
            } else {
              await rebuildColdSourceFromCache(src, entityFeatureCacheRef.current);
            }
          }
        })
        .catch(() => {
          /* Worker unavailable — cold layer stays stale */
        });
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
    // mapRef / mapLoadedRef / bridgeRef are refs — non-reactive by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorRef]);
}
