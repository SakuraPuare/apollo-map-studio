import type { LaneEntity } from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';
import { METERS_PER_DEGREE } from '@/config/mapConstants';
import { pointInPolygon } from './hitTest';
import { bboxOfPoints } from '@/core/elements/overlap/intersect';
import {
  NEIGHBOR_QUERY_PADDING_M,
  endpointKey,
  paddedLaneBBoxFromBBox,
  type Endpoint,
  type JunctionPolygon,
  type LaneGeometry,
  type LocalFrame,
  type TopologyIndices,
} from './laneTopologyIndex';

const NEIGHBOR_MIN_LATERAL_M = 1.0;
const NEIGHBOR_MAX_LATERAL_M = 8.0;
const NEIGHBOR_MIN_OVERLAP_RATIO = 0.5;
const PARALLEL_DOT_THRESHOLD = 0.95;

interface NeighborBuckets {
  lF: string[];
  rF: string[];
  lR: string[];
  rR: string[];
}

interface NeighborFrame {
  s: GeoPoint;
  frame: LocalFrame;
  aLen: number;
  lxA: number;
  lyA: number;
}

interface DerivedLaneTopology {
  pred: string[];
  succ: string[];
  selfReverse: string[];
  junctionId: string | null;
  neighbors: NeighborBuckets;
}

function segmentsCross(
  a1: readonly [number, number],
  a2: readonly [number, number],
  b1: readonly [number, number],
  b2: readonly [number, number],
): boolean {
  const rx = a2[0] - a1[0];
  const ry = a2[1] - a1[1];
  const sx = b2[0] - b1[0];
  const sy = b2[1] - b1[1];
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return false;
  const dx = b1[0] - a1[0];
  const dy = b1[1] - a1[1];
  const t = (dx * sy - dy * sx) / denom;
  const u = (dx * ry - dy * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function polylineHitsPolygon(
  line: readonly [number, number][],
  polygon: readonly [number, number][],
): boolean {
  if (line.length < 2 || polygon.length < 3) return false;
  const polyMut = polygon as [number, number][];
  if (pointInPolygon(line[0]!, polyMut)) return true;
  if (pointInPolygon(line[line.length - 1]!, polyMut)) return true;
  for (let i = 0; i < line.length - 1; i++) {
    const a1 = line[i]!;
    const a2 = line[i + 1]!;
    for (let j = 0, k = polygon.length - 1; j < polygon.length; k = j++) {
      if (segmentsCross(a1, a2, polygon[k]!, polygon[j]!)) return true;
    }
  }
  return false;
}

function setEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const id of b) if (!sa.has(id)) return false;
  return sa.size === b.length;
}

function projectInto(
  originLngDeg: number,
  originLatDeg: number,
  p: GeoPoint,
): { x: number; y: number } {
  const cosLat = Math.cos((originLatDeg * Math.PI) / 180);
  const mPerLng = METERS_PER_DEGREE * cosLat;
  return {
    x: (p.x - originLngDeg) * mPerLng,
    y: (p.y - originLatDeg) * METERS_PER_DEGREE,
  };
}

function derivePredSucc(
  lane: LaneEntity,
  s: GeoPoint,
  t: GeoPoint,
  startsByKey: ReadonlyMap<string, Endpoint[]>,
  endsByKey: ReadonlyMap<string, Endpoint[]>,
): { pred: string[]; succ: string[] } {
  const predHits = (endsByKey.get(endpointKey(s.x, s.y)) ?? []).filter(
    (ep) => ep.laneId !== lane.id,
  );
  const succHits = (startsByKey.get(endpointKey(t.x, t.y)) ?? []).filter(
    (ep) => ep.laneId !== lane.id,
  );
  return {
    pred: Array.from(new Set(predHits.map((ep) => ep.laneId))),
    succ: Array.from(new Set(succHits.map((ep) => ep.laneId))),
  };
}

