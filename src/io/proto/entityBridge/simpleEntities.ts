import type {
  AreaEntity,
  BarrierGateEntity,
  ClearAreaEntity,
  CrosswalkEntity,
  JunctionEntity,
  PNCJunctionEntity,
  ParkingSpaceEntity,
  Passage,
  PassageGroup,
  RSUEntity,
  SignInfo,
  SignalEntity,
  SpeedBumpEntity,
  StopSignEntity,
  Subsignal,
  YieldSignEntity,
} from '@/types/apollo';
import {
  convertPolygonFromProto,
  convertPolygonToProto,
  curveArrayFromProto,
  curveArrayToProto,
  pointFromProto,
  pointToProto,
  unwrapId,
  unwrapIdArray,
  wrapId,
  wrapIdArray,
  type RawCurve,
  type RawId,
  type RawPoint,
  type RawPolygon,
} from './common';
import {
  AREA_TYPE,
  AREA_TYPE_INV,
  BARRIER_GATE_TYPE,
  BARRIER_GATE_TYPE_INV,
  JUNCTION_TYPE,
  JUNCTION_TYPE_INV,
  PASSAGE_TYPE,
  PASSAGE_TYPE_INV,
  SIGNAL_TYPE,
  SIGNAL_TYPE_INV,
  SIGN_INFO_TYPE,
  SIGN_INFO_TYPE_INV,
  STOP_SIGN_TYPE,
  STOP_SIGN_TYPE_INV,
  SUBSIGNAL_TYPE,
  SUBSIGNAL_TYPE_INV,
  enumFromProto,
  enumToProto,
} from './enums';

export interface RawCrosswalk {
  id?: RawId;
  polygon?: RawPolygon;
  overlap_id?: RawId[];
}

export function rawCrosswalkToEntity(raw: RawCrosswalk): CrosswalkEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  return {
    id,
    entityType: 'crosswalk',
    polygon: convertPolygonFromProto(raw.polygon),
    overlapIds: unwrapIdArray(raw.overlap_id),
  };
}

export function entityToRawCrosswalk(e: CrosswalkEntity): RawCrosswalk {
  return {
    id: wrapId(e.id),
    polygon: convertPolygonToProto(e.polygon),
    overlap_id: wrapIdArray(e.overlapIds),
  };
}

export interface RawJunction {
  id?: RawId;
  polygon?: RawPolygon;
  overlap_id?: RawId[];
  type?: number;
}

export function rawJunctionToEntity(raw: RawJunction): JunctionEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  return {
    id,
    entityType: 'junction',
    polygon: convertPolygonFromProto(raw.polygon),
    type: enumFromProto(JUNCTION_TYPE, raw.type, 'UNKNOWN'),
    overlapIds: unwrapIdArray(raw.overlap_id),
  };
}

export function entityToRawJunction(e: JunctionEntity): RawJunction {
  return {
    id: wrapId(e.id),
    polygon: convertPolygonToProto(e.polygon),
    type: enumToProto(JUNCTION_TYPE_INV, e.type),
    overlap_id: wrapIdArray(e.overlapIds),
  };
}

export interface RawClearArea {
  id?: RawId;
  polygon?: RawPolygon;
  overlap_id?: RawId[];
}

export function rawClearAreaToEntity(raw: RawClearArea): ClearAreaEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  return {
    id,
    entityType: 'clearArea',
    polygon: convertPolygonFromProto(raw.polygon),
    overlapIds: unwrapIdArray(raw.overlap_id),
  };
}

export function entityToRawClearArea(e: ClearAreaEntity): RawClearArea {
  return {
    id: wrapId(e.id),
    polygon: convertPolygonToProto(e.polygon),
    overlap_id: wrapIdArray(e.overlapIds),
  };
}

export interface RawParkingSpace {
  id?: RawId;
  polygon?: RawPolygon;
  overlap_id?: RawId[];
  heading?: number;
}

export function rawParkingSpaceToEntity(raw: RawParkingSpace): ParkingSpaceEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  return {
    id,
    entityType: 'parkingSpace',
    polygon: convertPolygonFromProto(raw.polygon),
    heading: raw.heading ?? 0,
    overlapIds: unwrapIdArray(raw.overlap_id),
  };
}

export function entityToRawParkingSpace(e: ParkingSpaceEntity): RawParkingSpace {
  return {
    id: wrapId(e.id),
    polygon: convertPolygonToProto(e.polygon),
    heading: e.heading,
    overlap_id: wrapIdArray(e.overlapIds),
  };
}

export interface RawStopSign {
  id?: RawId;
  stop_line?: RawCurve[];
  overlap_id?: RawId[];
  type?: number;
}

