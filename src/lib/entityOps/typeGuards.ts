import { isApolloAreaEntity } from '@/core/geometry/apolloCompile';
import type { ApolloEntity } from '@/types/apollo';
import type { DrawingEntity, MapEntity } from '@/types/entities';

const DRAWING_TYPES = new Set(['polyline', 'catmullRom', 'bezier', 'arc', 'rect', 'polygon']);

export function isDrawingEntity(entity: MapEntity): entity is DrawingEntity {
  return DRAWING_TYPES.has(entity.entityType);
}

export function isApolloEntityType(entity: MapEntity): entity is ApolloEntity {
  return !DRAWING_TYPES.has(entity.entityType);
}

export function isAreaEntity(entity: MapEntity): boolean {
  if (isApolloEntityType(entity)) return isApolloAreaEntity(entity);
  return entity.entityType === 'rect' || entity.entityType === 'polygon';
}
