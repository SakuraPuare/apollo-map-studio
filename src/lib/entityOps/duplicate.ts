import { DEG_TO_M } from '@/core/geometry/apolloCompile/projection';
import { nextEntityId } from '@/lib/idGenerator';
import type { GeoPoint, MapEntity } from '@/types/entities';

export const DEFAULT_DUPLICATE_OFFSET_METERS = 1;

export interface DuplicateEntityOptions {
  offsetMeters?: number;
}

type GeoPointLike = Pick<GeoPoint, 'x' | 'y'>;

function isGeoPointLike(value: unknown): value is GeoPointLike {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as { x?: unknown; y?: unknown };
  return typeof maybe.x === 'number' && typeof maybe.y === 'number';
}

function firstLatitude(value: unknown, seen = new WeakSet<object>()): number | null {
  if (!value || typeof value !== 'object') return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (isGeoPointLike(value)) return value.y;

  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  for (const child of children) {
    const lat = firstLatitude(child, seen);
    if (lat !== null) return lat;
  }
  return null;
}

function translateGeoPoints(value: unknown, dx: number, dy: number, seen = new WeakSet<object>()) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (isGeoPointLike(value)) {
    value.x += dx;
    value.y += dy;
    return;
  }

  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  for (const child of children) translateGeoPoints(child, dx, dy, seen);
}

function offsetDegrees(entity: MapEntity, offsetMeters: number): { dx: number; dy: number } {
  const lat = firstLatitude(entity) ?? 0;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  return {
    dx: offsetMeters / (cosLat * DEG_TO_M),
    dy: offsetMeters / DEG_TO_M,
  };
}

function clearOverlapRefs(entity: MapEntity): void {
  if ('overlapIds' in entity && Array.isArray(entity.overlapIds)) {
    entity.overlapIds = [];
  }
}

function resetCopiedReferences(entity: MapEntity): void {
  clearOverlapRefs(entity);

  switch (entity.entityType) {
    case 'lane':
      entity.predecessorIds = [];
      entity.successorIds = [];
      entity.leftNeighborForwardIds = [];
      entity.rightNeighborForwardIds = [];
      entity.leftNeighborReverseIds = [];
      entity.rightNeighborReverseIds = [];
      entity.selfReverseLaneIds = [];
      entity.junctionId = null;
      break;
    case 'road':
      entity.sections = entity.sections.map((section) => ({ ...section, laneIds: [] }));
      entity.junctionId = null;
      break;
    case 'pncJunction':
      entity.passageGroups = [];
      break;
    case 'rsu':
      entity.junctionId = null;
      break;
    default:
      break;
  }
}

export function canDuplicateEntity(entity: MapEntity): boolean {
  return entity.entityType !== 'overlap';
}

export function duplicateEntity(
  entity: MapEntity,
  entities: ReadonlyMap<string, MapEntity>,
  options: DuplicateEntityOptions = {},
): MapEntity | null {
  if (!canDuplicateEntity(entity)) return null;

  const copy = structuredClone(entity) as MapEntity;
  copy.id = nextEntityId(copy.entityType, entities);

  const offsetMeters = options.offsetMeters ?? DEFAULT_DUPLICATE_OFFSET_METERS;
  if (offsetMeters !== 0) {
    const { dx, dy } = offsetDegrees(copy, offsetMeters);
    translateGeoPoints(copy, dx, dy);
  }

  resetCopiedReferences(copy);
  return copy;
}
