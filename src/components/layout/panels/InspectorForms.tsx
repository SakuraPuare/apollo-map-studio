import type { ReactElement } from 'react';
import { clsx } from 'clsx';
import { isEntityTypeLocked, useUIStore } from '@/store/uiStore';
import type {
  AreaEntity,
  BarrierGateEntity,
  ClearAreaEntity,
  CrosswalkEntity,
  JunctionEntity,
  LaneEntity,
  OverlapEntity,
  ParkingSpaceEntity,
  PNCJunctionEntity,
  RoadEntity,
  RSUEntity,
  SignalEntity,
  SpeedBumpEntity,
  StopSignEntity,
  YieldSignEntity,
} from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import { DrawingForm } from './InspectorForms/DrawingForm';
import { LaneForm } from './InspectorForms/lane';
import { OverlapForm } from './InspectorForms/overlap';
import { PNCJunctionForm } from './InspectorForms/pncJunction';
import {
  AreaForm,
  BarrierGateForm,
  ClearAreaForm,
  CrosswalkForm,
  JunctionForm,
  ParkingSpaceForm,
  RoadForm,
  RSUForm,
  SignalForm,
  SpeedBumpForm,
  StopSignForm,
  YieldSignForm,
} from './InspectorForms/simpleForms';

export {
  diffLaneFormAgainstEntity,
  laneFormValuesFromEntity,
  shouldPersistLaneForm,
} from './InspectorForms/lane';

type FormRenderer = (entity: MapEntity) => ReactElement;

const FORM_RENDERERS: Partial<Record<MapEntity['entityType'], FormRenderer>> = {
  lane: (entity) => <LaneForm entity={entity as LaneEntity} />,
  junction: (entity) => <JunctionForm entity={entity as JunctionEntity} />,
  parkingSpace: (entity) => <ParkingSpaceForm entity={entity as ParkingSpaceEntity} />,
  signal: (entity) => <SignalForm entity={entity as SignalEntity} />,
  stopSign: (entity) => <StopSignForm entity={entity as StopSignEntity} />,
  road: (entity) => <RoadForm entity={entity as RoadEntity} />,
  pncJunction: (entity) => <PNCJunctionForm entity={entity as PNCJunctionEntity} />,
  overlap: (entity) => <OverlapForm entity={entity as OverlapEntity} />,
  area: (entity) => <AreaForm entity={entity as AreaEntity} />,
  barrierGate: (entity) => <BarrierGateForm entity={entity as BarrierGateEntity} />,
  crosswalk: (entity) => <CrosswalkForm entity={entity as CrosswalkEntity} />,
  speedBump: (entity) => <SpeedBumpForm entity={entity as SpeedBumpEntity} />,
  yieldSign: (entity) => <YieldSignForm entity={entity as YieldSignEntity} />,
  clearArea: (entity) => <ClearAreaForm entity={entity as ClearAreaEntity} />,
  rsu: (entity) => <RSUForm entity={entity as RSUEntity} />,
};

export function EntityForm({ entity }: { entity: MapEntity }) {
  const locked = useUIStore((s) => isEntityTypeLocked(s.layerStates, entity.entityType));
  const renderForm = FORM_RENDERERS[entity.entityType];
  return (
    <fieldset
      disabled={locked}
      aria-disabled={locked}
      className={clsx('m-0 min-w-0 border-0 p-0', locked && 'opacity-60')}
      title={locked ? 'Layer is locked' : undefined}
    >
      {renderForm ? renderForm(entity) : <DrawingForm entity={entity} />}
    </fieldset>
  );
}