function deriveSelfReverse(lane: LaneEntity, s: GeoPoint, t: GeoPoint, indices: TopologyIndices) {
  const sKey = endpointKey(s.x, s.y);
  const tKey = endpointKey(t.x, t.y);
  const reverseCandidates = (indices.endsByKey.get(sKey) ?? []).filter(
    (ep) => ep.laneId !== lane.id,
  );
  return Array.from(
    new Set(
      reverseCandidates
        .filter((ep) => {
          const other = indices.lanesById.get(ep.laneId);
          if (!other) return false;
          const os = indices.laneGeometry.get(other.id)?.start;
          return !!os && endpointKey(os.x, os.y) === tKey;
        })
        .map((ep) => ep.laneId),
    ),
  );
}

function deriveJunctionId(
  centerline: readonly GeoPoint[],
  junctionPolygons: readonly JunctionPolygon[],
): string | null {
  const centralLine: [number, number][] = centerline.map((p) => [p.x, p.y]);
  for (const j of junctionPolygons) {
    if (j.polygon.length >= 3 && polylineHitsPolygon(centralLine, j.polygon)) return j.id;
  }
  return null;
}

function classifyNeighbor(
  ctx: NeighborFrame,
  otherGeometry: LaneGeometry,
): { isForward: boolean; isLeft: boolean } | null {
  const { s, frame, aLen, lxA, lyA } = ctx;
  const oStartLocal = projectInto(s.x, s.y, otherGeometry.start);
  const oEndLocal = projectInto(s.x, s.y, otherGeometry.end);
  const dx = oEndLocal.x - oStartLocal.x;
  const dy = oEndLocal.y - oStartLocal.y;
  const bLen = Math.hypot(dx, dy);
  if (bLen < 1e-3) return null;

  const cosTheta = (dx / bLen) * frame.ux + (dy / bLen) * frame.uy;
  const isForward =
    cosTheta > PARALLEL_DOT_THRESHOLD ? true : cosTheta < -PARALLEL_DOT_THRESHOLD ? false : null;
  if (isForward === null) return null;

  const oStartLon = oStartLocal.x * frame.ux + oStartLocal.y * frame.uy;
  const oEndLon = oEndLocal.x * frame.ux + oEndLocal.y * frame.uy;
  const bLonMin = Math.min(oStartLon, oEndLon);
  const bLonMax = Math.max(oStartLon, oEndLon);
  const overlap = Math.max(0, Math.min(aLen, bLonMax) - Math.max(0, bLonMin));
  const minLen = Math.min(aLen, bLonMax - bLonMin);
  if (minLen < 1e-3 || overlap < NEIGHBOR_MIN_OVERLAP_RATIO * minLen) return null;

  const midBX = (oStartLocal.x + oEndLocal.x) / 2;
  const midBY = (oStartLocal.y + oEndLocal.y) / 2;
  const latMid = midBX * lxA + midBY * lyA;
  const absLat = Math.abs(latMid);
  if (absLat < NEIGHBOR_MIN_LATERAL_M || absLat > NEIGHBOR_MAX_LATERAL_M) return null;
  return { isForward, isLeft: latMid > 0 };
}

function pushNeighbor(
  buckets: NeighborBuckets,
  id: string,
  cls: { isForward: boolean; isLeft: boolean },
) {
  if (cls.isForward) {
    if (cls.isLeft) buckets.lF.push(id);
    else buckets.rF.push(id);
  } else if (cls.isLeft) buckets.lR.push(id);
  else buckets.rR.push(id);
}

function deriveNeighbors(
  lane: LaneEntity,
  s: GeoPoint,
  frameA: LocalFrame,
  candidates: readonly LaneEntity[],
  indices: TopologyIndices,
): NeighborBuckets {
  const buckets: NeighborBuckets = { lF: [], rF: [], lR: [], rR: [] };
  const ctx: NeighborFrame = {
    s,
    frame: frameA,
    aLen: Math.hypot(frameA.ex, frameA.ey),
    lxA: -frameA.uy,
    lyA: frameA.ux,
  };

  for (const other of candidates) {
    if (other.id === lane.id || !indices.frames.has(other.id)) continue;
    const otherGeometry = indices.laneGeometry.get(other.id);
    if (!otherGeometry) continue;
    const cls = classifyNeighbor(ctx, otherGeometry);
    if (cls) pushNeighbor(buckets, other.id, cls);
  }

  return {
    lF: Array.from(new Set(buckets.lF)),
    rF: Array.from(new Set(buckets.rF)),
    lR: Array.from(new Set(buckets.lR)),
    rR: Array.from(new Set(buckets.rR)),
  };
}

