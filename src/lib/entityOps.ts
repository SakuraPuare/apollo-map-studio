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
import type {
  ApolloEntity,
  LaneEntity,
  RoadEntity,
  RoadSection,
  RSUEntity,
  PNCJunctionEntity,
  Passage,
} from '@/types/apollo';
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
import { applyDerive } from '@/core/elements/derive';

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
  const raw = createApolloEntity(elementType, drawTool, points, anchors, options);
  return applyDerive(raw, { cause: 'create' });
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

// ─── Reparent (Apollo HD-Map foreign-key edits) ──────────────
//
// These rules implement the ID-reference 1:N relationships from the
// proto schema as drag-target operations. Every accepted reparent
// returns a deterministic set of (id → new entity) changes that
// callers (mapStore.reparentEntity) apply atomically.
//
// Invariants enforced:
//   - A Lane belongs to AT MOST ONE primary parent at a time:
//       junctionId  XOR  exactly one RoadSection.laneIds entry.
//   - A Road's junctionId is set/cleared on demand (Junction has no
//     reverse list, so no cleanup needed there).
//   - An RSU's junctionId is set/cleared the same way.

export type ParentTarget =
  | { kind: 'junction'; id: string }
  | { kind: 'road'; id: string }
  | { kind: 'roadSection'; roadId: string; sectionId: string }
  | { kind: 'none' };

export interface ReparentResult {
  /** Entities that need to be persisted. Empty Map means "no-op accepted". */
  changes: Map<string, MapEntity>;
  /** Human-readable rejection reason; if set, no changes should be applied. */
  rejected?: string;
}

const EMPTY: ReparentResult = { changes: new Map() };

function rejected(reason: string): ReparentResult {
  return { changes: new Map(), rejected: reason };
}

/** Strip a Lane id from every RoadSection in every Road, returning touched roads. */
function stripLaneFromAllSections(
  laneId: string,
  allEntities: ReadonlyMap<string, MapEntity>,
  exceptRoadId?: string,
): Map<string, RoadEntity> {
  const touched = new Map<string, RoadEntity>();
  for (const e of allEntities.values()) {
    if (e.entityType !== 'road') continue;
    if (exceptRoadId && e.id === exceptRoadId) continue;
    const road = e;
    let dirty = false;
    const sections: RoadSection[] = road.sections.map((s) => {
      if (s.laneIds.includes(laneId)) {
        dirty = true;
        return { ...s, laneIds: s.laneIds.filter((id) => id !== laneId) };
      }
      return s;
    });
    if (dirty) touched.set(road.id, { ...road, sections });
  }
  return touched;
}

