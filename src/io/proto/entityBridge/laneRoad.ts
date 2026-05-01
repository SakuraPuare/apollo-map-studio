import type {
  BoundaryEdge,
  BoundaryPolygon,
  LaneBoundary,
  LaneBoundaryTypeEntry,
  LaneEntity,
  LaneSampleAssociation,
  RoadBoundary,
  RoadEntity,
  RoadSection,
} from '@/types/apollo';
import {
  curveFromProto,
  curveToProto,
  unwrapId,
  unwrapIdArray,
  wrapId,
  wrapIdArray,
  type RawCurve,
  type RawId,
} from './common';
import {
  BOUNDARY_EDGE_TYPE,
  BOUNDARY_EDGE_TYPE_INV,
  LANE_BOUNDARY_LINE_TYPE,
  LANE_BOUNDARY_LINE_TYPE_INV,
  LANE_DIRECTION,
  LANE_DIRECTION_INV,
  LANE_TURN,
  LANE_TURN_INV,
  LANE_TYPE,
  LANE_TYPE_INV,
  ROAD_TYPE,
  ROAD_TYPE_INV,
  enumFromProto,
  enumFromProtoOptional,
  enumToProto,
} from './enums';

interface RawLaneSampleAssociation {
  s?: number;
  width?: number;
}
interface RawLaneBoundaryTypeEntry {
  s?: number;
  types?: number[];
}
interface RawLaneBoundary {
  curve?: RawCurve;
  length?: number;
  virtual?: boolean;
  boundary_type?: RawLaneBoundaryTypeEntry[];
}
export interface RawLane {
  id?: RawId;
  central_curve?: RawCurve;
  left_boundary?: RawLaneBoundary;
  right_boundary?: RawLaneBoundary;
  length?: number;
  speed_limit?: number;
  overlap_id?: RawId[];
  predecessor_id?: RawId[];
  successor_id?: RawId[];
  left_neighbor_forward_lane_id?: RawId[];
  right_neighbor_forward_lane_id?: RawId[];
  type?: number;
  turn?: number;
  left_neighbor_reverse_lane_id?: RawId[];
  right_neighbor_reverse_lane_id?: RawId[];
  junction_id?: RawId;
  left_sample?: RawLaneSampleAssociation[];
  right_sample?: RawLaneSampleAssociation[];
  direction?: number;
  left_road_sample?: RawLaneSampleAssociation[];
  right_road_sample?: RawLaneSampleAssociation[];
  self_reverse_lane_id?: RawId[];
}

function sampleFromProto(s: RawLaneSampleAssociation): LaneSampleAssociation {
  return { s: s.s ?? 0, width: s.width ?? 0 };
}

function sampleToProto(s: LaneSampleAssociation): RawLaneSampleAssociation {
  return { s: s.s, width: s.width };
}

function boundaryTypeEntryFromProto(e: RawLaneBoundaryTypeEntry): LaneBoundaryTypeEntry {
  return {
    s: e.s ?? 0,
    types: (e.types ?? []).map((n) => enumFromProto(LANE_BOUNDARY_LINE_TYPE, n, 'UNKNOWN')),
  };
}

function boundaryTypeEntryToProto(e: LaneBoundaryTypeEntry): RawLaneBoundaryTypeEntry {
  return { s: e.s, types: e.types.map((t) => enumToProto(LANE_BOUNDARY_LINE_TYPE_INV, t)) };
}

function laneBoundaryFromProto(b: RawLaneBoundary | undefined): LaneBoundary {
  if (!b) return { curve: { segments: [] }, boundaryType: [] };
  const out: LaneBoundary = {
    curve: curveFromProto(b.curve),
    boundaryType: (b.boundary_type ?? []).map(boundaryTypeEntryFromProto),
  };
  if (b.length !== undefined) out.length = b.length;
  if (b.virtual !== undefined) out.virtual = b.virtual;
  return out;
}

function laneBoundaryToProto(b: LaneBoundary): RawLaneBoundary {
  const out: RawLaneBoundary = {
    curve: curveToProto(b.curve),
    boundary_type: b.boundaryType.map(boundaryTypeEntryToProto),
  };
  if (b.length !== undefined) out.length = b.length;
  if (b.virtual !== undefined) out.virtual = b.virtual;
  return out;
}

export function rawLaneToEntity(raw: RawLane): LaneEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  const out: LaneEntity = {
    id,
    entityType: 'lane',
    centralCurve: curveFromProto(raw.central_curve),
    leftBoundary: laneBoundaryFromProto(raw.left_boundary),
    rightBoundary: laneBoundaryFromProto(raw.right_boundary),
    type: enumFromProto(LANE_TYPE, raw.type, 'NONE'),
    turn: enumFromProto(LANE_TURN, raw.turn, 'NO_TURN'),
    direction: enumFromProto(LANE_DIRECTION, raw.direction, 'FORWARD'),
    predecessorIds: unwrapIdArray(raw.predecessor_id),
    successorIds: unwrapIdArray(raw.successor_id),
    leftNeighborForwardIds: unwrapIdArray(raw.left_neighbor_forward_lane_id),
    rightNeighborForwardIds: unwrapIdArray(raw.right_neighbor_forward_lane_id),
    leftNeighborReverseIds: unwrapIdArray(raw.left_neighbor_reverse_lane_id),
    rightNeighborReverseIds: unwrapIdArray(raw.right_neighbor_reverse_lane_id),
    selfReverseLaneIds: unwrapIdArray(raw.self_reverse_lane_id),
    junctionId: unwrapId(raw.junction_id),
    overlapIds: unwrapIdArray(raw.overlap_id),
    leftSamples: (raw.left_sample ?? []).map(sampleFromProto),
    rightSamples: (raw.right_sample ?? []).map(sampleFromProto),
    leftRoadSamples: (raw.left_road_sample ?? []).map(sampleFromProto),
    rightRoadSamples: (raw.right_road_sample ?? []).map(sampleFromProto),
  };
  if (raw.length !== undefined) out.length = raw.length;
  if (raw.speed_limit !== undefined) out.speedLimit = raw.speed_limit;
  return out;
}

