/* eslint-disable react-refresh/only-export-components */
import type {
  JunctionEntity,
  LaneEntity,
  OverlapEntity,
  ParkingSpaceEntity,
  PNCJunctionEntity,
  RoadEntity,
  SignalEntity,
  StopSignEntity,
} from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import { DrawingForm } from './InspectorForms/DrawingForm';
import { LaneForm } from './InspectorForms/lane';
import { OverlapForm } from './InspectorForms/overlap';
import { PNCJunctionForm } from './InspectorForms/pncJunction';
import {
  JunctionForm,
  ParkingSpaceForm,
  RoadForm,
  SignalForm,
  StopSignForm,
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
    default:
      return <DrawingForm entity={entity} />;
  }
}