export function rawStopSignToEntity(raw: RawStopSign): StopSignEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  return {
    id,
    entityType: 'stopSign',
    stopLines: curveArrayFromProto(raw.stop_line),
    type: enumFromProto(STOP_SIGN_TYPE, raw.type, 'UNKNOWN_STOP_SIGN'),
    overlapIds: unwrapIdArray(raw.overlap_id),
  };
}

export function entityToRawStopSign(e: StopSignEntity): RawStopSign {
  return {
    id: wrapId(e.id),
    stop_line: curveArrayToProto(e.stopLines),
    type: enumToProto(STOP_SIGN_TYPE_INV, e.type),
    overlap_id: wrapIdArray(e.overlapIds),
  };
}

export interface RawYieldSign {
  id?: RawId;
  stop_line?: RawCurve[];
  overlap_id?: RawId[];
}

export function rawYieldSignToEntity(raw: RawYieldSign): YieldSignEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  return {
    id,
    entityType: 'yieldSign',
    stopLines: curveArrayFromProto(raw.stop_line),
    overlapIds: unwrapIdArray(raw.overlap_id),
  };
}

export function entityToRawYieldSign(e: YieldSignEntity): RawYieldSign {
  return {
    id: wrapId(e.id),
    stop_line: curveArrayToProto(e.stopLines),
    overlap_id: wrapIdArray(e.overlapIds),
  };
}

export interface RawSpeedBump {
  id?: RawId;
  overlap_id?: RawId[];
  position?: RawCurve[];
}

export function rawSpeedBumpToEntity(raw: RawSpeedBump): SpeedBumpEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  return {
    id,
    entityType: 'speedBump',
    position: curveArrayFromProto(raw.position),
    overlapIds: unwrapIdArray(raw.overlap_id),
  };
}

export function entityToRawSpeedBump(e: SpeedBumpEntity): RawSpeedBump {
  return {
    id: wrapId(e.id),
    position: curveArrayToProto(e.position),
    overlap_id: wrapIdArray(e.overlapIds),
  };
}

interface RawSubsignal {
  id?: RawId;
  type?: number;
  location?: RawPoint;
}
interface RawSignInfo {
  type?: number;
}
export interface RawSignal {
  id?: RawId;
  boundary?: RawPolygon;
  subsignal?: RawSubsignal[];
  overlap_id?: RawId[];
  type?: number;
  stop_line?: RawCurve[];
  sign_info?: RawSignInfo[];
}

function subsignalFromProto(raw: RawSubsignal): Subsignal {
  return {
    id: unwrapId(raw.id) ?? '',
    type: enumFromProto(SUBSIGNAL_TYPE, raw.type, 'UNKNOWN_SUBSIGNAL'),
    location: raw.location ? pointFromProto(raw.location) : { x: 0, y: 0 },
  };
}

function subsignalToProto(s: Subsignal): RawSubsignal {
  return {
    id: wrapId(s.id),
    type: enumToProto(SUBSIGNAL_TYPE_INV, s.type),
    location: pointToProto(s.location),
  };
}

function signInfoFromProto(raw: RawSignInfo): SignInfo {
  return { type: enumFromProto(SIGN_INFO_TYPE, raw.type, 'None') };
}

function signInfoToProto(s: SignInfo): RawSignInfo {
  return { type: enumToProto(SIGN_INFO_TYPE_INV, s.type) };
}

export function rawSignalToEntity(raw: RawSignal): SignalEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  return {
    id,
    entityType: 'signal',
    boundary: convertPolygonFromProto(raw.boundary),
    subsignals: (raw.subsignal ?? []).map(subsignalFromProto),
    type: enumFromProto(SIGNAL_TYPE, raw.type, 'UNKNOWN_SIGNAL'),
    overlapIds: unwrapIdArray(raw.overlap_id),
    stopLines: curveArrayFromProto(raw.stop_line),
    signInfo: (raw.sign_info ?? []).map(signInfoFromProto),
  };
}

export function entityToRawSignal(e: SignalEntity): RawSignal {
  return {
    id: wrapId(e.id),
    boundary: convertPolygonToProto(e.boundary),
    subsignal: e.subsignals.map(subsignalToProto),
    overlap_id: wrapIdArray(e.overlapIds),
    type: enumToProto(SIGNAL_TYPE_INV, e.type),
    stop_line: curveArrayToProto(e.stopLines),
    sign_info: e.signInfo.map(signInfoToProto),
  };
}

interface RawPassage {
  id?: RawId;
  signal_id?: RawId[];
  yield_id?: RawId[];
  stop_sign_id?: RawId[];
  lane_id?: RawId[];
  type?: number;
}
interface RawPassageGroup {
  id?: RawId;
  passage?: RawPassage[];
}
export interface RawPNCJunction {
  id?: RawId;
  polygon?: RawPolygon;
  overlap_id?: RawId[];
  passage_group?: RawPassageGroup[];
}

