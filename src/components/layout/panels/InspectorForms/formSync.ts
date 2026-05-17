import { useEffect, useRef } from 'react';
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form';

const SILENT_SYNC_OPTIONS = {
  shouldDirty: false,
  shouldTouch: false,
  shouldValidate: false,
} as const;

function useLatestEntity<TEntity>(entity: TEntity) {
  const entityRef = useRef(entity);
  entityRef.current = entity;
  return entityRef;
}

export function useEntityFormSync<TEntity extends { id: string }, TFormValues extends FieldValues>(
  entity: TEntity,
  methods: UseFormReturn<TFormValues>,
  valuesFromEntity: (entity: TEntity) => TFormValues,
) {
  const entityRef = useLatestEntity(entity);
  const valuesFromEntityRef = useRef(valuesFromEntity);
  valuesFromEntityRef.current = valuesFromEntity;

  useEffect(() => {
    methods.reset(valuesFromEntityRef.current(entityRef.current));
    // Reset is intentionally keyed only by identity swaps. Same-id store drift
    // is merged field-by-field below so a canvas update does not clobber focus.
  }, [entity.id, entityRef, methods]);

  useEffect(() => {
    syncFormValues(methods, valuesFromEntityRef.current(entity));
    // The current entity object is the drift signal; methods and mapper are stable
    // for each mounted form instance.
  }, [entity, methods]);

  return entityRef;
}

function syncFormValues<TFormValues extends FieldValues>(
  methods: UseFormReturn<TFormValues>,
  desired: TFormValues,
): void {
  for (const [rawName, nextValue] of Object.entries(desired)) {
    const name = rawName as Path<TFormValues>;
    if (Object.is(methods.getValues(name), nextValue)) continue;
    methods.setValue(
      name,
      nextValue as PathValue<TFormValues, Path<TFormValues>>,
      SILENT_SYNC_OPTIONS,
    );
  }
}

export function shouldSkipOptionalEnumWrite<T extends string>(
  next: T | undefined,
  current: T | undefined,
  fallback: T,
): boolean {
  return next === undefined || next === current || (current === undefined && next === fallback);
}

export function arraysShallowEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
