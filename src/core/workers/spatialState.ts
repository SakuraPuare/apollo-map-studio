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
  cancelledSyncs: Set<string>;
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
    cancelledSyncs: new Set(),
    laneCount: 0,
  };
}

function resetSpatialState(state: SpatialState) {
  state.tree.clear();
  state.entityMap.clear();
  state.itemMap.clear();
  state.featureCache.clear();
  state.decorationCache.clear();
  state.junctionGraph.clear();
  state.laneCount = 0;
}

function extendCoords(
  coords: GeoJSON.Position[],
  bounds: [number, number, number, number],
): [number, number, number, number] {
  let [minX, minY, maxX, maxY] = bounds;
  for (const coord of coords) {
    const x = coord[0]!;
    const y = coord[1]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function extendGeometryBounds(
  geometry: GeoJSON.Geometry | null,
  bounds: [number, number, number, number],
): [number, number, number, number] {
  if (!geometry) return bounds;
  switch (geometry.type) {
    case 'Point':
      return extendCoords([geometry.coordinates], bounds);
    case 'LineString':
    case 'MultiPoint':
      return extendCoords(geometry.coordinates, bounds);
    case 'Polygon':
    case 'MultiLineString':
      return geometry.coordinates.reduce(
        (nextBounds, ring) => extendCoords(ring, nextBounds),
        bounds,
      );
    case 'MultiPolygon':
      return geometry.coordinates.reduce(
        (polygonBounds, polygon) =>
          polygon.reduce((ringBounds, ring) => extendCoords(ring, ringBounds), polygonBounds),
        bounds,
      );
    case 'GeometryCollection':
      return geometry.geometries.reduce(
        (nextBounds, child) => extendGeometryBounds(child, nextBounds),
        bounds,
      );
  }
}

function featureBounds(features: GeoJSON.Feature[]): [number, number, number, number] | null {
  let bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of features) bounds = extendGeometryBounds(feature.geometry, bounds);
  return bounds[0] === Infinity ? null : bounds;
}

function isFiniteBounds(bounds: [number, number, number, number]): boolean {
  return bounds.every(Number.isFinite) && bounds[0] <= bounds[2] && bounds[1] <= bounds[3];
}

function createSpatialItem(entity: MapEntity, features: GeoJSON.Feature[]): SpatialItem | null {
  const [minX, minY, maxX, maxY] = featureBounds(features) ?? entityBBox(entity);
  if (!isFiniteBounds([minX, minY, maxX, maxY])) return null;
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
  const features = compileColdFeatures(entity);
  const item = createSpatialItem(entity, features);
  if (item) {
    state.itemMap.set(entity.id, item);
    state.tree.insert(item);
  }
  state.featureCache.set(entity.id, features);
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
    const features = compileColdFeatures(entity);
    const item = createSpatialItem(entity, features);
    if (item) {
      state.itemMap.set(entity.id, item);
      items.push(item);
    }
    state.featureCache.set(entity.id, features);
    addLaneToGraph(state, entity);
  }

  state.tree.load(items);
}
