/**
 * OverlapEntity inspector — read-only summary + per-lane is_merge override
 * + regionOverlaps 钉位按钮（GAP-5 Sprint 3）.
 *
 * 用户在这里 toggle is_merge 时：
 *   1. 直接修改 entity.objects[i].laneOverlapInfo.isMerge
 *   2. 把 `objects.<i>.laneOverlapInfo.isMerge` 加进 _userOverrides
 *      → 后续 reconcile 不会覆盖这条手工值
 *
 * 钉住 region 多边形：
 *   1. `_userOverrides` 加上 `'regionOverlaps'`
 *   2. 后续 reconcile 不重新计算 region polygon —— 用户当前编辑的多边形保留
 *   3. 钉住时同时锁住所有 ObjectOverlapInfo 的 regionOverlapId 引用
 *      （由 reconcile.mergeOneObject 处理，UI 不需要管）
 */
import { Section, Value } from '@/components/ui/form-fields';
import { useMapStore } from '@/store/mapStore';
import type { OverlapEntity, ObjectOverlapInfo } from '@/types/apollo';
import { laneIsMergeOverridePath } from '@/core/elements/overlap/overridePaths';
import { clearOverride, REGION_OVERLAPS_OVERRIDE_PATH, withOverride } from './overlapOverrides';

function shortId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

function describeObject(o: ObjectOverlapInfo): string {
  if (o.objectType === 'lane') {
    const { startS, endS } = o.laneOverlapInfo;
    const range =
      startS === undefined || endS === undefined
        ? 's=—'
        : `s=${startS.toFixed(1)}~${endS.toFixed(1)}m`;
    return `Lane ${shortId(o.objectId)}  ${range}`;
  }
  return `${o.objectType} ${shortId(o.objectId)}`;
}

export function OverlapForm({ entity }: { entity: OverlapEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);

  const overridePathFor = laneIsMergeOverridePath;
  const isPinned = (i: number) => (entity._userOverrides ?? []).includes(overridePathFor(i));

  const onMergeChange = (i: number, next: boolean) => {
    const objects: ObjectOverlapInfo[] = entity.objects.map((o, j) => {
      if (j !== i || o.objectType !== 'lane') return o;
      return {
        ...o,
        laneOverlapInfo: { ...o.laneOverlapInfo, isMerge: next },
      };
    });
    const draft: OverlapEntity = { ...entity, objects };
    updateEntity(entity.id, withOverride(draft, overridePathFor(i)));
  };

  const onUnpin = (i: number) => {
    updateEntity(entity.id, clearOverride(entity, overridePathFor(i)));
  };

  const laneObjects: { o: Extract<ObjectOverlapInfo, { objectType: 'lane' }>; i: number }[] = [];
  for (let i = 0; i < entity.objects.length; i++) {
    const o = entity.objects[i]!;
    if (o.objectType === 'lane') laneObjects.push({ o, i });
  }
  return (
    <form>
      <Section title="Overlap">
        <Value label="ID" value={entity.id} />
        <Value label="Objects" value={entity.objects.length || '—'} />
        <Value label="Regions" value={entity.regionOverlaps.length || '—'} />
      </Section>

      <ParticipantsSection objects={entity.objects} />

      <LaneSemanticsSection
        laneObjects={laneObjects}
        isPinned={isPinned}
        onMergeChange={onMergeChange}
        onUnpin={onUnpin}
      />

      {entity.regionOverlaps.length > 0 && (
        <RegionOverlapsSection
          entity={entity}
          onPin={() => updateEntity(entity.id, withOverride(entity, REGION_OVERLAPS_OVERRIDE_PATH))}
          onUnpin={() =>
            updateEntity(entity.id, clearOverride(entity, REGION_OVERLAPS_OVERRIDE_PATH))
          }
        />
      )}
    </form>
  );
}

