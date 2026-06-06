import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Section, Select, Value } from '@/components/ui/form-fields';
import { regenerateSignalGeometry } from '@/core/geometry/apolloCompile/signalTemplate';
import { getEnumLabel } from '@/lib/enumLabels';
import {
  signalSchema,
  signalTypeOptions,
  signInfoTypeOptions,
  subsignalTypeOptions,
  type SignalFormValues,
} from '@/lib/schemas';
import { useMapStore } from '@/store/mapStore';
import type { SignalEntity, SignInfoType, SubsignalType } from '@/types/apollo';
import { arraysShallowEqual, useEntityFormSync } from './formSync';
import { zodResolverZ4 } from './resolver';

type SignInfoFlag = (typeof signInfoTypeOptions)[number];

const SIGN_INFO_TYPE_SET: ReadonlySet<string> = new Set(signInfoTypeOptions);

function signInfoFlags(entity: SignalEntity): SignInfoFlag[] {
  const result: SignInfoFlag[] = [];
  for (const s of entity.signInfo) {
    if (SIGN_INFO_TYPE_SET.has(s.type)) result.push(s.type as SignInfoFlag);
  }
  return result;
}

function formValuesFromSignal(entity: SignalEntity): SignalFormValues {
  return { type: entity.type, signInfo: signInfoFlags(entity) };
}

export function SignalForm({ entity }: { entity: SignalEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const methods = useForm<SignalFormValues>({
    resolver: zodResolverZ4<SignalFormValues>(signalSchema),
    mode: 'onChange',
    defaultValues: formValuesFromSignal(entity),
  });
  const entityRef = useEntityFormSync(entity, methods, formValuesFromSignal);
  const selectedSignInfo = methods.watch('signInfo') ?? [];

  useEffect(() => {
    const subscription = methods.watch((value) => {
      const liveEntity = entityRef.current;
      if (value.type && value.type !== liveEntity.type) {
        updateEntity(liveEntity.id, regenerateSignalGeometry({ ...liveEntity, type: value.type }));
        return;
      }

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
  }, [entityRef, methods, updateEntity]);

  const toggleSignInfo = (flag: SignInfoFlag, checked: boolean) => {
    methods.setValue('signInfo', toggleFlag(methods.getValues('signInfo') ?? [], flag, checked), {
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
        <SubsignalsSection
          entity={entity}
          onRegenerate={regenerateGeometry}
          onTypeChange={updateSubsignalType}
        />
        <SignInfoSection selected={selectedSignInfo} onToggle={toggleSignInfo} />
      </form>
    </FormProvider>
  );
}

function toggleFlag(flags: SignInfoFlag[], flag: SignInfoFlag, checked: boolean): SignInfoFlag[] {
  if (checked) return flags.includes(flag) ? flags : [...flags, flag];
  return flags.filter((f) => f !== flag);
}

interface SubsignalsSectionProps {
  entity: SignalEntity;
  onRegenerate: () => void;
  onTypeChange: (index: number, type: SubsignalType) => void;
}

function SubsignalsSection({ entity, onRegenerate, onTypeChange }: SubsignalsSectionProps) {
  return (
    <Section title={`Subsignals (${entity.subsignals.length})`}>
      {entity.subsignals.length === 0 ? (
        <div className="text-[11px] text-zinc-500 py-1">
          No bulbs: draw a stop line or click Regenerate below.
        </div>
      ) : (
        entity.subsignals.map((sub, i) => (
          <div key={sub.id || i} className="flex items-center gap-2 py-1">
            <span className="text-[11px] text-zinc-500 w-6">#{i}</span>
            <select
              value={sub.type}
              onChange={(e) => onTypeChange(i, e.target.value as SubsignalType)}
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
        onClick={onRegenerate}
        className="mt-2 w-full text-[11px] text-cyan-300 border border-cyan-700/40 rounded py-1 hover:bg-cyan-900/20 hover:border-cyan-500/60 transition-colors"
      >
        Regenerate from stop line
      </button>
    </Section>
  );
}

function SignInfoSection({
  selected,
  onToggle,
}: {
  selected: SignInfoFlag[];
  onToggle: (flag: SignInfoFlag, checked: boolean) => void;
}) {
  return (
    <Section title="Sign Info">
      {signInfoTypeOptions.map((flag) => (
        <label
          key={flag}
          className="flex items-center gap-2 py-1 cursor-pointer text-[11px] text-zinc-300 hover:text-cyan-300"
        >
          <input
            type="checkbox"
            checked={selected.includes(flag)}
            onChange={(e) => onToggle(flag, e.target.checked)}
            className="accent-cyan-500"
          />
          <span>{getEnumLabel('signInfoType', flag)}</span>
        </label>
      ))}
    </Section>
  );
}
