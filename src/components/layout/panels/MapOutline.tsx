import { useMemo } from 'react';
import { useMapStore } from '@/store/mapStore';
import type { MapEntity } from '@/types/entities';
import { MapMetadataForm } from './MapMetadataForm';

// Read-only structural outline of the current map: per-type counts +
// orphan checks (entities whose FK targets are missing). Useful for
// quickly auditing what's in the document before exporting.

const APOLLO_TOP_LEVEL_TYPES = [
  'road',
  'junction',
  'lane',
  'signal',
  'crosswalk',
  'stopSign',
  'yieldSign',
  'speedBump',
  'clearArea',
  'parkingSpace',
  'parkingLot',
  'pncJunction',
  'rsu',
  'area',
  'barrierGate',
  'overlap',
  'speedControl',
] as const;

const TYPE_LABELS: Record<string, string> = {
  road: 'Roads',
  junction: 'Junctions',
  lane: 'Lanes',
  signal: 'Signals',
  crosswalk: 'Crosswalks',
  stopSign: 'Stop Signs',
  yieldSign: 'Yield Signs',
  speedBump: 'Speed Bumps',
  clearArea: 'Clear Areas',
  parkingSpace: 'Parking Spaces',
  parkingLot: 'Parking Lots',
  pncJunction: 'PNC Junctions',
  rsu: 'RSUs',
  area: 'Areas',
  barrierGate: 'Barrier Gates',
  overlap: 'Overlaps',
  speedControl: 'Speed Controls',
  // drawings
  polyline: 'Polylines',
  bezier: 'Beziers',
  arc: 'Arcs',
  rect: 'Rectangles',
  polygon: 'Polygons',
  catmullRom: 'CatmullRom',
};

const DRAWING_TYPES = new Set(['polyline', 'catmullRom', 'bezier', 'arc', 'rect', 'polygon']);

interface OutlineStats {
  apolloCounts: Map<string, number>;
  drawingCount: number;
  unparentedLanes: number;
  orphanedJunctionRefs: number;
}

function computeStats(entities: ReadonlyMap<string, MapEntity>): OutlineStats {
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

export function MapOutline() {
  const entities = useMapStore((s) => s.entities);
  const stats = useMemo(() => computeStats(entities), [entities]);

  const hasAnything = entities.size > 0;

  return (
    <div className="h-full overflow-y-auto p-3 text-xs text-zinc-300 font-mono">
      <div className="mb-3 pb-2 border-b border-white/10">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Map Outline</div>
        <div className="text-zinc-400">
          Total entities: <span className="text-cyan-400">{entities.size}</span>
        </div>
      </div>

      {!hasAnything ? (
        <div className="text-zinc-600 italic">No entities yet.</div>
      ) : (
        <>
          <Section title="Apollo HD-Map">
            {APOLLO_TOP_LEVEL_TYPES.map((t) => {
              const n = stats.apolloCounts.get(t) ?? 0;
              if (n === 0) return null;
              return <Row key={t} label={TYPE_LABELS[t] ?? t} value={n} />;
            })}
          </Section>

          {stats.drawingCount > 0 && (
            <Section title="Drawing Primitives">
              <Row label="Total" value={stats.drawingCount} />
            </Section>
          )}

          <Section title="Health">
            <Row
              label="Unparented Lanes"
              value={stats.unparentedLanes}
              warn={stats.unparentedLanes > 0}
            />
            <Row
              label="Dangling junction_id"
              value={stats.orphanedJunctionRefs}
              warn={stats.orphanedJunctionRefs > 0}
            />
          </Section>
        </>
      )}

      {/* Map.header metadata — surfaces version/date/projection/bounds/etc.
          from the imported Apollo proto. Read-only; see MapMetadataForm
          source for the cross-agent gap on editability. */}
      <div className="mt-2 -mx-3 border-t border-white/10">
        <MapMetadataForm />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex justify-between items-center px-1.5 py-0.5 hover:bg-white/5 rounded">
      <span className="text-zinc-400">{label}</span>
      <span className={warn ? 'text-amber-400' : 'text-cyan-400'}>{value}</span>
    </div>
  );
}
