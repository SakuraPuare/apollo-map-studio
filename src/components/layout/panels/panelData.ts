import type { MapEntity } from '@/types/entities';

const DRAWING_TYPES = new Set(['polyline', 'catmullRom', 'bezier', 'arc', 'rect', 'polygon']);

export interface OutlineStats {
  apolloCounts: Map<string, number>;
  drawingCount: number;
  unparentedLanes: number;
  orphanedJunctionRefs: number;
}

export function computeStats(entities: ReadonlyMap<string, MapEntity>): OutlineStats {
  const stats: OutlineStats = {
    apolloCounts: new Map(),
    drawingCount: 0,
    unparentedLanes: 0,
    orphanedJunctionRefs: 0,
  };
  const lanesInSection = collectRoadSectionLaneIds(entities);

  for (const entity of entities.values()) {
    addEntityToStats(stats, entity, entities, lanesInSection);
  }

  return stats;
}

function collectRoadSectionLaneIds(entities: ReadonlyMap<string, MapEntity>): Set<string> {
  const laneIds = new Set<string>();
  for (const e of entities.values()) {
    if (e.entityType === 'road') {
      for (const section of e.sections) {
        for (const laneId of section.laneIds) laneIds.add(laneId);
      }
    }
  }
  return laneIds;
}

function addEntityToStats(
  stats: OutlineStats,
  entity: MapEntity,
  entities: ReadonlyMap<string, MapEntity>,
  lanesInSection: ReadonlySet<string>,
): void {
  if (DRAWING_TYPES.has(entity.entityType)) {
    stats.drawingCount += 1;
    return;
  }

  stats.apolloCounts.set(entity.entityType, (stats.apolloCounts.get(entity.entityType) ?? 0) + 1);
  if (isUnparentedLane(entity, entities, lanesInSection)) stats.unparentedLanes += 1;
  if (hasMissingJunctionRef(entity, entities)) stats.orphanedJunctionRefs += 1;
}

function isUnparentedLane(
  entity: MapEntity,
  entities: ReadonlyMap<string, MapEntity>,
  lanesInSection: ReadonlySet<string>,
): boolean {
  if (entity.entityType !== 'lane') return false;
  const hasJunction = entity.junctionId !== null && entities.has(entity.junctionId);
  return !hasJunction && !lanesInSection.has(entity.id);
}

function hasMissingJunctionRef(entity: MapEntity, entities: ReadonlyMap<string, MapEntity>) {
  if (entity.entityType !== 'lane' && entity.entityType !== 'road' && entity.entityType !== 'rsu') {
    return false;
  }
  return entity.junctionId !== null && !entities.has(entity.junctionId);
}

export function searchEntities(
  entities: ReadonlyMap<string, { id: string; entityType: string }>,
  query: string,
  limit = 200,
): { id: string; entityType: string }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: { id: string; entityType: string }[] = [];
  for (const e of entities.values()) {
    if (e.id.toLowerCase().includes(q) || e.entityType.toLowerCase().includes(q)) {
      out.push({ id: e.id, entityType: e.entityType });
      if (out.length >= limit) break;
    }
  }
  return out;
}
