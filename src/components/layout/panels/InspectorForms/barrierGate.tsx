import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Section, Select, Value } from '@/components/ui/form-fields';
import {
  barrierGateSchema,
  barrierGateTypeOptions,
  type BarrierGateFormValues,
} from '@/lib/schemas';
import { useMapStore } from '@/store/mapStore';
import type { BarrierGateEntity } from '@/types/apollo';
import { useEntityFormSync } from './formSync';
import { zodResolverZ4 } from './resolver';

export function barrierGateFormValuesFromEntity(entity: BarrierGateEntity): BarrierGateFormValues {
  return { type: entity.type };
}

export function applyBarrierGateFormValuesToEntity(
  entity: BarrierGateEntity,
  value: Partial<BarrierGateFormValues>,
): BarrierGateEntity | null {
  if (!value.type || value.type === entity.type) return null;
  return { ...entity, type: value.type };
}

export function BarrierGateForm({ entity }: { entity: BarrierGateEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const methods = useForm<BarrierGateFormValues>({
    resolver: zodResolverZ4<BarrierGateFormValues>(barrierGateSchema),
    mode: 'onChange',
    defaultValues: barrierGateFormValuesFromEntity(entity),
  });
  const entityRef = useEntityFormSync(entity, methods, barrierGateFormValuesFromEntity);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      const liveEntity = entityRef.current;
      const next = applyBarrierGateFormValuesToEntity(liveEntity, value);
      if (next) updateEntity(liveEntity.id, next);
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