function passageFromProto(raw: RawPassage): Passage {
  return {
    id: unwrapId(raw.id) ?? '',
    signalIds: unwrapIdArray(raw.signal_id),
    yieldIds: unwrapIdArray(raw.yield_id),
    stopSignIds: unwrapIdArray(raw.stop_sign_id),
    laneIds: unwrapIdArray(raw.lane_id),
    type: enumFromProto(PASSAGE_TYPE, raw.type, 'UNKNOWN_PASSAGE'),
  };
}

function passageToProto(p: Passage): RawPassage {
  return {
    id: wrapId(p.id),
    signal_id: wrapIdArray(p.signalIds),
    yield_id: wrapIdArray(p.yieldIds),
    stop_sign_id: wrapIdArray(p.stopSignIds),
    lane_id: wrapIdArray(p.laneIds),
    type: enumToProto(PASSAGE_TYPE_INV, p.type),
  };
}

function passageGroupFromProto(raw: RawPassageGroup): PassageGroup {
  return {
    id: unwrapId(raw.id) ?? '',
    passages: (raw.passage ?? []).map(passageFromProto),
  };
}

function passageGroupToProto(pg: PassageGroup): RawPassageGroup {
  return { id: wrapId(pg.id), passage: pg.passages.map(passageToProto) };
}

export function rawPNCJunctionToEntity(raw: RawPNCJunction): PNCJunctionEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  return {
    id,
    entityType: 'pncJunction',
    polygon: convertPolygonFromProto(raw.polygon),
    overlapIds: unwrapIdArray(raw.overlap_id),
    passageGroups: (raw.passage_group ?? []).map(passageGroupFromProto),
  };
}

export function entityToRawPNCJunction(e: PNCJunctionEntity): RawPNCJunction {
  return {
    id: wrapId(e.id),
    polygon: convertPolygonToProto(e.polygon),
    overlap_id: wrapIdArray(e.overlapIds),
    passage_group: e.passageGroups.map(passageGroupToProto),
  };
}

export interface RawBarrierGate {
  id?: RawId;
  type?: number;
  polygon?: RawPolygon;
  stop_line?: RawCurve[];
  overlap_id?: RawId[];
}

export function rawBarrierGateToEntity(raw: RawBarrierGate): BarrierGateEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  return {
    id,
    entityType: 'barrierGate',
    type: enumFromProto(BARRIER_GATE_TYPE, raw.type, 'OTHER'),
    polygon: convertPolygonFromProto(raw.polygon),
    stopLines: curveArrayFromProto(raw.stop_line),
    overlapIds: unwrapIdArray(raw.overlap_id),
  };
}

export function entityToRawBarrierGate(e: BarrierGateEntity): RawBarrierGate {
  return {
    id: wrapId(e.id),
    type: enumToProto(BARRIER_GATE_TYPE_INV, e.type),
    polygon: convertPolygonToProto(e.polygon),
    stop_line: curveArrayToProto(e.stopLines),
    overlap_id: wrapIdArray(e.overlapIds),
  };
}

export interface RawRSU {
  id?: RawId;
  junction_id?: RawId;
  overlap_id?: RawId[];
}

export function rawRSUToEntity(raw: RawRSU): RSUEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  return {
    id,
    entityType: 'rsu',
    junctionId: unwrapId(raw.junction_id),
    overlapIds: unwrapIdArray(raw.overlap_id),
  };
}

export function entityToRawRSU(e: RSUEntity): RawRSU {
  const out: RawRSU = {
    id: wrapId(e.id),
    overlap_id: wrapIdArray(e.overlapIds),
  };
  if (e.junctionId !== null) out.junction_id = wrapId(e.junctionId);
  return out;
}

export interface RawArea {
  id?: RawId;
  type?: number;
  polygon?: RawPolygon;
  overlap_id?: RawId[];
  name?: string;
}

export function rawAreaToEntity(raw: RawArea): AreaEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  const entity: AreaEntity = {
    id,
    entityType: 'area',
    type: enumFromProto(AREA_TYPE, raw.type, 'Driveable'),
    polygon: convertPolygonFromProto(raw.polygon),
    overlapIds: unwrapIdArray(raw.overlap_id),
  };
  if (raw.name !== undefined) entity.name = raw.name;
  return entity;
}

export function entityToRawArea(e: AreaEntity): RawArea {
  const out: RawArea = {
    id: wrapId(e.id),
    type: enumToProto(AREA_TYPE_INV, e.type),
    polygon: convertPolygonToProto(e.polygon),
    overlap_id: wrapIdArray(e.overlapIds),
  };
  if (e.name !== undefined) out.name = e.name;
  return out;
}
