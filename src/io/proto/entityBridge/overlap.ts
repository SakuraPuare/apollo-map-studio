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
  if (raw.lane_overlap_info) {
    const info = raw.lane_overlap_info;
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
  if (raw.signal_overlap_info) return { objectType: 'signal', objectId };
  if (raw.stop_sign_overlap_info) return { objectType: 'stopSign', objectId };
  if (raw.crosswalk_overlap_info) {
    const out: ObjectOverlapInfo = { objectType: 'crosswalk', objectId };
    const regionId = unwrapId(raw.crosswalk_overlap_info.region_overlap_id);
    if (regionId) out.regionOverlapId = regionId;
    return out;
  }
  if (raw.junction_overlap_info) return { objectType: 'junction', objectId };
  if (raw.yield_sign_overlap_info) return { objectType: 'yieldSign', objectId };
  if (raw.clear_area_overlap_info) return { objectType: 'clearArea', objectId };
  if (raw.speed_bump_overlap_info) return { objectType: 'speedBump', objectId };
  if (raw.parking_space_overlap_info) return { objectType: 'parkingSpace', objectId };
  if (raw.pnc_junction_overlap_info) return { objectType: 'pncJunction', objectId };
  if (raw.rsu_overlap_info) return { objectType: 'rsu', objectId };
  if (raw.area_overlap_info) return { objectType: 'area', objectId };
  if (raw.barrier_gate_overlap_info) return { objectType: 'barrierGate', objectId };
  // Apollo proto2 leaves `overlap_info` oneof unset on real-world maps
  // (e.g. sunnyvale_loop sim_map.txt: lane↔crosswalk overlaps emit one
  // `object { id }`-only entry). Returning null here would silently drop
  // the entry on round-trip — preserve it as `unknown` so re-export keeps
  // the same id list and downstream reconcile can rebuild semantic info
  // from geometry.
  return { objectType: 'unknown', objectId };
}

function objectOverlapInfoToProto(info: ObjectOverlapInfo): RawObjectOverlapInfo {
  const out: RawObjectOverlapInfo = { id: wrapId(info.objectId) };
  switch (info.objectType) {
    case 'lane': {
      const li: RawLaneOverlapInfo = {};
      if (info.laneOverlapInfo.startS !== undefined) li.start_s = info.laneOverlapInfo.startS;
      if (info.laneOverlapInfo.endS !== undefined) li.end_s = info.laneOverlapInfo.endS;
      if (info.laneOverlapInfo.isMerge !== undefined) li.is_merge = info.laneOverlapInfo.isMerge;
      if (info.laneOverlapInfo.regionOverlapId)
        li.region_overlap_id = wrapId(info.laneOverlapInfo.regionOverlapId);
      out.lane_overlap_info = li;
      break;
    }
    case 'signal':
      out.signal_overlap_info = {};
      break;
    case 'stopSign':
      out.stop_sign_overlap_info = {};
      break;
    case 'crosswalk': {
      const ci: RawCrosswalkOverlapInfo = {};
      if (info.regionOverlapId) ci.region_overlap_id = wrapId(info.regionOverlapId);
      out.crosswalk_overlap_info = ci;
      break;
    }
    case 'junction':
      out.junction_overlap_info = {};
      break;
    case 'yieldSign':
      out.yield_sign_overlap_info = {};
      break;
    case 'clearArea':
      out.clear_area_overlap_info = {};
      break;
    case 'speedBump':
      out.speed_bump_overlap_info = {};
      break;
    case 'parkingSpace':
      out.parking_space_overlap_info = {};
      break;
    case 'pncJunction':
      out.pnc_junction_overlap_info = {};
      break;
    case 'rsu':
      out.rsu_overlap_info = {};
      break;
    case 'area':
      out.area_overlap_info = {};
      break;
    case 'barrierGate':
      out.barrier_gate_overlap_info = {};
      break;
    case 'unknown':
      // Pass-through bucket for source overlaps whose `overlap_info` oneof
      // was unset upstream; emit just `{ id }` so the proto stays byte-equal
      // to the input (no `*_overlap_info` field).
      break;
  }
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
