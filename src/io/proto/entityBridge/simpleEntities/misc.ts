import type { AreaEntity, BarrierGateEntity, RSUEntity } from '@/types/apollo';
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
  AREA_TYPE,
  AREA_TYPE_INV,
  BARRIER_GATE_TYPE,
  BARRIER_GATE_TYPE_INV,
  enumFromProto,
  enumToProto,
} from '../enums';

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
