import type { LaneEntity, RoadEntity, RoadSection, RSUEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

export type ParentTarget =
  | { kind: 'junction'; id: string }
  | { kind: 'road'; id: string }
  | { kind: 'roadSection'; roadId: string; sectionId: string }
  | { kind: 'none' };

export interface ReparentResult {
  changes: Map<string, MapEntity>;
  rejected?: string;
}

const EMPTY: ReparentResult = { changes: new Map() };

function rejected(reason: string): ReparentResult {
  return { changes: new Map(), rejected: reason };
}

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

  if (t === 'lane' && target.kind === 'road') {
    const r = allEntities.get(target.id);
    if (r?.entityType !== 'road') return rejected('target is not a road');
    const road = r;
    const sectionId = road.sections[0]?.id ?? `${road.id}_s0`;
    return reparent(child, { kind: 'roadSection', roadId: road.id, sectionId }, allEntities);
  }

  if (t === 'lane' && target.kind === 'roadSection') {
    const r = allEntities.get(target.roadId);
    if (r?.entityType !== 'road') return rejected('target road missing');
    const road = r;
    const lane = child as LaneEntity;
    const changes = new Map<string, MapEntity>();

    if (lane.junctionId) {
      changes.set(lane.id, { ...lane, junctionId: null });
    }

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

    if (!alreadyThere && !sections.some((s) => s.id === target.sectionId)) {
      sections = [...sections, { id: target.sectionId, laneIds: [lane.id] }];
      mutatedSections = true;
    }

    if (mutatedSections) {
      changes.set(road.id, { ...road, sections });
    }

    for (const [id, otherRoad] of stripLaneFromAllSections(lane.id, allEntities, road.id)) {
      changes.set(id, otherRoad);
    }

    return { changes };
  }

  if (t === 'lane' && target.kind === 'none') {
    const lane = child as LaneEntity;
    const changes = new Map<string, MapEntity>();
    if (lane.junctionId) changes.set(lane.id, { ...lane, junctionId: null });
    for (const [id, road] of stripLaneFromAllSections(lane.id, allEntities)) {
      changes.set(id, road);
    }
    return { changes };
  }

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

export function canReparent(
  child: MapEntity,
  target: ParentTarget,
  allEntities: ReadonlyMap<string, MapEntity>,
): boolean {
  return reparent(child, target, allEntities).rejected === undefined;
}
