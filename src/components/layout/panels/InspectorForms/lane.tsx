import type { LaneEntity } from '@/types/apollo';
import type { LaneFormValues } from '@/lib/schemas';
import {
  LaneInspectorSchema,
  diffFormAgainstEntity,
  formValuesFromEntity,
  shouldPersistForm,
} from '@/types/inspectorSchema';
import { SchemaForm } from '../SchemaForm';

export function laneFormValuesFromEntity(entity: LaneEntity): LaneFormValues {
  return formValuesFromEntity(LaneInspectorSchema, entity);
}

export function diffLaneFormAgainstEntity(
  current: Partial<LaneFormValues>,
  entity: LaneEntity,
): Array<[keyof LaneFormValues, LaneFormValues[keyof LaneFormValues]]> {
  return diffFormAgainstEntity(LaneInspectorSchema, current, entity);
}

export function shouldPersistLaneForm(
  formValues: Partial<LaneFormValues>,
  entity: LaneEntity,
): boolean {
  return shouldPersistForm(LaneInspectorSchema, formValues, entity);
}

export function LaneForm({ entity }: { entity: LaneEntity }) {
  return <SchemaForm schema={LaneInspectorSchema} entity={entity} />;
}
