export {
  convertPolygonFromProto,
  convertPolygonToProto,
  curveFromProto,
  curveToProto,
  unwrapId,
  unwrapIdArray,
  wrapId,
  wrapIdArray,
} from './entityBridge/common';
export {
  entityToRawLane,
  entityToRawRoad,
  rawLaneToEntity,
  rawRoadToEntity,
} from './entityBridge/laneRoad';
export {
  APOLLO_MAP_ENTITY_FIELDS,
  apolloMapToEntities,
  entitiesToApolloMap,
  entityToRawApolloElement,
  isApolloMapEntity,
  rawApolloElementToEntity,
} from './entityBridge/map';
export type { ApolloMapEntityField, RawApolloMap } from './entityBridge/map';
export { entityToRawOverlap, rawOverlapToEntity } from './entityBridge/overlap';
export {
  entityToRawArea,
  entityToRawBarrierGate,
  entityToRawClearArea,
  entityToRawCrosswalk,
  entityToRawJunction,
  entityToRawParkingSpace,
  entityToRawPNCJunction,
  entityToRawRSU,
  entityToRawSignal,
  entityToRawSpeedBump,
  entityToRawStopSign,
  entityToRawYieldSign,
  rawAreaToEntity,
  rawBarrierGateToEntity,
  rawClearAreaToEntity,
  rawCrosswalkToEntity,
  rawJunctionToEntity,
  rawParkingSpaceToEntity,
  rawPNCJunctionToEntity,
  rawRSUToEntity,
  rawSignalToEntity,
  rawSpeedBumpToEntity,
  rawStopSignToEntity,
  rawYieldSignToEntity,
} from './entityBridge/simpleEntities';
