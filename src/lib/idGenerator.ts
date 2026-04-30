import type { MapEntity } from '@/types/entities';

/**
 * Entity id prefixes — aligned with Apollo HD Map official conventions.
 *
 * 底层逻辑：源自 Apollo 官方样例数据（borregas_ave/base_map.bin）实测：
 *   lane_N        / road_N       / signal_N   / stopsign_N    （lowercase）
 *   J_N           / CW_N         / RSU_N                       （abbreviation）
 *   overlap_<participantA>_<participantB>                       （semantic id）
 *
 * 编辑器内部形状类型（polyline / bezier / arc / rect / polygon / catmullRom）
 * 不是 Apollo 实体，沿用 lowercase 但不参与 Apollo round-trip。
 */
const ENTITY_PREFIX: Record<string, string> = {
  lane: 'lane',
  junction: 'J',
  pncJunction: 'PNCJ',
  parkingSpace: 'parkingspace',
  crosswalk: 'CW',
  signal: 'signal',
  stopSign: 'stopsign',
  speedBump: 'speedbump',
  yieldSign: 'yieldsign',
  clearArea: 'cleararea',
  barrierGate: 'barriergate',
  area: 'area',
  road: 'road',
  rsu: 'RSU',
  // Overlap / RegionOverlap auto-derive from participants via makeOverlapId /
  // makeRegionId; nextEntityId is here only for explicit manual creation paths.
  overlap: 'overlap',
  region: 'region',
  polyline: 'polyline',
  catmullRom: 'catmullrom',
  bezier: 'bezier',
  arc: 'arc',
  rect: 'rect',
  polygon: 'polygon',
};

export const SUB_PREFIX = {
  section: 'section',
  passage: 'passage',
  passageGroup: 'passagegroup',
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
