import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Input, Section, Value } from '@/components/ui/form-fields';
import { parkingSpaceSchema, type ParkingSpaceFormValues } from '@/lib/schemas';
import { useMapStore } from '@/store/mapStore';
import type { ParkingSpaceEntity } from '@/types/apollo';
import { useEntityFormSync } from './formSync';
import { zodResolverZ4 } from './resolver';

export function headingDegrees(entity: ParkingSpaceEntity): number {
  return parseFloat(((entity.heading * 180) / Math.PI).toFixed(2));
}

export function parkingSpaceFormValuesFromEntity(
  entity: ParkingSpaceEntity,
): ParkingSpaceFormValues {
  return { heading: headingDegrees(entity) };
}

export function applyParkingSpaceFormValuesToEntity(
  entity: ParkingSpaceEntity,
  value: Partial<ParkingSpaceFormValues>,
): ParkingSpaceEntity | null {
  if (value.heading == null) return null;
  const nextHeadingRad = (value.heading * Math.PI) / 180;
  if (nextHeadingRad === entity.heading) return null;
  return { ...entity, heading: nextHeadingRad };
}

export function ParkingSpaceForm({ entity }: { entity: ParkingSpaceEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const methods = useForm<ParkingSpaceFormValues>({
    resolver: zodResolverZ4<ParkingSpaceFormValues>(parkingSpaceSchema),
    mode: 'onChange',
    defaultValues: parkingSpaceFormValuesFromEntity(entity),
  });
  const entityRef = useEntityFormSync(entity, methods, parkingSpaceFormValuesFromEntity);

  useEffect(() => {
    const subscription = methods.watch((value) => {
      const liveEntity = entityRef.current;
      const next = applyParkingSpaceFormValuesToEntity(liveEntity, value);
      if (next) updateEntity(liveEntity.id, next);
    });
    return () => subscription.unsubscribe();
  }, [entityRef, methods, updateEntity]);

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
