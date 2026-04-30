import { isApolloAreaEntity, isApolloPolygonEditPoints } from '@/core/geometry/apolloCompile';
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

/**
 * Whether the entity's editPoints form a closed polygon ring (vs. an open
 * polyline). Used by the hot layer so that `lane`/`signal` editPoints are
 * rendered as LineStrings instead of being closed into a Polygon.
 */
export function isPolygonEditEntity(entity: MapEntity): boolean {
  if (isApolloEntityType(entity)) return isApolloPolygonEditPoints(entity);
  return entity.entityType === 'rect' || entity.entityType === 'polygon';
}