export function reparent(
  child: MapEntity,
  target: ParentTarget,
  allEntities: ReadonlyMap<string, MapEntity>,
): ReparentResult {
  const t = child.entityType;

  // ── Lane → Junction ─────────────────────────────────────
  if (t === 'lane' && target.kind === 'junction') {
    const j = allEntities.get(target.id);
    if (j?.entityType !== 'junction') return rejected('target is not a junction');
    const lane = child as LaneEntity;
    const changes = new Map<string, MapEntity>();
    if (lane.junctionId !== target.id) {
      changes.set(lane.id, { ...lane, junctionId: target.id });
    }
    for (const [id, road] of stripLaneFromAllSections(lane.id, allEntities)) {
      changes.set(id, road);
    }
    return { changes };
  }

  // ── Lane → Road (auto-pick first section, create one if absent) ──
  if (t === 'lane' && target.kind === 'road') {
    const r = allEntities.get(target.id);
    if (r?.entityType !== 'road') return rejected('target is not a road');
    const road = r;
    const sectionId = road.sections[0]?.id ?? `${road.id}_s0`;
    return reparent(child, { kind: 'roadSection', roadId: road.id, sectionId }, allEntities);
  }

  // ── Lane → RoadSection ──────────────────────────────────
  if (t === 'lane' && target.kind === 'roadSection') {
    const r = allEntities.get(target.roadId);
    if (r?.entityType !== 'road') return rejected('target road missing');
    const road = r;
    const lane = child as LaneEntity;
    const changes = new Map<string, MapEntity>();

    // 1. Lane.junctionId must be cleared (mutual exclusion).
    if (lane.junctionId) {
      changes.set(lane.id, { ...lane, junctionId: null });
    }

    // 2. Update target road's sections: insert into target, remove from siblings.
    let alreadyThere = false;
    let mutatedSections = false;
    let sections: RoadSection[] = road.sections.map((s) => {
      if (s.id === target.sectionId) {
        if (s.laneIds.includes(lane.id)) {
          alreadyThere = true;
          return s;
        }
        mutatedSections = true;
        return { ...s, laneIds: [...s.laneIds, lane.id] };
      }
      if (s.laneIds.includes(lane.id)) {
        mutatedSections = true;
        return { ...s, laneIds: s.laneIds.filter((id) => id !== lane.id) };
      }
      return s;
    });

    // Auto-create the section if Road had none / target id not found.
    if (!alreadyThere && !sections.some((s) => s.id === target.sectionId)) {
      sections = [...sections, { id: target.sectionId, laneIds: [lane.id] }];
      mutatedSections = true;
    }

    if (mutatedSections) {
      changes.set(road.id, { ...road, sections });
    }

    // 3. Strip from any OTHER road's sections.
    for (const [id, otherRoad] of stripLaneFromAllSections(lane.id, allEntities, road.id)) {
      changes.set(id, otherRoad);
    }

    return { changes };
  }

  // ── Lane → none (unparent: clear junction + strip from all sections) ──
  if (t === 'lane' && target.kind === 'none') {
    const lane = child as LaneEntity;
    const changes = new Map<string, MapEntity>();
    if (lane.junctionId) changes.set(lane.id, { ...lane, junctionId: null });
    for (const [id, road] of stripLaneFromAllSections(lane.id, allEntities)) {
      changes.set(id, road);
    }
    return { changes };
  }

  // ── Road → Junction ─────────────────────────────────────
  if (t === 'road' && target.kind === 'junction') {
    const j = allEntities.get(target.id);
    if (j?.entityType !== 'junction') return rejected('target is not a junction');
    const road = child as RoadEntity;
    if (road.junctionId === target.id) return EMPTY;
    return { changes: new Map([[road.id, { ...road, junctionId: target.id }]]) };
  }
  if (t === 'road' && target.kind === 'none') {
    const road = child as RoadEntity;
    if (!road.junctionId) return EMPTY;
    return { changes: new Map([[road.id, { ...road, junctionId: null }]]) };
  }

  // ── RSU → Junction ──────────────────────────────────────
  if (t === 'rsu' && target.kind === 'junction') {
    const j = allEntities.get(target.id);
    if (j?.entityType !== 'junction') return rejected('target is not a junction');
    const rsu = child as RSUEntity;
    if (rsu.junctionId === target.id) return EMPTY;
    return { changes: new Map([[rsu.id, { ...rsu, junctionId: target.id }]]) };
  }
  if (t === 'rsu' && target.kind === 'none') {
    const rsu = child as RSUEntity;
    if (!rsu.junctionId) return EMPTY;
    return { changes: new Map([[rsu.id, { ...rsu, junctionId: null }]]) };
  }

  return rejected(`cannot reparent ${t} → ${target.kind}`);
}

/** Pure check: would `reparent(child, target)` be accepted? Used by tree drop validation. */
export function canReparent(
  child: MapEntity,
  target: ParentTarget,
  allEntities: ReadonlyMap<string, MapEntity>,
): boolean {
  return reparent(child, target, allEntities).rejected === undefined;
}

// ─── Cascade delete (FK cleanup) ─────────────────────────────
//
// When an entity is removed, every other entity that referenced it by
// id must drop that reference, otherwise:
//   - LayerTree shows phantom children (lane has junctionId pointing
//     at a junction that no longer exists)
//   - exporting map.bin produces dangling FKs and Apollo fails to load.
//
// This helper does not delete anything itself — it returns the set of
// entities that need to be persisted with stripped references. The
// caller (mapStore.removeEntity) deletes the originals atomically with
// these writes.

function stripIds(arr: string[], removed: ReadonlySet<string>): string[] | null {
  let dirty = false;
  const out: string[] = [];
  for (const id of arr) {
    if (removed.has(id)) {
      dirty = true;
      continue;
    }
    out.push(id);
  }
  return dirty ? out : null;
}