function candidateJunctions(indices: TopologyIndices, geom: LaneGeometry): JunctionPolygon[] {
  const laneBBox = bboxOfPoints(geom.centerline);
  if (!laneBBox || indices.junctionPolygons.length === 0) return [];
  return indices.junctionIndex
    .queryBBox(laneBBox)
    .map((n) => indices.junctionById.get(n.id))
    .filter((j): j is JunctionPolygon => !!j)
    .sort((a, b) => a.order - b.order);
}

function neighborCandidates(
  indices: TopologyIndices,
  lane: LaneEntity,
  geom: LaneGeometry,
): LaneEntity[] {
  const frameA = indices.frames.get(lane.id);
  const laneBBox = bboxOfPoints(geom.centerline);
  if (!frameA || !laneBBox) return [];
  const bbox = paddedLaneBBoxFromBBox(laneBBox, geom.start.y, NEIGHBOR_QUERY_PADDING_M);
  return indices.laneIndex
    .queryBBox(bbox)
    .map((n) => indices.lanesById.get(n.id))
    .filter((e): e is LaneEntity => !!e && e.id !== lane.id);
}

function deriveLaneTopology(
  indices: TopologyIndices,
  lane: LaneEntity,
  geom: LaneGeometry,
): DerivedLaneTopology {
  const { start: s, end: t } = geom;
  const { pred, succ } = derivePredSucc(lane, s, t, indices.startsByKey, indices.endsByKey);
  const frameA = indices.frames.get(lane.id);
  return {
    pred,
    succ,
    selfReverse: deriveSelfReverse(lane, s, t, indices),
    junctionId: deriveJunctionId(geom.centerline, candidateJunctions(indices, geom)),
    neighbors: frameA
      ? deriveNeighbors(lane, s, frameA, neighborCandidates(indices, lane, geom), indices)
      : { lF: [], rF: [], lR: [], rR: [] },
  };
}

function laneNeedsUpdate(lane: LaneEntity, next: DerivedLaneTopology): boolean {
  const { lF, rF, lR, rR } = next.neighbors;
  return (
    !setEqual(lane.predecessorIds, next.pred) ||
    !setEqual(lane.successorIds, next.succ) ||
    !setEqual(lane.selfReverseLaneIds, next.selfReverse) ||
    lane.junctionId !== next.junctionId ||
    !setEqual(lane.leftNeighborForwardIds, lF) ||
    !setEqual(lane.rightNeighborForwardIds, rF) ||
    !setEqual(lane.leftNeighborReverseIds, lR) ||
    !setEqual(lane.rightNeighborReverseIds, rR)
  );
}

function updatedLane(lane: LaneEntity, next: DerivedLaneTopology): LaneEntity {
  const { lF, rF, lR, rR } = next.neighbors;
  return {
    ...lane,
    predecessorIds: next.pred,
    successorIds: next.succ,
    selfReverseLaneIds: next.selfReverse,
    junctionId: next.junctionId,
    leftNeighborForwardIds: lF,
    rightNeighborForwardIds: rF,
    leftNeighborReverseIds: lR,
    rightNeighborReverseIds: rR,
  };
}

export function deriveChangesForLanes(
  indices: TopologyIndices,
  laneIds: Iterable<string>,
): Map<string, LaneEntity> {
  const changes = new Map<string, LaneEntity>();
  for (const laneId of laneIds) {
    const lane = indices.lanesById.get(laneId);
    if (!lane) continue;
    const geom = indices.laneGeometry.get(lane.id);
    if (!geom) continue;
    const next = deriveLaneTopology(indices, lane, geom);
    if (laneNeedsUpdate(lane, next)) changes.set(lane.id, updatedLane(lane, next));
  }
  return changes;
}
