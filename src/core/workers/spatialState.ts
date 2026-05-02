import RBush from 'rbush';
import type { LaneEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import { compileColdFeatures, entityBBox } from '@/core/geometry/compile';
import { LaneJunctionGraph, laneEndpointKeys } from './laneJunctionGraph';

export interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
  entityType: string;
}

/**
 * Worker-local mutable state.
 *
 * `decorationCache` is per-lane: decorateBoundary is the dominant cost of
 * buildFeatureCollection, so incremental edits only refresh affected lanes.
 */
export interface SpatialState {
  tree: RBush<SpatialItem>;
  entityMap: Map<string, MapEntity>;
  itemMap: Map<string, SpatialItem>;
  featureCache: Map<string, GeoJSON.Feature[]>;
  decorationCache: Map<string, GeoJSON.Feature[]>;
  junctionGraph: LaneJunctionGraph;
  pendingSyncs: Map<string, { entities: MapEntity[]; total: number; excludeId?: string | null }>;
  laneCount: number;
}

export function createSpatialState(): SpatialState {
  return {
    tree: new RBush<SpatialItem>(),
    entityMap: new Map(),
    itemMap: new Map(),
    featureCache: new Map(),
    decorationCache: new Map(),
    junctionGraph: new LaneJunctionGraph(),
    pendingSyncs: new Map(),
    laneCount: 0,
  };
}

export function resetSpatialState(state: SpatialState) {
  state.tree.clear();
  state.entityMap.clear();
  state.itemMap.clear();
  state.featureCache.clear();
  state.decorationCache.clear();
  state.junctionGraph.clear();
  state.laneCount = 0;
}

function createSpatialItem(entity: MapEntity): SpatialItem {
  const [minX, minY, maxX, maxY] = entityBBox(entity);
  return {
    minX,
    minY,
    maxX,
    maxY,
    id: entity.id,
    entityType: entity.entityType,
  };
}

function addLaneToGraph(state: SpatialState, entity: MapEntity) {
  if (entity.entityType !== 'lane') return;
  state.laneCount++;
  const keys = laneEndpointKeys(entity as LaneEntity);
  if (keys) state.junctionGraph.addLane(entity.id, keys);
  state.decorationCache.delete(entity.id);
}

export function insertEntity(state: SpatialState, entity: MapEntity) {
  state.entityMap.set(entity.id, entity);
  const item = createSpatialItem(entity);
  state.itemMap.set(entity.id, item);
  state.tree.insert(item);
  state.featureCache.set(entity.id, compileColdFeatures(entity));
  addLaneToGraph(state, entity);
}

export function removeEntity(state: SpatialState, id: string) {
  const entity = state.entityMap.get(id);
  const item = state.itemMap.get(id);
  if (item) {
    state.tree.remove(item, (a, b) => a.id === b.id);
    state.itemMap.delete(id);
  }
  state.entityMap.delete(id);
  state.featureCache.delete(id);
  if (entity?.entityType === 'lane') {
    state.laneCount = Math.max(0, state.laneCount - 1);
    state.junctionGraph.removeLane(id);
    state.decorationCache.delete(id);
  }
}

export function syncEntities(state: SpatialState, entities: MapEntity[]) {
  resetSpatialState(state);
  const items: SpatialItem[] = [];

  for (const entity of entities) {
    state.entityMap.set(entity.id, entity);
    const item = createSpatialItem(entity);
    state.itemMap.set(entity.id, item);
    items.push(item);
    state.featureCache.set(entity.id, compileColdFeatures(entity));
    addLaneToGraph(state, entity);
  }

  state.tree.load(items);
}
