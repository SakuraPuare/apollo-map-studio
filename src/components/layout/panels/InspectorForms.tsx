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
import { Input, Select, Section, Value } from '@/components/ui/form-fields';
import { DEFAULT_LANE_HALF_WIDTH } from '@/config/mapConstants';
import {
  laneSchema,
  type LaneFormValues,
  laneTypeOptions,
  laneTurnOptions,
  laneDirectionOptions,
  boundaryTypeOptions,
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
} from '@/lib/schemas';
import type {
  LaneEntity,
  JunctionEntity,
  ParkingSpaceEntity,
  SignalEntity,
  StopSignEntity,
  LaneSampleAssociation,
} from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

// Apply a uniform width to all lane sample points, preserving existing `s` values.
// If samples are empty, seed with two anchors at s=0 and s=length.
function applySampleWidth(
  samples: LaneSampleAssociation[],
  width: number,
  totalLength: number,
): LaneSampleAssociation[] {
  if (samples.length === 0) {
    return [
      { s: 0, width },
      { s: Math.max(0, totalLength), width },
    ];
  }
  return samples.map((sample) => ({ s: sample.s, width }));
}

/**
 * Derives the canonical form values from a LaneEntity.
 *
 * Pure helper — decoupled from React and react-hook-form so the
 * R1 regression test can exercise the sync contract without a DOM.
 * Exported only for testing (helpers are not React components, so
 * react-refresh fast-refresh does not apply here).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function laneFormValuesFromEntity(entity: LaneEntity): LaneFormValues {
  return {
    type: entity.type,
    turn: entity.turn,
    direction: entity.direction,
    speedLimit: entity.speedLimit,
    leftWidth: entity.leftSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH,
    rightWidth: entity.rightSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH,
    leftBoundaryType: entity.leftBoundary.boundaryType[0]?.types[0] ?? 'UNKNOWN',
    rightBoundaryType: entity.rightBoundary.boundaryType[0]?.types[0] ?? 'UNKNOWN',
  };
}

/**
 * Computes the set of fields whose store-side value has drifted away
 * from the form-side value. Used to cherry-pick which fields to push
 * into the form when the same-id entity receives an external update
 * (undo/redo, canvas drag, multi-user, etc.) — without clobbering
 * fields the user is actively editing.
 *
 * Returns an array of [fieldName, nextValue] pairs. Empty array means
 * the form is already in sync with the entity and no action is needed
 * (this is the guard that breaks the store→reset→watch→updateEntity
 * death loop: if the watch callback just wrote these values into the
 * store, the subsequent re-render will produce an empty diff here).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function diffLaneFormAgainstEntity(
  current: Partial<LaneFormValues>,
  entity: LaneEntity,
): Array<[keyof LaneFormValues, LaneFormValues[keyof LaneFormValues]]> {
  const desired = laneFormValuesFromEntity(entity);
  const diffs: Array<[keyof LaneFormValues, LaneFormValues[keyof LaneFormValues]]> = [];
  (Object.keys(desired) as Array<keyof LaneFormValues>).forEach((key) => {
    if (current[key] !== desired[key]) {
      diffs.push([key, desired[key]]);
    }
  });
  return diffs;
}

/**
 * Decides whether the watch callback should persist the current form
 * values into the store. Returns true only when at least one field has
 * actually changed relative to the live entity — otherwise we skip the
 * updateEntity call, which breaks the reset→watch→updateEntity cycle
 * caused by zustand producing a new entity reference on every set().
 */
// eslint-disable-next-line react-refresh/only-export-components
export function shouldPersistLaneForm(
  formValues: Partial<LaneFormValues>,
  entity: LaneEntity,
): boolean {
  return diffLaneFormAgainstEntity(formValues, entity).length > 0;
}

// ─── Lane Form ─────────────────────────────────────────────

