import type { ObjectOverlapInfo, OverlapEntity, RegionOverlapInfo } from '@/types/apollo';
import {
  convertPolygonFromProto,
  convertPolygonToProto,
  unwrapId,
  wrapId,
  type RawId,
  type RawPolygon,
} from './common';

interface RawLaneOverlapInfo {
  start_s?: number;
  end_s?: number;
  is_merge?: boolean;
  region_overlap_id?: RawId;
}
interface RawCrosswalkOverlapInfo {
  region_overlap_id?: RawId;
}
interface RawObjectOverlapInfo {
  id?: RawId;
  lane_overlap_info?: RawLaneOverlapInfo;
  signal_overlap_info?: object;
  stop_sign_overlap_info?: object;
  crosswalk_overlap_info?: RawCrosswalkOverlapInfo;
  junction_overlap_info?: object;
  yield_sign_overlap_info?: object;
  clear_area_overlap_info?: object;
  speed_bump_overlap_info?: object;
  parking_space_overlap_info?: object;
  pnc_junction_overlap_info?: object;
  rsu_overlap_info?: object;
  area_overlap_info?: object;
  barrier_gate_overlap_info?: object;
}

type SimpleOverlapField = Exclude<
  keyof RawObjectOverlapInfo,
  'id' | 'lane_overlap_info' | 'crosswalk_overlap_info'
>;
type SimpleObjectType = Exclude<ObjectOverlapInfo['objectType'], 'lane' | 'crosswalk' | 'unknown'>;

const SIMPLE_OVERLAP_FIELDS: Array<[SimpleOverlapField, SimpleObjectType]> = [
  ['signal_overlap_info', 'signal'],
  ['stop_sign_overlap_info', 'stopSign'],
  ['junction_overlap_info', 'junction'],
  ['yield_sign_overlap_info', 'yieldSign'],
  ['clear_area_overlap_info', 'clearArea'],
  ['speed_bump_overlap_info', 'speedBump'],
  ['parking_space_overlap_info', 'parkingSpace'],
  ['pnc_junction_overlap_info', 'pncJunction'],
  ['rsu_overlap_info', 'rsu'],
  ['area_overlap_info', 'area'],
  ['barrier_gate_overlap_info', 'barrierGate'],
];

const SIMPLE_FIELD_BY_TYPE = new Map<SimpleObjectType, SimpleOverlapField>(
  SIMPLE_OVERLAP_FIELDS.map(([field, type]) => [type, field]),
);

interface RawRegionOverlapInfo {
  id?: RawId;
  polygon?: RawPolygon[];
}
export interface RawOverlap {
  id?: RawId;
  object?: RawObjectOverlapInfo[];
  region_overlap?: RawRegionOverlapInfo[];
}

function objectOverlapInfoFromProto(raw: RawObjectOverlapInfo): ObjectOverlapInfo | null {
  const objectId = unwrapId(raw.id);
  if (!objectId) return null;
  if (raw.lane_overlap_info) return laneOverlapInfoFromProto(objectId, raw.lane_overlap_info);
  if (raw.crosswalk_overlap_info) {
    return crosswalkOverlapInfoFromProto(objectId, raw.crosswalk_overlap_info);
  }
  for (const [field, objectType] of SIMPLE_OVERLAP_FIELDS) {
    if (raw[field]) return { objectType, objectId } as ObjectOverlapInfo;
  }
  // Apollo proto2 leaves `overlap_info` oneof unset on real-world maps
  // (e.g. sunnyvale_loop sim_map.txt: lane↔crosswalk overlaps emit one
  // `object { id }`-only entry). Returning null here would silently drop
  // the entry on round-trip — preserve it as `unknown` so re-export keeps
  // the same id list and downstream reconcile can rebuild semantic info
  // from geometry.
  return { objectType: 'unknown', objectId };
}

