/* eslint-disable react-refresh/only-export-components */
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

export function EntityForm({ entity }: { entity: MapEntity }) {
  switch (entity.entityType) {
    case 'lane':
      return <LaneForm entity={entity as LaneEntity} />;
    case 'junction':
      return <JunctionForm entity={entity as JunctionEntity} />;
    case 'parkingSpace':
      return <ParkingSpaceForm entity={entity as ParkingSpaceEntity} />;
    case 'signal':
      return <SignalForm entity={entity as SignalEntity} />;
    case 'stopSign':
      return <StopSignForm entity={entity as StopSignEntity} />;
    case 'road':
      return <RoadForm entity={entity as RoadEntity} />;
    case 'pncJunction':
      return <PNCJunctionForm entity={entity as PNCJunctionEntity} />;
    case 'overlap':
      return <OverlapForm entity={entity as OverlapEntity} />;
    case 'area':
      return <AreaForm entity={entity as AreaEntity} />;
    case 'barrierGate':
      return <BarrierGateForm entity={entity as BarrierGateEntity} />;
    case 'crosswalk':
      return <CrosswalkForm entity={entity as CrosswalkEntity} />;
    case 'speedBump':
      return <SpeedBumpForm entity={entity as SpeedBumpEntity} />;
    case 'yieldSign':
      return <YieldSignForm entity={entity as YieldSignEntity} />;
    case 'clearArea':
      return <ClearAreaForm entity={entity as ClearAreaEntity} />;
    case 'rsu':
      return <RSUForm entity={entity as RSUEntity} />;
    default:
      return <DrawingForm entity={entity} />;
  }
}
