import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Section, Select, Value } from '@/components/ui/form-fields';
import { roadSchema, roadTypeOptions, type RoadFormValues } from '@/lib/schemas';
import { useMapStore } from '@/store/mapStore';
import type { RoadEntity } from '@/types/apollo';
import { useEntityFormSync, shouldSkipOptionalEnumWrite } from './formSync';
import { zodResolverZ4 } from './resolver';

const ROAD_TYPE_FALLBACK: RoadFormValues['type'] = 'UNKNOWN_ROAD';

export function roadFormValuesFromEntity(entity: RoadEntity): RoadFormValues {
  return { type: entity.type ?? ROAD_TYPE_FALLBACK };
}

export function applyRoadFormValuesToEntity(
  entity: RoadEntity,
  value: Partial<RoadFormValues>,
): RoadEntity | null {
  if (shouldSkipOptionalEnumWrite(value.type, entity.type, ROAD_TYPE_FALLBACK)) return null;
  return { ...entity, type: value.type };
}

export function RoadForm({ entity }: { entity: RoadEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const methods = useForm<RoadFormValues>({
    resolver: zodResolverZ4<RoadFormValues>(roadSchema),
    mode: 'onChange',
    defaultValues: roadFormValuesFromEntity(entity),
  });
  const entityRef = useEntityFormSync(entity, methods, roadFormValuesFromEntity);
  const totalLaneCount = entity.sections.reduce((sum, s) => sum + s.laneIds.length, 0);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      const liveEntity = entityRef.current;
      const next = applyRoadFormValuesToEntity(liveEntity, value);
      if (next) updateEntity(liveEntity.id, next);
    });
    return () => subscription.unsubscribe();
  }, [entityRef, methods, updateEntity]);

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
