import type { SignInfo, SignalEntity, Subsignal } from '@/types/apollo';
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
} from '../common';
import {
  SIGNAL_TYPE,
  SIGNAL_TYPE_INV,
  SIGN_INFO_TYPE,
  SIGN_INFO_TYPE_INV,
  SUBSIGNAL_TYPE,
  SUBSIGNAL_TYPE_INV,
  enumFromProto,
  enumToProto,
} from '../enums';

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
  // Subsignal.location is `optional` in proto2 — Apollo's own comment on the
  // field says "now no data support" and real maps almost never write it.
  // Defaulting absent values to {x:0, y:0} would round-trip-corrupt every
  // imported subsignal (spurious zero-points re-emitted on export). Preserve
  // wire fidelity by leaving location undefined when the source omits it.
  const sub: Subsignal = {
    id: unwrapId(raw.id) ?? '',
    type: enumFromProto(SUBSIGNAL_TYPE, raw.type, 'UNKNOWN_SUBSIGNAL'),
  };
  if (raw.location !== undefined) sub.location = pointFromProto(raw.location);
  return sub;
}

function subsignalToProto(s: Subsignal): RawSubsignal {
  // Mirror subsignalFromProto: only emit `location` when it was authored.
  // A user-drawn signal will have a real location from buildSignalTemplate;
  // an imported signal whose source omitted location must NOT acquire one.
  const raw: RawSubsignal = {
    id: wrapId(s.id),
    type: enumToProto(SUBSIGNAL_TYPE_INV, s.type),
  };
  if (s.location !== undefined) raw.location = pointToProto(s.location);
  return raw;
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
