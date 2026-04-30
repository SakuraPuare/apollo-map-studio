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

function shortId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

function describeObject(o: ObjectOverlapInfo): string {
  if (o.objectType === 'lane') {
    const { startS, endS } = o.laneOverlapInfo;
    return `Lane ${shortId(o.objectId)}  s=${startS.toFixed(1)}~${endS.toFixed(1)}m`;
  }
  return `${o.objectType} ${shortId(o.objectId)}`;
}

/**
 * Pure transforms exported for testability. `path` matches the runtime
 * contract consumed by core/elements/overlap/reconcile.ts:
 *   - `objects.<i>.laneOverlapInfo.isMerge` → freeze isMerge on slot i
 *   - `regionOverlaps`                      → freeze the whole region polygon
 *                                             list + per-object regionOverlapId
 */
export function withOverride(entity: OverlapEntity, path: string): OverlapEntity {
  const arr = entity._userOverrides ?? [];
  if (arr.includes(path)) return entity;
  return { ...entity, _userOverrides: [...arr, path] };
}

export function clearOverride(entity: OverlapEntity, path: string): OverlapEntity {
  const arr = entity._userOverrides;
  if (!arr || !arr.includes(path)) return entity;
  const next = arr.filter((p) => p !== path);
  return { ...entity, _userOverrides: next.length > 0 ? next : undefined };
}

/** Stable path constant for region polygon pinning (referenced by inspector + tests). */
export const REGION_OVERLAPS_OVERRIDE_PATH = 'regionOverlaps';

export function OverlapForm({ entity }: { entity: OverlapEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);

  const overridePathFor = (i: number) => `objects.${i}.laneOverlapInfo.isMerge`;
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

  const laneObjects = entity.objects
    .map((o, i) => ({ o, i }))
    .filter(
      (p): p is { o: Extract<ObjectOverlapInfo, { objectType: 'lane' }>; i: number } =>
        p.o.objectType === 'lane',
    );
  const laneCount = laneObjects.length;

  return (
    <form>
      <Section title="Overlap">
        <Value label="ID" value={entity.id} />
        <Value label="Objects" value={entity.objects.length} />
        <Value label="Regions" value={entity.regionOverlaps.length || '—'} />
      </Section>

      <Section title="Participants">
        {entity.objects.length === 0 && (
          <div className="text-[10px] text-zinc-600 italic py-1">no objects</div>
        )}
        {entity.objects.map((o, i) => (
          <Value
            key={`${o.objectType}:${o.objectId}:${i}`}
            label={`#${i}`}
            value={describeObject(o)}
          />
        ))}
      </Section>

      {laneCount >= 2 && (
        <Section title="Lane × Lane Semantics">
          {laneObjects.map(({ o, i }) => (
            <div key={`merge-${i}`} className="flex items-center gap-2 py-1">
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
      )}

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
            key={`region-${r.id}-${i}`}
            label={`#${i}`}
            value={`${shortId(r.id)} · ${r.polygons.length} ring · ${pointCount} pt`}
          />
        );
      })}
    </Section>
  );
}
