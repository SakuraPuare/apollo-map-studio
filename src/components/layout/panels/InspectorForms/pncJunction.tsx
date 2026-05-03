import { useMemo } from 'react';
import { Section, Value } from '@/components/ui/form-fields';
import { getEnumLabel } from '@/lib/enumLabels';
import { nextSubId, SUB_PREFIX } from '@/lib/idGenerator';
import { useMapStore } from '@/store/mapStore';
import type { Passage, PassageGroup, PassageType, PNCJunctionEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

const PASSAGE_TYPES: readonly PassageType[] = ['UNKNOWN_PASSAGE', 'ENTRANCE', 'EXIT'];

interface AvailablePassageRefs {
  lane: string[];
  signal: string[];
  stopSign: string[];
  yieldSign: string[];
}

function shortId(id: string): string {
  return id.length > 14 ? `…${id.slice(-10)}` : id;
}

function collectIdsByType(entities: ReadonlyMap<string, MapEntity>, entityType: string): string[] {
  const out: string[] = [];
  for (const e of entities.values()) {
    if (e.entityType === entityType) out.push(e.id);
  }
  return out.sort();
}

function useAvailablePassageRefs(entities: ReadonlyMap<string, MapEntity>): AvailablePassageRefs {
  return useMemo(
    () => ({
      lane: collectIdsByType(entities, 'lane'),
      signal: collectIdsByType(entities, 'signal'),
      stopSign: collectIdsByType(entities, 'stopSign'),
      yieldSign: collectIdsByType(entities, 'yieldSign'),
    }),
    [entities],
  );
}

interface IdMultiSelectProps {
  label: string;
  currentIds: string[];
  availableIds: string[];
  onChange: (next: string[]) => void;
}

function IdMultiSelect({ label, currentIds, availableIds, onChange }: IdMultiSelectProps) {
  const remaining = useMemo(
    () => availableIds.filter((id) => !currentIds.includes(id)),
    [availableIds, currentIds],
  );
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-[10px] text-zinc-500 w-16 shrink-0 mt-1">{label}</span>
      <div className="flex-1 min-w-0 flex flex-wrap gap-1 items-center">
        {currentIds.length === 0 && <span className="text-[10px] text-zinc-600 italic">none</span>}
        {currentIds.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[10px] font-mono border border-cyan-500/20"
            title={id}
          >
            {shortId(id)}
            <button
              type="button"
              onClick={() => onChange(currentIds.filter((x) => x !== id))}
              className="hover:text-red-400 leading-none"
              aria-label={`Remove ${id}`}
            >
              ×
            </button>
          </span>
        ))}
        {remaining.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onChange([...currentIds, e.target.value]);
            }}
            className="text-[10px] bg-zinc-800/50 border border-white/10 rounded px-1 py-0.5 text-zinc-400 hover:border-cyan-500/30 focus:border-cyan-500/50 focus:outline-none cursor-pointer"
          >
            <option value="">+ add</option>
            {remaining.map((id) => (
              <option key={id} value={id} className="bg-zinc-900">
                {shortId(id)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

interface PassageBlockProps {
  passage: Passage;
  available: AvailablePassageRefs;
  onChange: (next: Passage) => void;
  onRemove: () => void;
}

function PassageBlock({ passage, available, onChange, onRemove }: PassageBlockProps) {
  return (
    <div className="border border-white/5 rounded p-2 mb-2 bg-zinc-900/30">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-mono text-zinc-500 truncate flex-1" title={passage.id}>
          {shortId(passage.id)}
        </span>
        <select
          value={passage.type}
          onChange={(e) => onChange({ ...passage, type: e.target.value as PassageType })}
          className="text-[10px] bg-zinc-800/50 border border-white/10 rounded px-1 py-0.5 text-zinc-300 cursor-pointer focus:border-cyan-500/50 focus:outline-none"
        >
          {PASSAGE_TYPES.map((t) => (
            <option key={t} value={t} className="bg-zinc-900">
              {getEnumLabel('passageType', t)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="text-[11px] text-zinc-600 hover:text-red-400 px-1"
          title="Delete passage"
        >
          ×
        </button>
      </div>
      <IdMultiSelect
        label="Lanes"
        currentIds={passage.laneIds}
        availableIds={available.lane}
        onChange={(laneIds) => onChange({ ...passage, laneIds })}
      />
      <IdMultiSelect
        label="Signals"
        currentIds={passage.signalIds}
        availableIds={available.signal}
        onChange={(signalIds) => onChange({ ...passage, signalIds })}
      />
      <IdMultiSelect
        label="Stop"
        currentIds={passage.stopSignIds}
        availableIds={available.stopSign}
        onChange={(stopSignIds) => onChange({ ...passage, stopSignIds })}
      />
      <IdMultiSelect
        label="Yield"
        currentIds={passage.yieldIds}
        availableIds={available.yieldSign}
        onChange={(yieldIds) => onChange({ ...passage, yieldIds })}
      />
    </div>
  );
}

function makeBlankPassage(existingIds: string[]): Passage {
  return {
    id: nextSubId(SUB_PREFIX.passage, existingIds),
    laneIds: [],
    signalIds: [],
    stopSignIds: [],
    yieldIds: [],
    type: 'UNKNOWN_PASSAGE',
  };
}

function addPassageGroup(groups: PassageGroup[]): PassageGroup[] {
  return [
    ...groups,
    {
      id: nextSubId(
        SUB_PREFIX.passageGroup,
        groups.map((g) => g.id),
      ),
      passages: [],
    },
  ];
}

function updatePassageInGroup(groups: PassageGroup[], gid: string, next: Passage): PassageGroup[] {
  return groups.map((g) =>
    g.id === gid ? { ...g, passages: g.passages.map((p) => (p.id === next.id ? next : p)) } : g,
  );
}

function addPassageToGroup(groups: PassageGroup[], gid: string): PassageGroup[] {
  return groups.map((g) =>
    g.id === gid
      ? { ...g, passages: [...g.passages, makeBlankPassage(g.passages.map((p) => p.id))] }
      : g,
  );
}

function removePassageFromGroup(groups: PassageGroup[], gid: string, pid: string): PassageGroup[] {
  return groups.map((g) =>
    g.id === gid ? { ...g, passages: g.passages.filter((p) => p.id !== pid) } : g,
  );
}

interface PassageGroupsSectionProps {
  groups: PassageGroup[];
  available: AvailablePassageRefs;
  onGroupsChange: (groups: PassageGroup[]) => void;
}

function PassageGroupsSection({ groups, available, onGroupsChange }: PassageGroupsSectionProps) {
  const updatePassage = (gid: string, next: Passage) =>
    onGroupsChange(updatePassageInGroup(groups, gid, next));
  const addPassage = (gid: string) => onGroupsChange(addPassageToGroup(groups, gid));
  const removePassage = (gid: string, pid: string) =>
    onGroupsChange(removePassageFromGroup(groups, gid, pid));

  return (
    <Section title="Passage Groups">
      {groups.length === 0 && (
        <div className="text-[10px] text-zinc-600 italic py-1">no groups yet</div>
      )}
      {groups.map((group) => (
        <div key={group.id} className="border border-white/10 rounded p-2 mb-2 bg-zinc-900/40">
          <PassageGroupHeader
            group={group}
            onRemove={() => onGroupsChange(groups.filter((g) => g.id !== group.id))}
          />
          {group.passages.map((p) => (
            <PassageBlock
              key={p.id}
              passage={p}
              available={available}
              onChange={(next) => updatePassage(group.id, next)}
              onRemove={() => removePassage(group.id, p.id)}
            />
          ))}
          <button
            type="button"
            onClick={() => addPassage(group.id)}
            className="text-[10px] text-zinc-400 hover:text-cyan-300 px-2 py-0.5 rounded hover:bg-white/5 w-full text-left"
          >
            + Passage
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onGroupsChange(addPassageGroup(groups))}
        className="text-[11px] text-zinc-300 hover:text-cyan-300 px-2 py-1 rounded hover:bg-white/5 w-full text-left border border-dashed border-white/10"
      >
        + Passage Group
      </button>
    </Section>
  );
}

function PassageGroupHeader({ group, onRemove }: { group: PassageGroup; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[10px] font-mono text-zinc-400 flex-1 truncate" title={group.id}>
        Group {shortId(group.id)}
      </span>
      <span className="text-[10px] text-zinc-600">{group.passages.length}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-[11px] text-zinc-600 hover:text-red-400 px-1"
        title="Delete group"
      >
        ×
      </button>
    </div>
  );
}

export function PNCJunctionForm({ entity }: { entity: PNCJunctionEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const entities = useMapStore((s) => s.entities);
  const available = useAvailablePassageRefs(entities);
  const setGroups = (passageGroups: PassageGroup[]) => {
    updateEntity(entity.id, { ...entity, passageGroups });
  };

  return (
    <form>
      <Section title="Attributes">
        <Value label="ID" value={entity.id} />
        <Value label="Vertices" value={entity.polygon.points.length || '—'} />
        <Value label="Overlaps" value={entity.overlapIds.length || '—'} />
      </Section>
      <PassageGroupsSection
        groups={entity.passageGroups}
        available={available}
        onGroupsChange={setGroups}
      />
    </form>
  );
}