/**
 * Compute every FK cleanup needed when `removedIds` are about to be
 * deleted. Returns a `Map<id, MapEntity>` of entities to persist.
 *
 * Covered FK fields:
 *   - any Apollo entity:  overlapIds
 *   - Lane:               junctionId, predecessor/successor/neighbor/selfReverse arrays
 *   - Road:               junctionId, sections[i].laneIds
 *   - RSU:                junctionId
 *   - PNCJunction:        passageGroups[i].passages[j].{lane,signal,yield,stopSign}Ids
 */
export function cascadeDeleteRefs(
  removedIds: ReadonlySet<string>,
  allEntities: ReadonlyMap<string, MapEntity>,
): Map<string, MapEntity> {
  const changes = new Map<string, MapEntity>();
  if (removedIds.size === 0) return changes;

  for (const e of allEntities.values()) {
    if (removedIds.has(e.id)) continue; // about to be deleted
    let next: MapEntity = e;
    let dirty = false;

    // Common: overlapIds (present on most Apollo entities)
    if ('overlapIds' in next && Array.isArray((next as { overlapIds: string[] }).overlapIds)) {
      const arr = (next as { overlapIds: string[] }).overlapIds;
      const stripped = stripIds(arr, removedIds);
      if (stripped) {
        next = { ...next, overlapIds: stripped } as MapEntity;
        dirty = true;
      }
    }

    if (next.entityType === 'lane') {
      const lane = next as LaneEntity;
      let updated: LaneEntity = lane;
      if (lane.junctionId && removedIds.has(lane.junctionId)) {
        updated = { ...updated, junctionId: null };
      }
      const topoFields = [
        'predecessorIds',
        'successorIds',
        'leftNeighborForwardIds',
        'rightNeighborForwardIds',
        'leftNeighborReverseIds',
        'rightNeighborReverseIds',
        'selfReverseLaneIds',
      ] as const;
      for (const f of topoFields) {
        const stripped = stripIds(updated[f], removedIds);
        if (stripped) updated = { ...updated, [f]: stripped };
      }
      if (updated !== lane) {
        next = updated;
        dirty = true;
      }
    } else if (next.entityType === 'road') {
      const road = next as RoadEntity;
      let updated: RoadEntity = road;
      let secDirty = false;
      const sections: RoadSection[] = road.sections.map((s) => {
        const stripped = stripIds(s.laneIds, removedIds);
        if (stripped) {
          secDirty = true;
          return { ...s, laneIds: stripped };
        }
        return s;
      });
      if (secDirty) updated = { ...updated, sections };
      if (updated.junctionId && removedIds.has(updated.junctionId)) {
        updated = { ...updated, junctionId: null };
      }
      if (updated !== road) {
        next = updated;
        dirty = true;
      }
    } else if (next.entityType === 'rsu') {
      const rsu = next as RSUEntity;
      if (rsu.junctionId && removedIds.has(rsu.junctionId)) {
        next = { ...rsu, junctionId: null };
        dirty = true;
      }
    } else if (next.entityType === 'pncJunction') {
      const pnc = next as PNCJunctionEntity;
      let pgDirty = false;
      const passageGroups = pnc.passageGroups.map((pg) => {
        let psDirty = false;
        const passages: Passage[] = pg.passages.map((p) => {
          const lane = stripIds(p.laneIds, removedIds);
          const sig = stripIds(p.signalIds, removedIds);
          const yld = stripIds(p.yieldIds, removedIds);
          const stp = stripIds(p.stopSignIds, removedIds);
          if (lane || sig || yld || stp) {
            psDirty = true;
            return {
              ...p,
              laneIds: lane ?? p.laneIds,
              signalIds: sig ?? p.signalIds,
              yieldIds: yld ?? p.yieldIds,
              stopSignIds: stp ?? p.stopSignIds,
            };
          }
          return p;
        });
        if (psDirty) {
          pgDirty = true;
          return { ...pg, passages };
        }
        return pg;
      });
      if (pgDirty) {
        next = { ...pnc, passageGroups };
        dirty = true;
      }
    }

    if (dirty) changes.set(e.id, next);
  }

  return changes;
}
