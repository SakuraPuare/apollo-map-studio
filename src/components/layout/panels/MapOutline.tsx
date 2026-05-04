import { useMemo } from 'react';
import { getEntityColor, getEntityIcon, getEntityLabel } from '@/core/entityRegistry';
import { useMapStore } from '@/store/mapStore';
import type { MapEntity } from '@/types/entities';
import { MapMetadataForm } from './MapMetadataForm';

// Read-only structural outline of the current map: per-type counts +
// orphan checks (entities whose FK targets are missing). Useful for
// quickly auditing what's in the document before exporting.

const DRAWING_TYPES = new Set(['polyline', 'catmullRom', 'bezier', 'arc', 'rect', 'polygon']);
const OUTLINE_GROUPS = [
  {
    title: '路网结构',
    types: ['road', 'junction', 'lane'],
  },
  {
    title: '交通控制',
    types: ['signal', 'stopSign', 'yieldSign', 'speedControl', 'barrierGate', 'rsu'],
  },
  {
    title: '区域与设施',
    types: [
      'crosswalk',
      'parkingSpace',
      'parkingLot',
      'clearArea',
      'speedBump',
      'area',
      'pncJunction',
    ],
  },
  {
    title: '关联关系',
    types: ['overlap'],
  },
] satisfies ReadonlyArray<{ title: string; types: readonly string[] }>;

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
  const apolloTotal = useMemo(
    () => [...stats.apolloCounts.values()].reduce((sum, n) => sum + n, 0),
    [stats],
  );
  const issueCount = stats.unparentedLanes + stats.orphanedJunctionRefs;

  const hasAnything = entities.size > 0;

  return (
    <div className="h-full overflow-y-auto ams-layer-tree-scrollbar text-xs text-zinc-300">
      <div className="px-3 py-3 border-b border-white/[0.07]">
        <div className="grid grid-cols-3 gap-1.5">
          <SummaryMetric label="地图" value={apolloTotal} />
          <SummaryMetric label="草图" value={stats.drawingCount} />
          <SummaryMetric label="检查" value={issueCount} tone={issueCount > 0 ? 'warn' : 'ok'} />
        </div>
      </div>

      <div className="px-3 py-3">
        {!hasAnything ? (
          <EmptyState />
        ) : (
          <>
            {OUTLINE_GROUPS.map((group) => (
              <EntitySection
                key={group.title}
                title={group.title}
                types={group.types}
                counts={stats.apolloCounts}
              />
            ))}

            {stats.drawingCount > 0 && (
              <Section title="草图元素">
                <Row label="临时绘制对象" value={stats.drawingCount} />
              </Section>
            )}

            <Section title="结构检查">
              {issueCount === 0 ? (
                <CheckPassed />
              ) : (
                <>
                  <Row
                    label="未归属车道"
                    value={stats.unparentedLanes}
                    warn={stats.unparentedLanes > 0}
                  />
                  <Row
                    label="失效路口引用"
                    value={stats.orphanedJunctionRefs}
                    warn={stats.orphanedJunctionRefs > 0}
                  />
                </>
              )}
            </Section>
          </>
        )}
      </div>

      <div className="border-t border-white/[0.07]">
        <MapMetadataForm />
      </div>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'ok' | 'warn';
}) {
  const valueClass =
    tone === 'warn' ? 'text-amber-300' : tone === 'ok' ? 'text-emerald-300' : 'text-cyan-300';

  return (
    <div className="min-w-0 rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1.5">
      <div className="text-[10px] text-zinc-500 leading-none mb-1">{label}</div>
      <div className={`font-mono text-sm leading-none ${valueClass}`}>{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-4 text-[11px] leading-5 text-zinc-500">
      当前地图还没有实体。导入 Apollo 地图或开始绘制后，这里会显示路网、交通设施和结构检查。
    </div>
  );
}

function EntitySection({
  title,
  types,
  counts,
}: {
  title: string;
  types: readonly string[];
  counts: ReadonlyMap<string, number>;
}) {
  const rows = types
    .map((type) => ({ type, count: counts.get(type) ?? 0 }))
    .filter((row) => row.count > 0);

  if (rows.length === 0) return null;

  return (
    <Section title={title}>
      {rows.map(({ type, count }) => (
        <EntityRow key={type} type={type} value={count} />
      ))}
    </Section>
  );
}

function EntityRow({ type, value }: { type: string; value: number }) {
  const Icon = getEntityIcon(type);
  const color = getEntityColor(type) ?? '#a1a1aa';

  return (
    <div className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-white/[0.04]">
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" style={{ color }} />
      <span className="min-w-0 flex-1 truncate text-zinc-400 group-hover:text-zinc-200">
        {getEntityLabel(type)}
      </span>
      <span className="font-mono text-[11px] text-cyan-300 tabular-nums">{value}</span>
    </div>
  );
}

function CheckPassed() {
  return (
    <div className="flex items-center justify-between rounded px-1.5 py-1 text-[11px]">
      <span className="text-zinc-500">车道归属与路口引用</span>
      <span className="text-emerald-300">正常</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="h-3 w-[2px] rounded-full bg-cyan-400/60" />
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{title}</div>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded px-1.5 py-1 hover:bg-white/[0.04]">
      <span className="text-zinc-400">{label}</span>
      <span className={warn ? 'font-mono text-amber-300' : 'font-mono text-cyan-300'}>{value}</span>
    </div>
  );
}