function ParticipantsSection({ objects }: { objects: ObjectOverlapInfo[] }) {
  return (
    <Section title="Participants">
      {objects.length === 0 && (
        <div className="text-[10px] text-zinc-600 italic py-1">no objects</div>
      )}
      {objects.map((o, i) => (
        <Value key={`${o.objectType}:${o.objectId}`} label={`#${i}`} value={describeObject(o)} />
      ))}
    </Section>
  );
}

interface LaneSemanticsSectionProps {
  laneObjects: { o: Extract<ObjectOverlapInfo, { objectType: 'lane' }>; i: number }[];
  isPinned: (i: number) => boolean;
  onMergeChange: (i: number, next: boolean) => void;
  onUnpin: (i: number) => void;
}

function LaneSemanticsSection({
  laneObjects,
  isPinned,
  onMergeChange,
  onUnpin,
}: LaneSemanticsSectionProps) {
  if (laneObjects.length < 2) return null;

  return (
    <Section title="Lane × Lane Semantics">
      {laneObjects.map(({ o, i }) => (
        <div key={`merge-${o.objectId}`} className="flex items-center gap-2 py-1">
          <span className="text-[11px] text-zinc-500 w-24 shrink-0">Lane #{i} merge</span>
          <label className="flex items-center gap-1 text-[11px] text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={!!o.laneOverlapInfo.isMerge}
              onChange={(e) => onMergeChange(i, e.target.checked)}
              className="cursor-pointer"
            />
            <span>{o.laneOverlapInfo.isMerge ? 'merge' : 'no merge'}</span>
          </label>
          {isPinned(i) ? (
            <button
              type="button"
              onClick={() => onUnpin(i)}
              className="text-[10px] text-cyan-300 hover:text-red-400 px-1.5 py-0.5 rounded border border-cyan-500/20 hover:border-red-400/40"
              title="Release pin → reconcile may override on next geometry change"
            >
              pinned ×
            </button>
          ) : (
            <span className="text-[10px] text-zinc-600 italic">auto</span>
          )}
        </div>
      ))}
    </Section>
  );
}

interface RegionOverlapsSectionProps {
  entity: OverlapEntity;
  onPin: () => void;
  onUnpin: () => void;
}

function RegionOverlapsSection({ entity, onPin, onUnpin }: RegionOverlapsSectionProps) {
  const pinned = (entity._userOverrides ?? []).includes(REGION_OVERLAPS_OVERRIDE_PATH);

  return (
    <Section title="Region Overlaps">
      <div className="flex items-center gap-2 py-1">
        <span className="text-[11px] text-zinc-500 w-24 shrink-0">geometry</span>
        {pinned ? (
          <>
            <span className="text-[11px] text-cyan-300">pinned</span>
            <button
              type="button"
              onClick={onUnpin}
              className="text-[10px] text-cyan-300 hover:text-red-400 px-1.5 py-0.5 rounded border border-cyan-500/20 hover:border-red-400/40"
              title="Release pin → reconcile recomputes region polygons from lane corridor × secondary on next geometry change"
            >
              pinned ×
            </button>
          </>
        ) : (
          <>
            <span className="text-[11px] text-zinc-300">auto-derived</span>
            <button
              type="button"
              onClick={onPin}
              className="text-[10px] text-zinc-400 hover:text-cyan-300 px-1.5 py-0.5 rounded border border-zinc-700 hover:border-cyan-500/40"
              title="Pin → freeze current region polygons + their id references against future reconcile"
            >
              pin
            </button>
          </>
        )}
      </div>

      {entity.regionOverlaps.map((r, i) => {
        const pointCount = r.polygons.reduce((acc, p) => acc + p.points.length, 0);
        return (
          <Value
            key={`region-${r.id}`}
            label={`#${i}`}
            value={`${shortId(r.id)} · ${r.polygons.length} ring · ${pointCount} pt`}
          />
        );
      })}
    </Section>
  );
}
