import type {
  LaneEntity,
  ObjectOverlapInfo,
  OverlapEntity,
  Passage,
  PNCJunctionEntity,
  RoadEntity,
  RoadSection,
  RSUEntity,
} from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

export interface CascadeDeleteResult {
  /** Entities that need to be patched in place. */
  changes: Map<string, MapEntity>;
  /** Additional entity ids to remove (e.g. now-orphaned Overlap entities). */
  cascadeRemoved: Set<string>;
}

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

function hasOverlapIds(e: MapEntity): e is MapEntity & { overlapIds: string[] } {
  return 'overlapIds' in e && Array.isArray((e as { overlapIds: string[] }).overlapIds);
}

function stripOverlapIds(e: MapEntity, removed: ReadonlySet<string>): MapEntity | null {
  if (!hasOverlapIds(e)) return null;
  const stripped = stripIds(e.overlapIds, removed);
  return stripped ? ({ ...e, overlapIds: stripped } as MapEntity) : null;
}

function cleanupLane(lane: LaneEntity, removed: ReadonlySet<string>): LaneEntity | null {
  let next: LaneEntity = lane;
  if (lane.junctionId && removed.has(lane.junctionId)) {
    next = { ...next, junctionId: null };
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
    const stripped = stripIds(next[f], removed);
    if (stripped) next = { ...next, [f]: stripped };
  }
  return next === lane ? null : next;
}

function cleanupRoad(road: RoadEntity, removed: ReadonlySet<string>): RoadEntity | null {
  let next: RoadEntity = road;
  let secDirty = false;
  const sections: RoadSection[] = road.sections.map((s) => {
    const stripped = stripIds(s.laneIds, removed);
    if (stripped) {
      secDirty = true;
      return { ...s, laneIds: stripped };
    }
    return s;
  });
  if (secDirty) next = { ...next, sections };
  if (next.junctionId && removed.has(next.junctionId)) {
    next = { ...next, junctionId: null };
  }
  return next === road ? null : next;
}

function cleanupPNCJunction(
  pnc: PNCJunctionEntity,
  removed: ReadonlySet<string>,
): PNCJunctionEntity | null {
  let pgDirty = false;
  const passageGroups = pnc.passageGroups.map((pg) => {
    let psDirty = false;
    const passages: Passage[] = pg.passages.map((p) => {
      const lane = stripIds(p.laneIds, removed);
      const sig = stripIds(p.signalIds, removed);
      const yld = stripIds(p.yieldIds, removed);
      const stp = stripIds(p.stopSignIds, removed);
      if (!lane && !sig && !yld && !stp) return p;
      psDirty = true;
      return {
        ...p,
        laneIds: lane ?? p.laneIds,
        signalIds: sig ?? p.signalIds,
        yieldIds: yld ?? p.yieldIds,
        stopSignIds: stp ?? p.stopSignIds,
      };
    });
    if (!psDirty) return pg;
    pgDirty = true;
    return { ...pg, passages };
  });
  return pgDirty ? { ...pnc, passageGroups } : null;
}

interface OverlapDecision {
  remove?: true;
  patched?: OverlapEntity;
}

function decideOverlap(ov: OverlapEntity, removed: ReadonlySet<string>): OverlapDecision {
  const remaining = ov.objects.filter((o: ObjectOverlapInfo) => !removed.has(o.objectId));
  if (remaining.length < 2) return { remove: true };
  if (remaining.length === ov.objects.length) return {};
  return { patched: { ...ov, objects: remaining } };
}

/**
 * @deprecated Returns only `changes`. Prefer `cascadeDeleteRefsFull` which
 * also yields a `cascadeRemoved` set so callers can drop orphaned Overlap
 * entities. This signature is kept temporarily for incremental migration.
 */
export function cascadeDeleteRefs(
  removedIds: ReadonlySet<string>,
  allEntities: ReadonlyMap<string, MapEntity>,
): Map<string, MapEntity> {
  return cascadeDeleteRefsFull(removedIds, allEntities).changes;
}

export function cascadeDeleteRefsFull(
  removedIds: ReadonlySet<string>,
  allEntities: ReadonlyMap<string, MapEntity>,
): CascadeDeleteResult {
  const changes = new Map<string, MapEntity>();
  const cascadeRemoved = new Set<string>();
  if (removedIds.size === 0) return { changes, cascadeRemoved };

  for (const e of allEntities.values()) {
    if (removedIds.has(e.id)) continue;
    const patched = patchOne(e, removedIds, cascadeRemoved);
    if (patched && patched !== e) changes.set(e.id, patched);
  }

  if (cascadeRemoved.size > 0) {
    cleanupCascadedOverlapIds(allEntities, removedIds, cascadeRemoved, changes);
  }

  return { changes, cascadeRemoved };
}

function patchOne(
  e: MapEntity,
  removed: ReadonlySet<string>,
  cascadeRemoved: Set<string>,
): MapEntity | null {
  if (e.entityType === 'overlap') {
    const decision = decideOverlap(e as OverlapEntity, removed);
    if (decision.remove) {
      cascadeRemoved.add(e.id);
      return null;
    }
    return decision.patched ?? e;
  }

  let next: MapEntity = e;
  const stripped = stripOverlapIds(next, removed);
  if (stripped) next = stripped;

  switch (next.entityType) {
    case 'lane': {
      const r = cleanupLane(next as LaneEntity, removed);
      if (r) next = r;
      break;
    }
    case 'road': {
      const r = cleanupRoad(next as RoadEntity, removed);
      if (r) next = r;
      break;
    }
    case 'rsu': {
      const r = next as RSUEntity;
      if (r.junctionId && removed.has(r.junctionId)) next = { ...r, junctionId: null };
      break;
    }
    case 'pncJunction': {
      const r = cleanupPNCJunction(next as PNCJunctionEntity, removed);
      if (r) next = r;
      break;
    }
    default:
      break;
  }

  return next;
}

function cleanupCascadedOverlapIds(
  allEntities: ReadonlyMap<string, MapEntity>,
  removedIds: ReadonlySet<string>,
  cascadeRemoved: ReadonlySet<string>,
  changes: Map<string, MapEntity>,
): void {
  for (const e of allEntities.values()) {
    if (removedIds.has(e.id) || cascadeRemoved.has(e.id)) continue;
    const draft = changes.get(e.id) ?? e;
    const stripped = stripOverlapIds(draft, cascadeRemoved);
    if (stripped) changes.set(e.id, stripped);
  }
}
