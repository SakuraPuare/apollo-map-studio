import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Input, Section, Select, Value } from '@/components/ui/form-fields';
import { areaSchema, areaTypeOptions, type AreaFormValues } from '@/lib/schemas';
import { useMapStore } from '@/store/mapStore';
import type { AreaEntity } from '@/types/apollo';
import { useEntityFormSync } from './formSync';
import { zodResolverZ4 } from './resolver';

function formValuesFromArea(entity: AreaEntity): AreaFormValues {
  return { type: entity.type, name: entity.name ?? '' };
}

export function AreaForm({ entity }: { entity: AreaEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const methods = useForm<AreaFormValues>({
    resolver: zodResolverZ4<AreaFormValues>(areaSchema),
    mode: 'onChange',
    defaultValues: formValuesFromArea(entity),
  });
  const entityRef = useEntityFormSync(entity, methods, formValuesFromArea);

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
  }, [entityRef, methods, updateEntity]);

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
