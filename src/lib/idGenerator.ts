import type { MapEntity } from '@/types/entities';

const ENTITY_PREFIX: Record<string, string> = {
  lane: 'Lane',
  junction: 'Junction',
  pncJunction: 'PNCJunction',
  parkingSpace: 'ParkingSpace',
  crosswalk: 'Crosswalk',
  signal: 'Signal',
  stopSign: 'StopSign',
  speedBump: 'SpeedBump',
  yieldSign: 'YieldSign',
  clearArea: 'ClearArea',
  barrierGate: 'BarrierGate',
  area: 'Area',
  road: 'Road',
  rsu: 'RSU',
  polyline: 'Polyline',
  catmullRom: 'CatmullRom',
  bezier: 'Bezier',
  arc: 'Arc',
  rect: 'Rect',
  polygon: 'Polygon',
};

export const SUB_PREFIX = {
  section: 'Section',
  passage: 'Passage',
  passageGroup: 'PassageGroup',
} as const;

export function entityIdPrefix(entityType: string): string {
  return ENTITY_PREFIX[entityType] ?? entityType.charAt(0).toUpperCase() + entityType.slice(1);
}

function maxNumberWithPrefix(prefix: string, ids: Iterable<string>): number {
  const re = new RegExp(`^${prefix}_(\\d+)$`);
  let max = 0;
  for (const id of ids) {
    const m = re.exec(id);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

const fallbackCounter: Record<string, number> = {};

export function nextEntityId(
  entityType: string,
  entities?: ReadonlyMap<string, MapEntity>,
): string {
  const prefix = entityIdPrefix(entityType);
  if (entities) {
    const ids: string[] = [];
    for (const e of entities.values()) {
      if (e.entityType === entityType) ids.push(e.id);
    }
    return `${prefix}_${maxNumberWithPrefix(prefix, ids) + 1}`;
  }
  fallbackCounter[prefix] = (fallbackCounter[prefix] ?? 0) + 1;
  return `${prefix}_${fallbackCounter[prefix]}`;
}

export function nextSubId(prefix: string, existingIds: Iterable<string>): string {
  return `${prefix}_${maxNumberWithPrefix(prefix, existingIds) + 1}`;
}
