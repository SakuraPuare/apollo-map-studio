import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Section, Select, Value } from '@/components/ui/form-fields';
import { stopSignSchema, stopSignTypeOptions, type StopSignFormValues } from '@/lib/schemas';
import { useMapStore } from '@/store/mapStore';
import type { StopSignEntity } from '@/types/apollo';
import { useEntityFormSync, shouldSkipOptionalEnumWrite } from './formSync';
import { zodResolverZ4 } from './resolver';

const STOP_SIGN_TYPE_FALLBACK: StopSignFormValues['type'] = 'UNKNOWN_STOP_SIGN';

function formValuesFromStopSign(entity: StopSignEntity): StopSignFormValues {
  return { type: entity.type ?? STOP_SIGN_TYPE_FALLBACK };
}

export function StopSignForm({ entity }: { entity: StopSignEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const methods = useForm<StopSignFormValues>({
    resolver: zodResolverZ4<StopSignFormValues>(stopSignSchema),
    mode: 'onChange',
    defaultValues: formValuesFromStopSign(entity),
  });
  const entityRef = useEntityFormSync(entity, methods, formValuesFromStopSign);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      const liveEntity = entityRef.current;
      if (shouldSkipOptionalEnumWrite(value.type, liveEntity.type, STOP_SIGN_TYPE_FALLBACK)) {
        return;
      }
      updateEntity(liveEntity.id, { ...liveEntity, type: value.type });
    });
    return () => subscription.unsubscribe();
  }, [entityRef, methods, updateEntity]);

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
