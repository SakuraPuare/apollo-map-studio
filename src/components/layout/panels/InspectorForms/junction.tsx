import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Section, Select, Value } from '@/components/ui/form-fields';
import { junctionSchema, junctionTypeOptions, type JunctionFormValues } from '@/lib/schemas';
import { useMapStore } from '@/store/mapStore';
import type { JunctionEntity } from '@/types/apollo';
import { useEntityFormSync, shouldSkipOptionalEnumWrite } from './formSync';
import { zodResolverZ4 } from './resolver';

const JUNCTION_TYPE_FALLBACK: JunctionFormValues['type'] = 'UNKNOWN';

export function junctionFormValuesFromEntity(entity: JunctionEntity): JunctionFormValues {
  return { type: entity.type ?? JUNCTION_TYPE_FALLBACK };
}

export function applyJunctionFormValuesToEntity(
  entity: JunctionEntity,
  value: Partial<JunctionFormValues>,
): JunctionEntity | null {
  if (shouldSkipOptionalEnumWrite(value.type, entity.type, JUNCTION_TYPE_FALLBACK)) return null;
  return { ...entity, type: value.type };
}

export function JunctionForm({ entity }: { entity: JunctionEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const methods = useForm<JunctionFormValues>({
    resolver: zodResolverZ4<JunctionFormValues>(junctionSchema),
    mode: 'onChange',
    defaultValues: junctionFormValuesFromEntity(entity),
  });
  const entityRef = useEntityFormSync(entity, methods, junctionFormValuesFromEntity);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      const liveEntity = entityRef.current;
      const next = applyJunctionFormValuesToEntity(liveEntity, value);
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
            options={junctionTypeOptions}
            enumCategory="junctionType"
          />
          <Value label="Overlaps" value={entity.overlapIds.length || '—'} />
        </Section>
      </form>
    </FormProvider>
  );
}
