import type {
  LaneEntity,
  Passage,
  PNCJunctionEntity,
  RoadEntity,
  RoadSection,
  RSUEntity,
} from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

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

export function cascadeDeleteRefs(
  removedIds: ReadonlySet<string>,
  allEntities: ReadonlyMap<string, MapEntity>,
): Map<string, MapEntity> {
  const changes = new Map<string, MapEntity>();
  if (removedIds.size === 0) return changes;

  for (const e of allEntities.values()) {
    if (removedIds.has(e.id)) continue;
    let next: MapEntity = e;
    let dirty = false;

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
