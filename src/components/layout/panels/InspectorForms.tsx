import { useEffect, useRef } from 'react';
import { useForm, FormProvider, type Resolver, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMapStore } from '@/store/mapStore';

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
    default:
      return <DrawingForm entity={entity} />;
  }
}
