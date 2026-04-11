/**
 * entityOps — anti-corruption layer between Apollo proto domain and UI.
 *
 * The UI layer (src/components/**, src/hooks/**) MUST NOT reach into
 * src/core/geometry/apolloCompile.ts directly. This module is the single
 * seam where proto-aware operations cross into presentation code.
 *
 * Everything here takes/returns `MapEntity` (the internal union of
 * `DrawingEntity | ApolloEntity`) — callers never have to discriminate.
 *
 * R2 risk containment: when Apollo proto v2 lands and breaks the
 * apolloCompile internals, only this file and apolloCompile.ts need to
 * move — the 7 UI-layer files that imported proto internals now see a
 * stable surface.
 */

import type { MapEntity, DrawingEntity, GeoPoint, BezierAnchorData } from '@/types/entities';
import type { ApolloEntity } from '@/types/apollo';
import type { LngLat, BezierAnchor } from '@/core/geometry/interpolate';
import type { MapElementType } from '@/core/elements';
import {
  getApolloEditPoints,
  setApolloEditPoint,
  setAllApolloEditPoints,
  moveApolloEntity,
  deleteApolloVertex,
  isApolloAreaEntity,
  compileApolloFeatures,
  createApolloEntity,
  apolloEntityCoords,
} from '@/core/geometry/apolloCompile';

// Re-export for callers who need to name the types but shouldn't reach
// for `@/types/apollo` themselves.
export type { MapEntity, DrawingEntity, ApolloEntity, GeoPoint, BezierAnchorData };

// ─── Type guards ──────────────────────────────────────────────

const DRAWING_TYPES = new Set(['polyline', 'catmullRom', 'bezier', 'arc', 'rect', 'polygon']);

export function isDrawingEntity(entity: MapEntity): entity is DrawingEntity {
  return DRAWING_TYPES.has(entity.entityType);
}

export function isApolloEntityType(entity: MapEntity): entity is ApolloEntity {
  return !DRAWING_TYPES.has(entity.entityType);
}

/** True if the entity's primary geometry is a filled area (polygon). */
export function isAreaEntity(entity: MapEntity): boolean {
  if (isApolloEntityType(entity)) return isApolloAreaEntity(entity);
  return entity.entityType === 'rect' || entity.entityType === 'polygon';
}

// ─── Edit-point access (proto-neutral) ───────────────────────

/**
 * Editable vertex positions for the given entity, in proto-native `GeoPoint`.
 * Apollo entities delegate to `apolloCompile.getApolloEditPoints`; drawing
 * primitives synthesize from their own shape.
 */
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

/**
 * Mutate a single edit point by index. Apollo entities delegate to the
 * proto-aware setter; drawing entities return unchanged (callers should
 * not go through this helper for drawing primitives — use `entityMutations`
 * which knows about handles, rotation, etc).
 */
export function setEditPoint(entity: MapEntity, index: number, point: GeoPoint): MapEntity {
  if (isApolloEntityType(entity)) {
    return setApolloEditPoint(entity, index, point);
  }
  return entity;
}

export function setAllEditPoints(entity: MapEntity, points: GeoPoint[]): MapEntity {
  if (isApolloEntityType(entity)) {
    return setAllApolloEditPoints(entity, points);
  }
  return entity;
}

export function moveEntity(entity: MapEntity, dx: number, dy: number): MapEntity {
  if (isApolloEntityType(entity)) {
    return moveApolloEntity(entity, dx, dy);
  }
  return entity;
}

export function deleteVertex(entity: MapEntity, index: number): MapEntity | null {
  if (isApolloEntityType(entity)) {
    return deleteApolloVertex(entity, index);
  }
  return entity;
}

// ─── Compile + create (passthrough) ──────────────────────────

/**
 * Compile an Apollo entity to its cold-layer GeoJSON features. Drawing
 * entities are compiled by `src/core/geometry/compile.ts` on a different
 * path; this helper is here for parity but returns `[]` for them so
 * callers don't have to special-case.
 */
export function compileEntity(entity: MapEntity): GeoJSON.Feature[] {
  if (isApolloEntityType(entity)) {
    return compileApolloFeatures(entity);
  }
  return [];
}

/**
 * Factory: create an Apollo entity from a drawing session. Thin wrapper
 * around the proto-aware factory so UI code doesn't import apolloCompile.
 */
export function createEntity(
  elementType: MapElementType,
  drawTool: string,
  points: LngLat[],
  anchors: BezierAnchor[],
  options?: { laneHalfWidth?: number },
): ApolloEntity {
  return createApolloEntity(elementType, drawTool, points, anchors, options);
}

/**
 * All coordinates that make up an entity's primary geometry, as LngLat.
 * For non-Apollo drawing primitives, callers should use their own
 * shape-specific helpers — this is a proto-side pass-through.
 */
export function entityCoords(entity: MapEntity): LngLat[] {
  if (isApolloEntityType(entity)) {
    return apolloEntityCoords(entity);
  }
  return getEditPoints(entity).map((p) => [p.x, p.y] as LngLat);
}