function LaneForm({ entity }: { entity: LaneEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);

  // Always-latest ref so the watch subscription below reads the current
  // entity without having to tear down + re-subscribe on every store
  // update (which also avoided a stale-closure hazard when the same-id
  // entity reference changed but the effect somehow did not re-run).
  const entityRef = useRef(entity);
  entityRef.current = entity;

  const methods = useForm<LaneFormValues>({
    resolver: zodResolverZ4<LaneFormValues>(laneSchema),
    // onChange so formState.isValid reflects the live validation status
    // of every keystroke — the previous default (onSubmit) left isValid
    // stuck at `false`, which silently swallowed every watch callback via
    // the `if (!isValid) return` gate and was the direct cause of the
    // "改 leftWidth/leftType 不实时更新" bug (R1).
    mode: 'onChange',
    defaultValues: laneFormValuesFromEntity(entity),
  });

  // Re-seed the whole form when the user selects a DIFFERENT entity.
  // Limiting this to id changes means mid-edit store updates do not
  // reset the field the user is typing into.
  useEffect(() => {
    methods.reset(laneFormValuesFromEntity(entity));
    // Intentionally only re-seed on entity swap; field-level sync for
    // same-id updates lives in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

  // Cherry-pick sync for same-id entity updates (undo/redo, canvas
  // drag, external programmatic writes). Pushes ONLY the drifted
  // fields into the form via setValue — never calls reset() here, so
  // we do not clobber fields the user has touched. The diff-against-
  // entity guard in `diffLaneFormAgainstEntity` also breaks the
  // store→sync→watch→updateEntity→store death loop: after the watch
  // callback writes the form values into the store, the resulting
  // re-render produces an empty diff and this effect becomes a no-op.
  useEffect(() => {
    const current = methods.getValues();
    const diffs = diffLaneFormAgainstEntity(current, entity);
    if (diffs.length === 0) return;
    for (const [key, value] of diffs) {
      methods.setValue(key, value, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  // Auto-save on change. Subscribes once per lifetime of the form
  // (deps intentionally omit `entity`/derived widths) — the closure
  // reads from `entityRef.current` so it never goes stale. The
  // shouldPersistLaneForm guard short-circuits no-op writes, which
  // is what actually breaks the reset/sync loop.
  useEffect(() => {
    const subscription = methods.watch((value) => {
      const liveEntity = entityRef.current;
      if (!shouldPersistLaneForm(value, liveEntity)) return;

      const nextLeftWidth = value.leftWidth ?? DEFAULT_LANE_HALF_WIDTH;
      const nextRightWidth = value.rightWidth ?? DEFAULT_LANE_HALF_WIDTH;
      const totalLength = liveEntity.length ?? 0;

      updateEntity(liveEntity.id, {
        ...liveEntity,
        type: value.type!,
        turn: value.turn!,
        direction: value.direction!,
        speedLimit: value.speedLimit!,
        leftSamples: applySampleWidth(liveEntity.leftSamples, nextLeftWidth, totalLength),
        rightSamples: applySampleWidth(liveEntity.rightSamples, nextRightWidth, totalLength),
        leftBoundary: {
          ...liveEntity.leftBoundary,
          boundaryType: [{ s: 0, types: [value.leftBoundaryType!] }],
        },
        rightBoundary: {
          ...liveEntity.rightBoundary,
          boundaryType: [{ s: 0, types: [value.rightBoundaryType!] }],
        },
      });
    });
    return () => subscription.unsubscribe();
  }, [methods, updateEntity]);

  return (
    <FormProvider {...methods}>
      <form>
        <Section title="Attributes">
          <Select name="type" label="Type" options={laneTypeOptions} />
          <Select name="turn" label="Turn" options={laneTurnOptions} />
          <Select name="direction" label="Direction" options={laneDirectionOptions} />
          <Input name="speedLimit" label="Speed (m/s)" type="number" min={0} max={50} step={0.5} />
        </Section>

        <Section title="Boundaries">
          <Input name="leftWidth" label="左宽度 (m)" type="number" min={0.5} max={10} step={0.1} />
          <Input name="rightWidth" label="右宽度 (m)" type="number" min={0.5} max={10} step={0.1} />
          <Select name="leftBoundaryType" label="Left" options={boundaryTypeOptions} />
          <Select name="rightBoundaryType" label="Right" options={boundaryTypeOptions} />
          <Value label="Length" value={`${entity.length.toFixed(2)} m`} />
        </Section>

        <Section title="Topology">
          <Value label="Predecessors" value={entity.predecessorIds.length || '—'} />
          <Value label="Successors" value={entity.successorIds.length || '—'} />
          <Value label="Junction" value={entity.junctionId ?? '—'} />
        </Section>
      </form>
    </FormProvider>
  );
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
          <Select name="type" label="Type" options={junctionTypeOptions} />
          <Value label="Vertices" value={entity.polygon.points.length} />
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
          <Input name="heading" label="Heading (°)" type="number" min={-180} max={180} step={1} />
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
          <Select name="type" label="Type" options={signalTypeOptions} />
          <Value label="Subsignals" value={entity.subsignals.length} />
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
          <Select name="type" label="Type" options={stopSignTypeOptions} />
        </Section>
      </form>
    </FormProvider>
  );
}

// ─── Generic Drawing Form ──────────────────────────────────

function DrawingForm({ entity }: { entity: MapEntity }) {
  const pointCount = (() => {
    if ('points' in entity) return (entity as { points: unknown[] }).points.length;
    if ('anchors' in entity) return (entity as { anchors: unknown[] }).anchors.length;
    return '—';
  })();

  return (
    <Section title="Geometry">
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
    default:
      return <DrawingForm entity={entity} />;
  }
}
