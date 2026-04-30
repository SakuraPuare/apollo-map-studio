import type {
  ClearAreaEntity,
  CrosswalkEntity,
  JunctionEntity,
  ParkingSpaceEntity,
  SpeedBumpEntity,
  StopSignEntity,
  YieldSignEntity,
} from '@/types/apollo';
import {
  convertPolygonFromProto,
  convertPolygonToProto,
  curveArrayFromProto,
  curveArrayToProto,
  unwrapId,
  unwrapIdArray,
  wrapId,
  wrapIdArray,
  type RawCurve,
  type RawId,
  type RawPolygon,
} from '../common';
import {
  JUNCTION_TYPE,
  JUNCTION_TYPE_INV,
  STOP_SIGN_TYPE,
  STOP_SIGN_TYPE_INV,
  enumFromProto,
  enumToProto,
} from '../enums';

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