function laneOverlapInfoFromProto(objectId: string, info: RawLaneOverlapInfo): ObjectOverlapInfo {
  const out: ObjectOverlapInfo = {
    objectType: 'lane',
    objectId,
    laneOverlapInfo: {},
  };
  if (info.start_s !== undefined) out.laneOverlapInfo.startS = info.start_s;
  if (info.end_s !== undefined) out.laneOverlapInfo.endS = info.end_s;
  if (info.is_merge !== undefined) out.laneOverlapInfo.isMerge = info.is_merge;
  const regionId = unwrapId(info.region_overlap_id);
  if (regionId) out.laneOverlapInfo.regionOverlapId = regionId;
  return out;
}

function crosswalkOverlapInfoFromProto(
  objectId: string,
  info: RawCrosswalkOverlapInfo,
): ObjectOverlapInfo {
  const out: ObjectOverlapInfo = { objectType: 'crosswalk', objectId };
  const regionId = unwrapId(info.region_overlap_id);
  if (regionId) out.regionOverlapId = regionId;
  return out;
}

function objectOverlapInfoToProto(info: ObjectOverlapInfo): RawObjectOverlapInfo {
  const out: RawObjectOverlapInfo = { id: wrapId(info.objectId) };
  switch (info.objectType) {
    case 'lane': {
      out.lane_overlap_info = laneOverlapInfoToProto(info);
      break;
    }
    case 'crosswalk': {
      out.crosswalk_overlap_info = crosswalkOverlapInfoToProto(info);
      break;
    }
    case 'unknown':
      // Pass-through bucket for source overlaps whose `overlap_info` oneof
      // was unset upstream; emit just `{ id }` so the proto stays byte-equal
      // to the input (no `*_overlap_info` field).
      break;
    default: {
      const field = SIMPLE_FIELD_BY_TYPE.get(info.objectType as SimpleObjectType);
      if (field) out[field] = {};
    }
  }
  return out;
}

function laneOverlapInfoToProto(info: Extract<ObjectOverlapInfo, { objectType: 'lane' }>) {
  const out: RawLaneOverlapInfo = {};
  if (info.laneOverlapInfo.startS !== undefined) out.start_s = info.laneOverlapInfo.startS;
  if (info.laneOverlapInfo.endS !== undefined) out.end_s = info.laneOverlapInfo.endS;
  if (info.laneOverlapInfo.isMerge !== undefined) out.is_merge = info.laneOverlapInfo.isMerge;
  if (info.laneOverlapInfo.regionOverlapId) {
    out.region_overlap_id = wrapId(info.laneOverlapInfo.regionOverlapId);
  }
  return out;
}

function crosswalkOverlapInfoToProto(
  info: Extract<ObjectOverlapInfo, { objectType: 'crosswalk' }>,
) {
  const out: RawCrosswalkOverlapInfo = {};
  if (info.regionOverlapId) out.region_overlap_id = wrapId(info.regionOverlapId);
  return out;
}

function regionOverlapInfoFromProto(raw: RawRegionOverlapInfo): RegionOverlapInfo {
  return {
    id: unwrapId(raw.id) ?? '',
    polygons: (raw.polygon ?? []).map(convertPolygonFromProto),
  };
}

function regionOverlapInfoToProto(r: RegionOverlapInfo): RawRegionOverlapInfo {
  return { id: wrapId(r.id), polygon: r.polygons.map(convertPolygonToProto) };
}

export function rawOverlapToEntity(raw: RawOverlap): OverlapEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  const objects: ObjectOverlapInfo[] = [];
  for (const o of raw.object ?? []) {
    const info = objectOverlapInfoFromProto(o);
    if (info) objects.push(info);
  }
  return {
    id,
    entityType: 'overlap',
    objects,
    regionOverlaps: (raw.region_overlap ?? []).map(regionOverlapInfoFromProto),
  };
}

export function entityToRawOverlap(e: OverlapEntity): RawOverlap {
  return {
    id: wrapId(e.id),
    object: e.objects.map(objectOverlapInfoToProto),
    region_overlap: e.regionOverlaps.map(regionOverlapInfoToProto),
  };
}
