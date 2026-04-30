import type { BezierAnchor } from '@/core/geometry/interpolate';
import type { LngLat } from '@/core/geometry/interpolate';
import type { MapElementType } from '@/core/elements';
import { applyDerive } from '@/core/elements/derive';
import {
  apolloEntityCoords,
  compileApolloFeatures,
  createApolloEntity,
  deleteApolloVertex,
  getApolloEditPoints,
  moveApolloEntity,
  setAllApolloEditPoints,
  setApolloEditPoint,
} from '@/core/geometry/apolloCompile';
import type { ApolloEntity } from '@/types/apollo';
import type { GeoPoint, MapEntity } from '@/types/entities';
import { isApolloEntityType } from './typeGuards';

export function getEditPoints(entity: MapEntity): GeoPoint[] {
  if (isApolloEntityType(entity)) {
    return getApolloEditPoints(entity);
  }
  switch (entity.entityType) {
    case 'polyline':
    case 'catmullRom':
    case 'polygon':
      return entity.points;
    case 'bezier':
      return entity.anchors.map((a) => a.point);
    case 'arc':
      return [entity.start, entity.mid, entity.end];
    case 'rect':
      return [entity.p1, entity.p2];
  }
}

export function setEditPoint(entity: MapEntity, index: number, point: GeoPoint): MapEntity {
  if (isApolloEntityType(entity)) {
    const next = setApolloEditPoint(entity, index, point);
    return applyDerive(next, { cause: 'editGeometry', prev: entity });
  }
  return entity;
}

export function setAllEditPoints(entity: MapEntity, points: GeoPoint[]): MapEntity {
  if (isApolloEntityType(entity)) {
    const next = setAllApolloEditPoints(entity, points);
    return applyDerive(next, { cause: 'editGeometry', prev: entity });
  }
  return entity;
}

export function moveEntity(entity: MapEntity, dx: number, dy: number): MapEntity {
  if (isApolloEntityType(entity)) {
    const next = moveApolloEntity(entity, dx, dy);
    return applyDerive(next, { cause: 'editGeometry', prev: entity });
  }
  return entity;
}

export function deleteVertex(entity: MapEntity, index: number): MapEntity | null {
  if (isApolloEntityType(entity)) {
    const next = deleteApolloVertex(entity, index);
    return next ? applyDerive(next, { cause: 'editGeometry', prev: entity }) : next;
  }
  return entity;
}

export function compileEntity(entity: MapEntity): GeoJSON.Feature[] {
  if (isApolloEntityType(entity)) {
    return compileApolloFeatures(entity);
  }
  return [];
}

export function createEntity(
  elementType: MapElementType,
  drawTool: string,
  points: LngLat[],
  anchors: BezierAnchor[],
  options?: { laneHalfWidth?: number; entities?: ReadonlyMap<string, MapEntity> },
): ApolloEntity {
  const raw = createApolloEntity(elementType, drawTool, points, anchors, options);
  return applyDerive(raw, { cause: 'create' });
}

export function entityCoords(entity: MapEntity): LngLat[] {
  if (isApolloEntityType(entity)) {
    return apolloEntityCoords(entity);
  }
  return getEditPoints(entity).map((p) => [p.x, p.y] as LngLat);
}
