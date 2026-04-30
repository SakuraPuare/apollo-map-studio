import type {
  AreaEntity,
  BarrierGateEntity,
  ClearAreaEntity,
  CrosswalkEntity,
  JunctionEntity,
  LaneEntity,
  OverlapEntity,
  PNCJunctionEntity,
  ParkingSpaceEntity,
  RoadEntity,
  RSUEntity,
  SignalEntity,
  SpeedBumpEntity,
  StopSignEntity,
  YieldSignEntity,
} from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import {
  entityToRawLane,
  entityToRawRoad,
  rawLaneToEntity,
  rawRoadToEntity,
  type RawLane,
  type RawRoad,
} from './laneRoad';
import { entityToRawOverlap, rawOverlapToEntity, type RawOverlap } from './overlap';
import {
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
  type RawArea,
  type RawBarrierGate,
  type RawClearArea,
  type RawCrosswalk,
  type RawJunction,
  type RawParkingSpace,
  type RawPNCJunction,
  type RawRSU,
  type RawSignal,
  type RawSpeedBump,
  type RawStopSign,
  type RawYieldSign,
} from './simpleEntities';

interface RawApolloMap {
  crosswalk?: RawCrosswalk[];
  junction?: RawJunction[];
  lane?: RawLane[];
  stop_sign?: RawStopSign[];
  signal?: RawSignal[];
  yield?: RawYieldSign[];
  overlap?: RawOverlap[];
  clear_area?: RawClearArea[];
  speed_bump?: RawSpeedBump[];
  road?: RawRoad[];
  parking_space?: RawParkingSpace[];
  pnc_junction?: RawPNCJunction[];
  rsu?: RawRSU[];
  ad_area?: RawArea[];
  barrier_gate?: RawBarrierGate[];
}

type EntityType = MapEntity['entityType'];

function pushIfNotNull<T>(arr: T[], v: T | null) {
  if (v !== null) arr.push(v);
}

/**
 * Bidirectional bridge between Apollo proto fields and MapEntity types.
 * Order here defines emit order in `apolloMapToEntities` — must stay stable
 * (downstream consumers rely on it for deterministic snapshots).
 *
 * Functions are typed against `unknown`/`MapEntity` here because TypeScript
 * cannot keep per-row Raw/Entity generics aligned across a heterogeneous
 * tuple; each row's `fromProto` / `toProto` are pre-narrowed by sibling
 * modules and the runtime dispatch in `entitiesToApolloMap` only feeds each
 * `toProto` entities of the matching `entityType`.
 */
interface BridgeRule {
  /** Proto field name on the raw Apollo map. */
  field: keyof RawApolloMap;
  /** MapEntity discriminator that routes back to this rule on serialize. */
  entityType: EntityType;
  fromProto: (raw: unknown) => MapEntity | null;
  toProto: (entity: MapEntity) => unknown;
}

// Helper to register a typed pair without losing call-site type checking on
// the Raw/Entity functions; the cast happens once here, not at every row.
function rule<RawT, EntityT extends MapEntity>(
  field: keyof RawApolloMap,
  entityType: EntityT['entityType'],
  fromProto: (raw: RawT) => EntityT | null,
  toProto: (entity: EntityT) => unknown,
): BridgeRule {
  return {
    field,
    entityType,
    fromProto: fromProto as (raw: unknown) => MapEntity | null,
    toProto: toProto as (entity: MapEntity) => unknown,
  };
}

const BRIDGES: readonly BridgeRule[] = [
  rule<RawCrosswalk, CrosswalkEntity>(
    'crosswalk',
    'crosswalk',
    rawCrosswalkToEntity,
    entityToRawCrosswalk,
  ),
  rule<RawJunction, JunctionEntity>(
    'junction',
    'junction',
    rawJunctionToEntity,
    entityToRawJunction,
  ),
  rule<RawLane, LaneEntity>('lane', 'lane', rawLaneToEntity, entityToRawLane),
  rule<RawStopSign, StopSignEntity>(
    'stop_sign',
    'stopSign',
    rawStopSignToEntity,
    entityToRawStopSign,
  ),
  rule<RawSignal, SignalEntity>('signal', 'signal', rawSignalToEntity, entityToRawSignal),
  rule<RawYieldSign, YieldSignEntity>(
    'yield',
    'yieldSign',
    rawYieldSignToEntity,
    entityToRawYieldSign,
  ),
  rule<RawOverlap, OverlapEntity>('overlap', 'overlap', rawOverlapToEntity, entityToRawOverlap),
  rule<RawClearArea, ClearAreaEntity>(
    'clear_area',
    'clearArea',
    rawClearAreaToEntity,
    entityToRawClearArea,
  ),
  rule<RawSpeedBump, SpeedBumpEntity>(
    'speed_bump',
    'speedBump',
    rawSpeedBumpToEntity,
    entityToRawSpeedBump,
  ),
  rule<RawRoad, RoadEntity>('road', 'road', rawRoadToEntity, entityToRawRoad),
  rule<RawParkingSpace, ParkingSpaceEntity>(
    'parking_space',
    'parkingSpace',
    rawParkingSpaceToEntity,
    entityToRawParkingSpace,
  ),
  rule<RawPNCJunction, PNCJunctionEntity>(
    'pnc_junction',
    'pncJunction',
    rawPNCJunctionToEntity,
    entityToRawPNCJunction,
  ),
  rule<RawRSU, RSUEntity>('rsu', 'rsu', rawRSUToEntity, entityToRawRSU),
  rule<RawArea, AreaEntity>('ad_area', 'area', rawAreaToEntity, entityToRawArea),
  rule<RawBarrierGate, BarrierGateEntity>(
    'barrier_gate',
    'barrierGate',
    rawBarrierGateToEntity,
    entityToRawBarrierGate,
  ),
];

export function apolloMapToEntities(map: RawApolloMap): MapEntity[] {
  const out: MapEntity[] = [];
  for (const bridge of BRIDGES) {
    const items = (map[bridge.field] ?? []) as unknown[];
    for (const raw of items) {
      pushIfNotNull(out, bridge.fromProto(raw));
    }
  }
  return out;
}

export function entitiesToApolloMap(
  baseMap: Record<string, unknown>,
  entities: MapEntity[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...baseMap };

  // Pre-seed one bucket per bridge so empty entity types still emit `[]`
  // (matches the prior explicit-assignment behaviour).
  const buckets = new Map<EntityType, MapEntity[]>();
  for (const bridge of BRIDGES) {
    buckets.set(bridge.entityType, []);
  }

  for (const e of entities) {
    buckets.get(e.entityType)?.push(e);
  }

  for (const bridge of BRIDGES) {
    const bucket = buckets.get(bridge.entityType) ?? [];
    out[bridge.field] = bucket.map(bridge.toProto);
  }

  return out;
}
