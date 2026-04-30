import { useEffect, useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Input, Section, Select, Value } from '@/components/ui/form-fields';
import {
  junctionSchema,
  junctionTypeOptions,
  parkingSpaceSchema,
  roadSchema,
  roadTypeOptions,
  signalSchema,
  signalTypeOptions,
  stopSignSchema,
  stopSignTypeOptions,
  type JunctionFormValues,
  type ParkingSpaceFormValues,
  type RoadFormValues,
  type SignalFormValues,
  type StopSignFormValues,
} from '@/lib/schemas';
import { useMapStore } from '@/store/mapStore';
import type {
  JunctionEntity,
  ParkingSpaceEntity,
  RoadEntity,
  SignalEntity,
  StopSignEntity,
} from '@/types/apollo';
import { zodResolverZ4 } from './resolver';

export function JunctionForm({ entity }: { entity: JunctionEntity }) {
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

export function ParkingSpaceForm({ entity }: { entity: ParkingSpaceEntity }) {
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

export function SignalForm({ entity }: { entity: SignalEntity }) {
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

export function StopSignForm({ entity }: { entity: StopSignEntity }) {
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

export function RoadForm({ entity }: { entity: RoadEntity }) {
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
