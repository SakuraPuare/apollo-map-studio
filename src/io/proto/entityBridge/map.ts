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

function pushIfNotNull<T>(arr: T[], v: T | null) {
  if (v !== null) arr.push(v);
}

export function apolloMapToEntities(map: RawApolloMap): MapEntity[] {
  const out: MapEntity[] = [];
  for (const x of map.crosswalk ?? []) pushIfNotNull(out, rawCrosswalkToEntity(x));
  for (const x of map.junction ?? []) pushIfNotNull(out, rawJunctionToEntity(x));
  for (const x of map.lane ?? []) pushIfNotNull(out, rawLaneToEntity(x));
  for (const x of map.stop_sign ?? []) pushIfNotNull(out, rawStopSignToEntity(x));
  for (const x of map.signal ?? []) pushIfNotNull(out, rawSignalToEntity(x));
  for (const x of map.yield ?? []) pushIfNotNull(out, rawYieldSignToEntity(x));
  for (const x of map.overlap ?? []) pushIfNotNull(out, rawOverlapToEntity(x));
  for (const x of map.clear_area ?? []) pushIfNotNull(out, rawClearAreaToEntity(x));
  for (const x of map.speed_bump ?? []) pushIfNotNull(out, rawSpeedBumpToEntity(x));
  for (const x of map.road ?? []) pushIfNotNull(out, rawRoadToEntity(x));
  for (const x of map.parking_space ?? []) pushIfNotNull(out, rawParkingSpaceToEntity(x));
  for (const x of map.pnc_junction ?? []) pushIfNotNull(out, rawPNCJunctionToEntity(x));
  for (const x of map.rsu ?? []) pushIfNotNull(out, rawRSUToEntity(x));
  for (const x of map.ad_area ?? []) pushIfNotNull(out, rawAreaToEntity(x));
  for (const x of map.barrier_gate ?? []) pushIfNotNull(out, rawBarrierGateToEntity(x));
  return out;
}

export function entitiesToApolloMap(
  baseMap: Record<string, unknown>,
  entities: MapEntity[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...baseMap };

  const buckets: {
    crosswalk: CrosswalkEntity[];
    junction: JunctionEntity[];
    lane: LaneEntity[];
    stop_sign: StopSignEntity[];
    signal: SignalEntity[];
    yield: YieldSignEntity[];
    overlap: OverlapEntity[];
    clear_area: ClearAreaEntity[];
    speed_bump: SpeedBumpEntity[];
    road: RoadEntity[];
    parking_space: ParkingSpaceEntity[];
    pnc_junction: PNCJunctionEntity[];
    rsu: RSUEntity[];
    ad_area: AreaEntity[];
    barrier_gate: BarrierGateEntity[];
  } = {
    crosswalk: [],
    junction: [],
    lane: [],
    stop_sign: [],
    signal: [],
    yield: [],
    overlap: [],
    clear_area: [],
    speed_bump: [],
    road: [],
    parking_space: [],
    pnc_junction: [],
    rsu: [],
    ad_area: [],
    barrier_gate: [],
  };

  for (const e of entities) {
    switch (e.entityType) {
      case 'crosswalk':
        buckets.crosswalk.push(e);
        break;
      case 'junction':
        buckets.junction.push(e);
        break;
      case 'lane':
        buckets.lane.push(e);
        break;
      case 'stopSign':
        buckets.stop_sign.push(e);
        break;
      case 'signal':
        buckets.signal.push(e);
        break;
      case 'yieldSign':
        buckets.yield.push(e);
        break;
      case 'overlap':
        buckets.overlap.push(e);
        break;
      case 'clearArea':
        buckets.clear_area.push(e);
        break;
      case 'speedBump':
        buckets.speed_bump.push(e);
        break;
      case 'road':
        buckets.road.push(e);
        break;
      case 'parkingSpace':
        buckets.parking_space.push(e);
        break;
      case 'pncJunction':
        buckets.pnc_junction.push(e);
        break;
      case 'rsu':
        buckets.rsu.push(e);
        break;
      case 'area':
        buckets.ad_area.push(e);
        break;
      case 'barrierGate':
        buckets.barrier_gate.push(e);
        break;
      default:
        break;
    }
  }

  out.crosswalk = buckets.crosswalk.map(entityToRawCrosswalk);
  out.junction = buckets.junction.map(entityToRawJunction);
  out.lane = buckets.lane.map(entityToRawLane);
  out.stop_sign = buckets.stop_sign.map(entityToRawStopSign);
  out.signal = buckets.signal.map(entityToRawSignal);
  out.yield = buckets.yield.map(entityToRawYieldSign);
  out.overlap = buckets.overlap.map(entityToRawOverlap);
  out.clear_area = buckets.clear_area.map(entityToRawClearArea);
  out.speed_bump = buckets.speed_bump.map(entityToRawSpeedBump);
  out.road = buckets.road.map(entityToRawRoad);
  out.parking_space = buckets.parking_space.map(entityToRawParkingSpace);
  out.pnc_junction = buckets.pnc_junction.map(entityToRawPNCJunction);
  out.rsu = buckets.rsu.map(entityToRawRSU);
  out.ad_area = buckets.ad_area.map(entityToRawArea);
  out.barrier_gate = buckets.barrier_gate.map(entityToRawBarrierGate);

  return out;
}
