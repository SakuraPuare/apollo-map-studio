import { useEffect, useMemo, useRef } from 'react';
import { nanoid } from 'nanoid';
import { useForm, FormProvider, type Resolver, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMapStore } from '@/store/mapStore';
import { getEnumLabel } from '@/lib/enumLabels';

// Zod 4 + @hookform/resolvers@5 overload-resolution shim: runtime is
// version-aware (checks `_zod` vs `_def.typeName`) but TS only sees the
// Zod 3 overload for bare ZodObject inputs. This bridges both.
function zodResolverZ4<T extends FieldValues>(schema: unknown): Resolver<T> {
  return zodResolver(schema as never) as unknown as Resolver<T>;
}
import { Select, Section, Value, Input } from '@/components/ui/form-fields';
import {
  junctionSchema,
  type JunctionFormValues,
  junctionTypeOptions,
  parkingSpaceSchema,
  type ParkingSpaceFormValues,
  signalSchema,
  type SignalFormValues,
  signalTypeOptions,
  stopSignSchema,
  type StopSignFormValues,
  stopSignTypeOptions,
  roadSchema,
  type RoadFormValues,
  roadTypeOptions,
  type LaneFormValues,
} from '@/lib/schemas';
import type {
  LaneEntity,
  JunctionEntity,
  ParkingSpaceEntity,
  SignalEntity,
  StopSignEntity,
  RoadEntity,
  PNCJunctionEntity,
  Passage,
  PassageGroup,
  PassageType,
} from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import {
  LaneInspectorSchema,
  formValuesFromEntity,
  diffFormAgainstEntity,
  shouldPersistForm,
} from '@/types/inspectorSchema';
import { SchemaForm } from './SchemaForm';