export function entityToRawLane(e: LaneEntity): RawLane {
  const out: RawLane = {
    id: wrapId(e.id),
    central_curve: curveToProto(e.centralCurve),
    left_boundary: laneBoundaryToProto(e.leftBoundary),
    right_boundary: laneBoundaryToProto(e.rightBoundary),
    overlap_id: wrapIdArray(e.overlapIds),
    predecessor_id: wrapIdArray(e.predecessorIds),
    successor_id: wrapIdArray(e.successorIds),
    left_neighbor_forward_lane_id: wrapIdArray(e.leftNeighborForwardIds),
    right_neighbor_forward_lane_id: wrapIdArray(e.rightNeighborForwardIds),
    left_neighbor_reverse_lane_id: wrapIdArray(e.leftNeighborReverseIds),
    right_neighbor_reverse_lane_id: wrapIdArray(e.rightNeighborReverseIds),
    self_reverse_lane_id: wrapIdArray(e.selfReverseLaneIds),
    type: enumToProto(LANE_TYPE_INV, e.type),
    turn: enumToProto(LANE_TURN_INV, e.turn),
    direction: enumToProto(LANE_DIRECTION_INV, e.direction),
    left_sample: e.leftSamples.map(sampleToProto),
    right_sample: e.rightSamples.map(sampleToProto),
    left_road_sample: e.leftRoadSamples.map(sampleToProto),
    right_road_sample: e.rightRoadSamples.map(sampleToProto),
  };
  if (e.length !== undefined) out.length = e.length;
  if (e.speedLimit !== undefined) out.speed_limit = e.speedLimit;
  if (e.junctionId !== null) out.junction_id = wrapId(e.junctionId);
  return out;
}

interface RawBoundaryEdge {
  curve?: RawCurve;
  type?: number;
}
interface RawBoundaryPolygon {
  edge?: RawBoundaryEdge[];
}
interface RawRoadBoundary {
  outer_polygon?: RawBoundaryPolygon;
  hole?: RawBoundaryPolygon[];
}
interface RawRoadSection {
  id?: RawId;
  lane_id?: RawId[];
  boundary?: RawRoadBoundary;
}
export interface RawRoad {
  id?: RawId;
  section?: RawRoadSection[];
  junction_id?: RawId;
  type?: number;
}

function boundaryEdgeFromProto(e: RawBoundaryEdge): BoundaryEdge {
  return {
    curve: curveFromProto(e.curve),
    type: enumFromProto(BOUNDARY_EDGE_TYPE, e.type, 'UNKNOWN'),
  };
}

function boundaryEdgeToProto(e: BoundaryEdge): RawBoundaryEdge {
  return { curve: curveToProto(e.curve), type: enumToProto(BOUNDARY_EDGE_TYPE_INV, e.type) };
}

function boundaryPolygonFromProto(b: RawBoundaryPolygon | undefined): BoundaryPolygon {
  return { edges: (b?.edge ?? []).map(boundaryEdgeFromProto) };
}

function boundaryPolygonToProto(b: BoundaryPolygon): RawBoundaryPolygon {
  return { edge: b.edges.map(boundaryEdgeToProto) };
}

function roadBoundaryFromProto(b: RawRoadBoundary | undefined): RoadBoundary {
  return {
    outerPolygon: boundaryPolygonFromProto(b?.outer_polygon),
    holes: (b?.hole ?? []).map((h) => boundaryPolygonFromProto(h)),
  };
}

function roadBoundaryToProto(b: RoadBoundary): RawRoadBoundary {
  return {
    outer_polygon: boundaryPolygonToProto(b.outerPolygon),
    hole: b.holes.map(boundaryPolygonToProto),
  };
}

function roadSectionFromProto(s: RawRoadSection): RoadSection {
  const out: RoadSection = {
    id: unwrapId(s.id) ?? '',
    laneIds: unwrapIdArray(s.lane_id),
  };
  if (s.boundary) out.boundary = roadBoundaryFromProto(s.boundary);
  return out;
}

function roadSectionToProto(s: RoadSection): RawRoadSection {
  const out: RawRoadSection = {
    id: wrapId(s.id),
    lane_id: wrapIdArray(s.laneIds),
  };
  if (s.boundary) out.boundary = roadBoundaryToProto(s.boundary);
  return out;
}

export function rawRoadToEntity(raw: RawRoad): RoadEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  const out: RoadEntity = {
    id,
    entityType: 'road',
    sections: (raw.section ?? []).map(roadSectionFromProto),
    junctionId: unwrapId(raw.junction_id),
  };
  const t = enumFromProtoOptional(ROAD_TYPE, raw.type);
  if (t !== undefined) out.type = t;
  return out;
}

export function entityToRawRoad(e: RoadEntity): RawRoad {
  const out: RawRoad = {
    id: wrapId(e.id),
    section: e.sections.map(roadSectionToProto),
  };
  if (e.type !== undefined) out.type = enumToProto(ROAD_TYPE_INV, e.type);
  if (e.junctionId !== null) out.junction_id = wrapId(e.junctionId);
  return out;
}
