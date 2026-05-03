import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Section, Select, Value } from '@/components/ui/form-fields';
import { junctionSchema, junctionTypeOptions, type JunctionFormValues } from '@/lib/schemas';
import { useMapStore } from '@/store/mapStore';
import type { JunctionEntity } from '@/types/apollo';
import { useEntityFormSync, shouldSkipOptionalEnumWrite } from './formSync';
import { zodResolverZ4 } from './resolver';

const JUNCTION_TYPE_FALLBACK: JunctionFormValues['type'] = 'UNKNOWN';

function formValuesFromJunction(entity: JunctionEntity): JunctionFormValues {
  return { type: entity.type ?? JUNCTION_TYPE_FALLBACK };
}

export function JunctionForm({ entity }: { entity: JunctionEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const methods = useForm<JunctionFormValues>({
    resolver: zodResolverZ4<JunctionFormValues>(junctionSchema),
    mode: 'onChange',
    defaultValues: formValuesFromJunction(entity),
  });
  const entityRef = useEntityFormSync(entity, methods, formValuesFromJunction);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      const liveEntity = entityRef.current;
      if (shouldSkipOptionalEnumWrite(value.type, liveEntity.type, JUNCTION_TYPE_FALLBACK)) return;
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
            options={junctionTypeOptions}
            enumCategory="junctionType"
          />
          <Value label="Overlaps" value={entity.overlapIds.length || '—'} />
        </Section>
      </form>
    </FormProvider>
  );
}