/**
 * Lane form-value helpers — preserved as thin wrappers around the
 * schema-driven generic helpers. These three names are part of the
 * public surface (the R1 regression test imports them directly), so
 * keeping them stable means refactor → no test churn.
 *
 * Each wrapper delegates to its schema-generic counterpart bound to
 * `LaneInspectorSchema`. Behavior is identical because the schema's
 * `read` adapters were lifted verbatim from the original LaneForm
 * derivations (left/right width via leftSamples[0]?.width with the
 * same DEFAULT_LANE_HALF_WIDTH fallback; left/right boundary type
 * via boundaryType[0]?.types[0] with the same 'UNKNOWN' fallback).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function laneFormValuesFromEntity(entity: LaneEntity): LaneFormValues {
  return formValuesFromEntity(LaneInspectorSchema, entity);
}

// eslint-disable-next-line react-refresh/only-export-components
export function diffLaneFormAgainstEntity(
  current: Partial<LaneFormValues>,
  entity: LaneEntity,
): Array<[keyof LaneFormValues, LaneFormValues[keyof LaneFormValues]]> {
  return diffFormAgainstEntity(LaneInspectorSchema, current, entity);
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldPersistLaneForm(
  formValues: Partial<LaneFormValues>,
  entity: LaneEntity,
): boolean {
  return shouldPersistForm(LaneInspectorSchema, formValues, entity);
}

// ─── Lane Form ─────────────────────────────────────────────
//
// Schema-driven via SchemaForm + LaneInspectorSchema. The 4 effects
// (id-swap reset, same-id cherry-pick, watch+dedupe, entityRef) live
// inside SchemaForm and are parameterized by the schema's read/write
// adapters. The R1 validation gate (`mode: 'onChange'`) is preserved
// inside SchemaForm; commit 6a83d9d's behavior is unchanged.

function LaneForm({ entity }: { entity: LaneEntity }) {
  return <SchemaForm schema={LaneInspectorSchema} entity={entity} />;
}

// ─── Junction Form ─────────────────────────────────────────

function JunctionForm({ entity }: { entity: JunctionEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const entityRef = useRef(entity);
  entityRef.current = entity;

  const methods = useForm<JunctionFormValues>({
    resolver: zodResolverZ4<JunctionFormValues>(junctionSchema),
    mode: 'onChange',
    defaultValues: { type: entity.type },
  });

  useEffect(() => {
    methods.reset({ type: entity.type });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

  // Sync same-id external updates without clobbering user edits.
  useEffect(() => {
    if (methods.getValues('type') !== entity.type) {
      methods.setValue('type', entity.type, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      const liveEntity = entityRef.current;
      if (value.type === liveEntity.type) return;
      updateEntity(liveEntity.id, { ...liveEntity, type: value.type! });
    });
    return () => subscription.unsubscribe();
  }, [methods, updateEntity]);

  return (
    <FormProvider {...methods}>
      <form>
        <Section title="Attributes">
          <Value label="ID" value={entity.id} />
          <Select
            name="type"
            label="Type"
            options={junctionTypeOptions}
            enumCategory="junctionType"
          />
          <Value label="Overlaps" value={entity.overlapIds.length || '—'} />
        </Section>
      </form>
    </FormProvider>
  );
}

// ─── Parking Space Form ────────────────────────────────────

function ParkingSpaceForm({ entity }: { entity: ParkingSpaceEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const entityRef = useRef(entity);
  entityRef.current = entity;

  const headingFromEntity = (e: ParkingSpaceEntity) =>
    parseFloat(((e.heading * 180) / Math.PI).toFixed(2));

  const methods = useForm<ParkingSpaceFormValues>({
    resolver: zodResolverZ4<ParkingSpaceFormValues>(parkingSpaceSchema),
    mode: 'onChange',
    defaultValues: { heading: headingFromEntity(entity) },
  });

  useEffect(() => {
    methods.reset({ heading: headingFromEntity(entity) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

  useEffect(() => {
    const desired = headingFromEntity(entity);
    if (methods.getValues('heading') !== desired) {
      methods.setValue('heading', desired, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      const liveEntity = entityRef.current;
      if (value.heading == null) return;
      const nextHeadingRad = (value.heading * Math.PI) / 180;
      if (nextHeadingRad === liveEntity.heading) return;
      updateEntity(liveEntity.id, { ...liveEntity, heading: nextHeadingRad });
    });
    return () => subscription.unsubscribe();
  }, [methods, updateEntity]);

  return (
    <FormProvider {...methods}>
      <form>
        <Section title="Attributes">
          <Value label="ID" value={entity.id} />
          <Input name="heading" label="Heading (°)" type="number" min={-180} max={180} step={1} />
          <Value label="Overlaps" value={entity.overlapIds.length || '—'} />
        </Section>
      </form>
    </FormProvider>
  );
}

// ─── Signal Form ───────────────────────────────────────────

function SignalForm({ entity }: { entity: SignalEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const entityRef = useRef(entity);
  entityRef.current = entity;

  const methods = useForm<SignalFormValues>({
    resolver: zodResolverZ4<SignalFormValues>(signalSchema),
    mode: 'onChange',
    defaultValues: { type: entity.type },
  });

  useEffect(() => {
    methods.reset({ type: entity.type });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

  useEffect(() => {
    if (methods.getValues('type') !== entity.type) {
      methods.setValue('type', entity.type, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      const liveEntity = entityRef.current;
      if (value.type === liveEntity.type) return;
      updateEntity(liveEntity.id, { ...liveEntity, type: value.type! });
    });
    return () => subscription.unsubscribe();
  }, [methods, updateEntity]);

  return (
    <FormProvider {...methods}>
      <form>
        <Section title="Attributes">
          <Value label="ID" value={entity.id} />
          <Select name="type" label="Type" options={signalTypeOptions} enumCategory="signalType" />
          <Value label="Subsignals" value={entity.subsignals.length} />
          <Value label="Stop Lines" value={entity.stopLines.length || '—'} />
          <Value label="Sign Info" value={entity.signInfo.length || '—'} />
          <Value label="Overlaps" value={entity.overlapIds.length || '—'} />
        </Section>
      </form>
    </FormProvider>
  );
}

// ─── Stop Sign Form ────────────────────────────────────────

function StopSignForm({ entity }: { entity: StopSignEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const entityRef = useRef(entity);
  entityRef.current = entity;

  const methods = useForm<StopSignFormValues>({
    resolver: zodResolverZ4<StopSignFormValues>(stopSignSchema),
    mode: 'onChange',
    defaultValues: { type: entity.type },
  });

  useEffect(() => {
    methods.reset({ type: entity.type });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

  useEffect(() => {
    if (methods.getValues('type') !== entity.type) {
      methods.setValue('type', entity.type, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      const liveEntity = entityRef.current;
      if (value.type === liveEntity.type) return;
      updateEntity(liveEntity.id, { ...liveEntity, type: value.type! });
    });
    return () => subscription.unsubscribe();
  }, [methods, updateEntity]);

  return (
    <FormProvider {...methods}>
      <form>
        <Section title="Attributes">
          <Value label="ID" value={entity.id} />
          <Select
            name="type"
            label="Type"
            options={stopSignTypeOptions}
            enumCategory="stopSignType"
          />
          <Value label="Stop Lines" value={entity.stopLines.length || '—'} />
          <Value label="Overlaps" value={entity.overlapIds.length || '—'} />
        </Section>
      </form>
    </FormProvider>
  );
}

// ─── Road Form ─────────────────────────────────────────────
//
// Mirrors the Apollo `Road` proto: id + type (editable) + sections
// summary + junction reference. Sections list is read-only here —
// per-lane editing happens through the Lane inspector itself.

function RoadForm({ entity }: { entity: RoadEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const entityRef = useRef(entity);
  entityRef.current = entity;

  const methods = useForm<RoadFormValues>({
    resolver: zodResolverZ4<RoadFormValues>(roadSchema),
    mode: 'onChange',
    defaultValues: { type: entity.type },
  });

  useEffect(() => {
    methods.reset({ type: entity.type });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

  useEffect(() => {
    if (methods.getValues('type') !== entity.type) {
      methods.setValue('type', entity.type, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      const liveEntity = entityRef.current;
      if (value.type === liveEntity.type) return;
      updateEntity(liveEntity.id, { ...liveEntity, type: value.type! });
    });
    return () => subscription.unsubscribe();
  }, [methods, updateEntity]);

  const totalLaneCount = entity.sections.reduce((sum, s) => sum + s.laneIds.length, 0);

  return (
    <FormProvider {...methods}>
      <form>
        <Section title="Attributes">
          <Value label="ID" value={entity.id} />
          <Select name="type" label="Type" options={roadTypeOptions} enumCategory="roadType" />
        </Section>
        <Section title="Sections">
          <Value label="Sections" value={entity.sections.length || '—'} />
          <Value label="Total Lanes" value={totalLaneCount || '—'} />
        </Section>
        <Section title="Topology">
          <Value label="Junction" value={entity.junctionId ?? '—'} />
        </Section>
      </form>
    </FormProvider>
  );
}

// ─── PNC Junction Form ─────────────────────────────────────
//
// PNC (Planning & Control) junctions carry passage groups — structured
// "how to traverse this junction" data the planner consumes. Each group
// holds multiple passages (one per ENTRANCE/EXIT path), and each passage
// references lanes/signals/stop-signs/yield-signs by id.
//
// Form is direct-update (no react-hook-form) because the schema is a
// nested array-of-arrays-of-id-arrays — RHF's strength is flat fields.
// Every mutation goes through `update()` which calls updateEntity once.

const PASSAGE_TYPES: readonly PassageType[] = ['UNKNOWN_PASSAGE', 'ENTRANCE', 'EXIT'];

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
  available: { lane: string[]; signal: string[]; stopSign: string[]; yieldSign: string[] };
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

function makeBlankPassage(): Passage {
  return {
    id: `psg_${nanoid(8)}`,
    laneIds: [],
    signalIds: [],
    stopSignIds: [],
    yieldIds: [],
    type: 'UNKNOWN_PASSAGE',
  };
}

function PNCJunctionForm({ entity }: { entity: PNCJunctionEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const entities = useMapStore((s) => s.entities);

  const available = useMemo(
    () => ({
      lane: collectIdsByType(entities, 'lane'),
      signal: collectIdsByType(entities, 'signal'),
      stopSign: collectIdsByType(entities, 'stopSign'),
      yieldSign: collectIdsByType(entities, 'yieldSign'),
    }),
    [entities],
  );

  const update = (next: PNCJunctionEntity) => updateEntity(entity.id, next);

  const setGroups = (passageGroups: PassageGroup[]) => update({ ...entity, passageGroups });

  const addGroup = () =>
    setGroups([...entity.passageGroups, { id: `pg_${nanoid(8)}`, passages: [] }]);
  const removeGroup = (gid: string) => setGroups(entity.passageGroups.filter((g) => g.id !== gid));

  const updatePassage = (gid: string, next: Passage) =>
    setGroups(
      entity.passageGroups.map((g) =>
        g.id === gid ? { ...g, passages: g.passages.map((p) => (p.id === next.id ? next : p)) } : g,
      ),
    );

  const addPassage = (gid: string) =>
    setGroups(
      entity.passageGroups.map((g) =>
        g.id === gid ? { ...g, passages: [...g.passages, makeBlankPassage()] } : g,
      ),
    );

  const removePassage = (gid: string, pid: string) =>
    setGroups(
      entity.passageGroups.map((g) =>
        g.id === gid ? { ...g, passages: g.passages.filter((p) => p.id !== pid) } : g,
      ),
    );

  return (
    <form>
      <Section title="Attributes">
        <Value label="ID" value={entity.id} />
        <Value label="Vertices" value={entity.polygon.points.length || '—'} />
        <Value label="Overlaps" value={entity.overlapIds.length || '—'} />
      </Section>
      <Section title="Passage Groups">
        {entity.passageGroups.length === 0 && (
          <div className="text-[10px] text-zinc-600 italic py-1">no groups yet</div>
        )}
        {entity.passageGroups.map((group) => (
          <div key={group.id} className="border border-white/10 rounded p-2 mb-2 bg-zinc-900/40">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-mono text-zinc-400 flex-1 truncate"
                title={group.id}
              >
                Group {shortId(group.id)}
              </span>
              <span className="text-[10px] text-zinc-600">{group.passages.length}</span>
              <button
                type="button"
                onClick={() => removeGroup(group.id)}
                className="text-[11px] text-zinc-600 hover:text-red-400 px-1"
                title="Delete group"
              >
                ×
              </button>
            </div>
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
          onClick={addGroup}
          className="text-[11px] text-zinc-300 hover:text-cyan-300 px-2 py-1 rounded hover:bg-white/5 w-full text-left border border-dashed border-white/10"
        >
          + Passage Group
        </button>
      </Section>
    </form>
  );
}

// ─── Generic Drawing Form ──────────────────────────────────
//
// Fallback for entity types that don't have a dedicated form yet
// (crosswalk, parkingLot, speedBump, yieldSign, clearArea,
// barrierGate, area, speedControl, polyline/bezier/arc/rect/...).
// Shows ID + a vertex/anchor count derived from whichever geometry
// shape the entity carries. Returning `null` here would silently
// hide the property panel for ~half of the entity catalog.

function DrawingForm({ entity }: { entity: MapEntity }) {
  const pointCount = (() => {
    if ('points' in entity && Array.isArray((entity as { points: unknown[] }).points)) {
      return (entity as { points: unknown[] }).points.length;
    }
    if ('anchors' in entity && Array.isArray((entity as { anchors: unknown[] }).anchors)) {
      return (entity as { anchors: unknown[] }).anchors.length;
    }
    if ('polygon' in entity && (entity as { polygon: { points: unknown[] } }).polygon?.points) {
      return (entity as { polygon: { points: unknown[] } }).polygon.points.length;
    }
    return '—';
  })();

  return (
    <Section title="Geometry">
      <Value label="ID" value={entity.id} />
      <Value label="Vertices" value={pointCount} />
    </Section>
  );
}

// ─── Form Router ───────────────────────────────────────────

export function EntityForm({ entity }: { entity: MapEntity }) {
  switch (entity.entityType) {
    case 'lane':
      return <LaneForm entity={entity as LaneEntity} />;
    case 'junction':
      return <JunctionForm entity={entity as JunctionEntity} />;
    case 'parkingSpace':
      return <ParkingSpaceForm entity={entity as ParkingSpaceEntity} />;
    case 'signal':
      return <SignalForm entity={entity as SignalEntity} />;
    case 'stopSign':
      return <StopSignForm entity={entity as StopSignEntity} />;
    case 'road':
      return <RoadForm entity={entity as RoadEntity} />;
    case 'pncJunction':
      return <PNCJunctionForm entity={entity as PNCJunctionEntity} />;
    default:
      return <DrawingForm entity={entity} />;
  }
}
