import type { LaneEntity } from '@/types/apollo';
import type { LaneFormValues } from '@/lib/schemas';
import {
  LaneInspectorSchema,
  diffFormAgainstEntity,
  formValuesFromEntity,
  shouldPersistForm,
} from '@/types/inspectorSchema';
import { SchemaForm } from '../SchemaForm';

// eslint-disable-next-line react-refresh/only-export-components
export function laneFormValuesFromEntity(entity: LaneEntity): LaneFormValues {
  return formValuesFromEntity(LaneInspectorSchema, entity);
}

// eslint-disable-next-line react-refresh/only-export-components
export function diffLaneFormAgainstEntity(
  current: Partial<LaneFormValues>,
  entity: LaneEntity,
): Array<[keyof LaneFormValues, LaneFormValues[keyof LaneFormValues]]> {
  return diffFormAgainstEntity(LaneInspectorSchema, current, entity);
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldPersistLaneForm(
  formValues: Partial<LaneFormValues>,
  entity: LaneEntity,
): boolean {
  return shouldPersistForm(LaneInspectorSchema, formValues, entity);
}

export function LaneForm({ entity }: { entity: LaneEntity }) {
  return <SchemaForm schema={LaneInspectorSchema} entity={entity} />;
}
