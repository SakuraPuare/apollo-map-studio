import { useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMapStore } from '@/store/mapStore';
import { Input, Select, Section, Value } from '@/components/ui/form-fields';
import {
  laneSchema, type LaneFormValues,
  laneTypeOptions, laneTurnOptions, laneDirectionOptions, boundaryTypeOptions,
  junctionSchema, type JunctionFormValues, junctionTypeOptions,
  parkingSpaceSchema, type ParkingSpaceFormValues,
  signalSchema, type SignalFormValues, signalTypeOptions,
  stopSignSchema, type StopSignFormValues, stopSignTypeOptions,
} from '@/lib/schemas';
import type {
  LaneEntity, JunctionEntity, ParkingSpaceEntity,
  SignalEntity, StopSignEntity,
} from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

// ─── Lane Form ─────────────────────────────────────────────

function LaneForm({ entity }: { entity: LaneEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);

  const leftType = entity.leftBoundary.boundaryType[0]?.types[0] ?? 'UNKNOWN';
  const rightType = entity.rightBoundary.boundaryType[0]?.types[0] ?? 'UNKNOWN';

  const methods = useForm<LaneFormValues>({
    resolver: zodResolver(laneSchema),
    defaultValues: {
      type: entity.type,
      turn: entity.turn,
      direction: entity.direction,
      speedLimit: entity.speedLimit,
      leftBoundaryType: leftType,
      rightBoundaryType: rightType,
    },
  });

  // Reset form when entity changes
  useEffect(() => {
    methods.reset({
      type: entity.type,
      turn: entity.turn,
      direction: entity.direction,
      speedLimit: entity.speedLimit,
      leftBoundaryType: leftType,
      rightBoundaryType: rightType,
    });
  }, [entity.id, methods]);

  // Auto-save on change
  useEffect(() => {
    const subscription = methods.watch((value) => {
      if (!methods.formState.isValid) return;

      updateEntity(entity.id, {
        ...entity,
        type: value.type!,
        turn: value.turn!,
        direction: value.direction!,
        speedLimit: value.speedLimit!,
        leftBoundary: {
          ...entity.leftBoundary,
          boundaryType: [{ s: 0, types: [value.leftBoundaryType!] }],
        },
        rightBoundary: {
          ...entity.rightBoundary,
          boundaryType: [{ s: 0, types: [value.rightBoundaryType!] }],
        },
      });
    });
    return () => subscription.unsubscribe();
  }, [entity, methods, updateEntity]);

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

  const methods = useForm<JunctionFormValues>({
    resolver: zodResolver(junctionSchema),
    defaultValues: { type: entity.type },
  });

  useEffect(() => {
    methods.reset({ type: entity.type });
  }, [entity.id, methods]);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      if (!methods.formState.isValid) return;
      updateEntity(entity.id, { ...entity, type: value.type! });
    });
    return () => subscription.unsubscribe();
  }, [entity, methods, updateEntity]);

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

  const methods = useForm<ParkingSpaceFormValues>({
    resolver: zodResolver(parkingSpaceSchema),
    defaultValues: { heading: parseFloat((entity.heading * 180 / Math.PI).toFixed(2)) },
  });

  useEffect(() => {
    methods.reset({ heading: parseFloat((entity.heading * 180 / Math.PI).toFixed(2)) });
  }, [entity.id, methods]);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      if (!methods.formState.isValid) return;
      updateEntity(entity.id, { ...entity, heading: (value.heading! * Math.PI) / 180 });
    });
    return () => subscription.unsubscribe();
  }, [entity, methods, updateEntity]);

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

  const methods = useForm<SignalFormValues>({
    resolver: zodResolver(signalSchema),
    defaultValues: { type: entity.type },
  });

  useEffect(() => {
    methods.reset({ type: entity.type });
  }, [entity.id, methods]);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      if (!methods.formState.isValid) return;
      updateEntity(entity.id, { ...entity, type: value.type! });
    });
    return () => subscription.unsubscribe();
  }, [entity, methods, updateEntity]);

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

  const methods = useForm<StopSignFormValues>({
    resolver: zodResolver(stopSignSchema),
    defaultValues: { type: entity.type },
  });

  useEffect(() => {
    methods.reset({ type: entity.type });
  }, [entity.id, methods]);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      if (!methods.formState.isValid) return;
      updateEntity(entity.id, { ...entity, type: value.type! });
    });
    return () => subscription.unsubscribe();
  }, [entity, methods, updateEntity]);

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
