import { useEffect, useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Input, Section, Select, Value } from '@/components/ui/form-fields';
import { regenerateSignalGeometry } from '@/core/geometry/apolloCompile/signalTemplate';
import { getEnumLabel } from '@/lib/enumLabels';
import {
  areaSchema,
  areaTypeOptions,
  barrierGateSchema,
  barrierGateTypeOptions,
  junctionSchema,
  junctionTypeOptions,
  parkingSpaceSchema,
  roadSchema,
  roadTypeOptions,
  signalSchema,
  signalTypeOptions,
  signInfoTypeOptions,
  subsignalTypeOptions,
  stopSignSchema,
  stopSignTypeOptions,
  type AreaFormValues,
  type BarrierGateFormValues,
  type JunctionFormValues,
  type ParkingSpaceFormValues,
  type RoadFormValues,
  type SignalFormValues,
  type StopSignFormValues,
} from '@/lib/schemas';
import { useMapStore } from '@/store/mapStore';
import type {
  AreaEntity,
  BarrierGateEntity,
  JunctionEntity,
  ParkingSpaceEntity,
  RoadEntity,
  SignalEntity,
  SignInfoType,
  StopSignEntity,
  SubsignalType,
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

/** Allowed positive sign-info flags (excludes Apollo's `None` sentinel —
 *  absence of an entry conveys "none" in this UI). */
type SignInfoFlag = (typeof signInfoTypeOptions)[number];

function arraysShallowEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function SignalForm({ entity }: { entity: SignalEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const entityRef = useRef(entity);
  entityRef.current = entity;

  const initialSignInfo = entity.signInfo
    .map((s) => s.type)
    .filter((t): t is SignInfoFlag => (signInfoTypeOptions as readonly string[]).includes(t));

  const methods = useForm<SignalFormValues>({
    resolver: zodResolverZ4<SignalFormValues>(signalSchema),
    mode: 'onChange',
    defaultValues: { type: entity.type, signInfo: initialSignInfo },
  });

  useEffect(() => {
    const flags = entity.signInfo
      .map((s) => s.type)
      .filter((t): t is SignInfoFlag => (signInfoTypeOptions as readonly string[]).includes(t));
    methods.reset({ type: entity.type, signInfo: flags });
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
    const currentFlags = methods.getValues('signInfo') ?? [];
    const entityFlags = entity.signInfo
      .map((s) => s.type)
      .filter((t): t is SignInfoFlag => (signInfoTypeOptions as readonly string[]).includes(t));
    if (!arraysShallowEqual(currentFlags, entityFlags)) {
      methods.setValue('signInfo', entityFlags, {
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

      // Type change → also regenerate boundary + subsignals.
      if (value.type && value.type !== liveEntity.type) {
        const next = { ...liveEntity, type: value.type };
        const regenerated = regenerateSignalGeometry(next);
        updateEntity(liveEntity.id, regenerated);
        return;
      }

      // signInfo change → propagate as SignInfo[].
      const nextFlags = (value.signInfo ?? []).filter(
        (t): t is SignInfoFlag => typeof t === 'string',
      );
      const liveFlags = liveEntity.signInfo.map((s) => s.type);
      if (!arraysShallowEqual(nextFlags, liveFlags)) {
        updateEntity(liveEntity.id, {
          ...liveEntity,
          signInfo: nextFlags.map((t) => ({ type: t as SignInfoType })),
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [methods, updateEntity]);

  const selectedSignInfo = methods.watch('signInfo') ?? [];
  const toggleSignInfo = (flag: SignInfoFlag, checked: boolean) => {
    const current = methods.getValues('signInfo') ?? [];
    const next = checked
      ? current.includes(flag)
        ? current
        : [...current, flag]
      : current.filter((f) => f !== flag);
    methods.setValue('signInfo', next, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const updateSubsignalType = (index: number, type: SubsignalType) => {
    const live = entityRef.current;
    const next = live.subsignals.map((s, i) => (i === index ? { ...s, type } : s));
    updateEntity(live.id, { ...live, subsignals: next });
  };

  const regenerateGeometry = () => {
    const live = entityRef.current;
    const regenerated = regenerateSignalGeometry(live);
    if (regenerated !== live) updateEntity(live.id, regenerated);
  };

  return (
    <FormProvider {...methods}>
      <form>
        <Section title="Attributes">
          <Value label="ID" value={entity.id} />
          <Select name="type" label="Type" options={signalTypeOptions} enumCategory="signalType" />
          <Value label="Stop Lines" value={entity.stopLines.length || '—'} />
          <Value label="Overlaps" value={entity.overlapIds.length || '—'} />
        </Section>
        <Section title={`Subsignals (${entity.subsignals.length})`}>
          {entity.subsignals.length === 0 ? (
            <div className="text-[11px] text-zinc-500 py-1">
              No bulbs — draw a stop line or click Regenerate below.
            </div>
          ) : (
            entity.subsignals.map((sub, i) => (
              <div key={sub.id || i} className="flex items-center gap-2 py-1">
                <span className="text-[11px] text-zinc-500 w-6">#{i}</span>
                <select
                  value={sub.type}
                  onChange={(e) => updateSubsignalType(i, e.target.value as SubsignalType)}
                  className="flex-1 bg-zinc-800 text-zinc-200 text-[11px] px-1.5 py-0.5 rounded border border-zinc-700 hover:border-cyan-700 focus:border-cyan-500 focus:outline-none"
                >
                  {subsignalTypeOptions.map((t) => (
                    <option key={t} value={t}>
                      {getEnumLabel('subsignalType', t)}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-zinc-500 tabular-nums w-14 text-right">
                  z={sub.location?.z?.toFixed(2) ?? '—'}
                </span>
              </div>
            ))
          )}
          <button
            type="button"
            onClick={regenerateGeometry}
            className="mt-2 w-full text-[11px] text-cyan-300 border border-cyan-700/40 rounded py-1 hover:bg-cyan-900/20 hover:border-cyan-500/60 transition-colors"
          >
            Regenerate from stop line
          </button>
        </Section>
        <Section title="Sign Info">
          {signInfoTypeOptions.map((flag) => {
            const checked = selectedSignInfo.includes(flag);
            return (
              <label
                key={flag}
                className="flex items-center gap-2 py-1 cursor-pointer text-[11px] text-zinc-300 hover:text-cyan-300"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleSignInfo(flag, e.target.checked)}
                  className="accent-cyan-500"
                />
                <span>{getEnumLabel('signInfoType', flag)}</span>
              </label>
            );
          })}
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

export function AreaForm({ entity }: { entity: AreaEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const entityRef = useRef(entity);
  entityRef.current = entity;

  const methods = useForm<AreaFormValues>({
    resolver: zodResolverZ4<AreaFormValues>(areaSchema),
    mode: 'onChange',
    defaultValues: { type: entity.type, name: entity.name ?? '' },
  });

  useEffect(() => {
    methods.reset({ type: entity.type, name: entity.name ?? '' });
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
    const desiredName = entity.name ?? '';
    if ((methods.getValues('name') ?? '') !== desiredName) {
      methods.setValue('name', desiredName, {
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
      const nextType = value.type;
      const rawName = (value.name ?? '').trim();
      const nextName = rawName.length > 0 ? rawName : undefined;
      const typeChanged = nextType !== undefined && nextType !== liveEntity.type;
      const nameChanged = nextName !== liveEntity.name;
      if (!typeChanged && !nameChanged) return;
      updateEntity(liveEntity.id, {
        ...liveEntity,
        type: typeChanged ? (nextType as AreaEntity['type']) : liveEntity.type,
        name: nextName,
      });
    });
    return () => subscription.unsubscribe();
  }, [methods, updateEntity]);

  return (
    <FormProvider {...methods}>
      <form>
        <Section title="Attributes">
          <Value label="ID" value={entity.id} />
          <Select name="type" label="Type" options={areaTypeOptions} enumCategory="areaType" />
          <Input name="name" label="Name" />
          <Value label="Overlaps" value={entity.overlapIds.length || '—'} />
        </Section>
      </form>
    </FormProvider>
  );
}

export function BarrierGateForm({ entity }: { entity: BarrierGateEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const entityRef = useRef(entity);
  entityRef.current = entity;

  const methods = useForm<BarrierGateFormValues>({
    resolver: zodResolverZ4<BarrierGateFormValues>(barrierGateSchema),
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
            options={barrierGateTypeOptions}
            enumCategory="barrierGateType"
          />
          <Value label="Stop Lines" value={entity.stopLines.length || '—'} />
          <Value label="Overlaps" value={entity.overlapIds.length || '—'} />
        </Section>
      </form>
    </FormProvider>
  );
}
