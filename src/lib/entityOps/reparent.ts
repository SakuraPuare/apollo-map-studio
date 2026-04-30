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

type ReparentHandler = (
  child: MapEntity,
  target: ParentTarget,
  allEntities: ReadonlyMap<string, MapEntity>,
) => ReparentResult;

function handleLaneToJunction(
  child: MapEntity,
  target: ParentTarget,
  allEntities: ReadonlyMap<string, MapEntity>,
): ReparentResult {
  const t = target as Extract<ParentTarget, { kind: 'junction' }>;
  const j = allEntities.get(t.id);
  if (j?.entityType !== 'junction') return rejected('target is not a junction');
  const lane = child as LaneEntity;
  const changes = new Map<string, MapEntity>();
  if (lane.junctionId !== t.id) {
    changes.set(lane.id, { ...lane, junctionId: t.id });
  }
  for (const [id, road] of stripLaneFromAllSections(lane.id, allEntities)) {
    changes.set(id, road);
  }
  return { changes };
}

function handleLaneToRoad(
  child: MapEntity,
  target: ParentTarget,
  allEntities: ReadonlyMap<string, MapEntity>,
): ReparentResult {
  const t = target as Extract<ParentTarget, { kind: 'road' }>;
  const r = allEntities.get(t.id);
  if (r?.entityType !== 'road') return rejected('target is not a road');
  const road = r;
  const sectionId = road.sections[0]?.id ?? `${road.id}_s0`;
  return reparent(child, { kind: 'roadSection', roadId: road.id, sectionId }, allEntities);
}

function handleLaneToRoadSection(
  child: MapEntity,
  target: ParentTarget,
  allEntities: ReadonlyMap<string, MapEntity>,
): ReparentResult {
  const t = target as Extract<ParentTarget, { kind: 'roadSection' }>;
  const r = allEntities.get(t.roadId);
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
    if (s.id === t.sectionId) {
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

  if (!alreadyThere && !sections.some((s) => s.id === t.sectionId)) {
    sections = [...sections, { id: t.sectionId, laneIds: [lane.id] }];
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

function handleLaneToNone(
  child: MapEntity,
  _target: ParentTarget,
  allEntities: ReadonlyMap<string, MapEntity>,
): ReparentResult {
  const lane = child as LaneEntity;
  const changes = new Map<string, MapEntity>();
  if (lane.junctionId) changes.set(lane.id, { ...lane, junctionId: null });
  for (const [id, road] of stripLaneFromAllSections(lane.id, allEntities)) {
    changes.set(id, road);
  }
  return { changes };
}

function handleRoadToJunction(
  child: MapEntity,
  target: ParentTarget,
  allEntities: ReadonlyMap<string, MapEntity>,
): ReparentResult {
  const t = target as Extract<ParentTarget, { kind: 'junction' }>;
  const j = allEntities.get(t.id);
  if (j?.entityType !== 'junction') return rejected('target is not a junction');
  const road = child as RoadEntity;
  if (road.junctionId === t.id) return EMPTY;
  return { changes: new Map([[road.id, { ...road, junctionId: t.id }]]) };
}

function handleRoadToNone(child: MapEntity): ReparentResult {
  const road = child as RoadEntity;
  if (!road.junctionId) return EMPTY;
  return { changes: new Map([[road.id, { ...road, junctionId: null }]]) };
}

function handleRsuToJunction(
  child: MapEntity,
  target: ParentTarget,
  allEntities: ReadonlyMap<string, MapEntity>,
): ReparentResult {
  const t = target as Extract<ParentTarget, { kind: 'junction' }>;
  const j = allEntities.get(t.id);
  if (j?.entityType !== 'junction') return rejected('target is not a junction');
  const rsu = child as RSUEntity;
  if (rsu.junctionId === t.id) return EMPTY;
  return { changes: new Map([[rsu.id, { ...rsu, junctionId: t.id }]]) };
}

function handleRsuToNone(child: MapEntity): ReparentResult {
  const rsu = child as RSUEntity;
  if (!rsu.junctionId) return EMPTY;
  return { changes: new Map([[rsu.id, { ...rsu, junctionId: null }]]) };
}

const HANDLERS: Record<string, ReparentHandler> = {
  'lane:junction': handleLaneToJunction,
  'lane:road': handleLaneToRoad,
  'lane:roadSection': handleLaneToRoadSection,
  'lane:none': handleLaneToNone,
  'road:junction': handleRoadToJunction,
  'road:none': handleRoadToNone,
  'rsu:junction': handleRsuToJunction,
  'rsu:none': handleRsuToNone,
};

export function reparent(
  child: MapEntity,
  target: ParentTarget,
  allEntities: ReadonlyMap<string, MapEntity>,
): ReparentResult {
  const key = `${child.entityType}:${target.kind}`;
  const handler = HANDLERS[key];
  if (!handler) return rejected(`cannot reparent ${child.entityType} → ${target.kind}`);
  return handler(child, target, allEntities);
}

export function canReparent(
  child: MapEntity,
  target: ParentTarget,
  allEntities: ReadonlyMap<string, MapEntity>,
): boolean {
  return reparent(child, target, allEntities).rejected === undefined;
}
