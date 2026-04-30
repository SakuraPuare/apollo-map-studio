/**
 * Overlap pipeline — 配对规则与 ObjectOverlapInfo 工厂.
 *
 * 数据驱动：把"什么实体配什么实体、用什么几何方式相交、怎么生成
 * ObjectOverlapInfo" 集中收口。新加 Apollo 实体类型 = 加一行表。
 *
 * 全部 overlap 都以 lane 为主体（primary）：proto 里 LaneOverlapInfo 是唯一
 * 携带 start_s/end_s 的 oneof 分支，其它实体类型都是空 message。所以
 * 配对扫描的循环抓手是「per lane × neighbors」，O(L × k_avg) 不是 O(N²)。
 */
import type { GeoPoint } from '@/types/entities';
import type { LaneEntity, ObjectOverlapInfo } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import { getCenterline, getPolygon, getPolylines, getStopLines } from './geometryAdapters';
import {
  polylineIntersectsPolygon,
  polylinesIntersect,
  polylinePolygonCrossings,
  endpointsCoincide,
  type SegmentParam,
} from './intersect';
import { laneArcLength, projectSegmentParam } from './computeLaneS';

/** 几何相交检测的结果（带可选的 lane 上的弧长区间） */
export interface PairGeoHit {
  intersects: boolean;
  /** 在 lane centerline 上的米空间区间（穿越多边形 / 与 stopLine 交点） */
  laneInterval?: { startS: number; endS: number };
  /** lane×lane 时的端点重合标记（合流 / 分流） */
  isMerge?: boolean;
}

/**
 * 与 lane 配对的次实体类型 → 几何检测策略.
 * geometry 决定走哪个相交分支；emitObjects 输出 ObjectOverlapInfo[].
 */
export interface PairRule {
  secondaryType: MapEntity['entityType'];
  /** 'polygon' | 'stopLines' | 'polylines' | 'lane' */
  geometry: 'polygon' | 'stopLines' | 'polylines' | 'lane';
  emitObjects(lane: LaneEntity, other: MapEntity, hit: PairGeoHit): ObjectOverlapInfo[];
}

function laneOverlapInfo(lane: LaneEntity, hit: PairGeoHit): ObjectOverlapInfo {
  const interval = hit.laneInterval ?? { startS: 0, endS: laneArcLength(lane) };
  return {
    objectType: 'lane',
    objectId: lane.id,
    laneOverlapInfo: {
      startS: interval.startS,
      endS: interval.endS,
      isMerge: hit.isMerge,
    },
  };
}

export const PAIR_RULES: readonly PairRule[] = [
  {
    secondaryType: 'junction',
    geometry: 'polygon',
    emitObjects: (lane, other, hit) => [
      laneOverlapInfo(lane, hit),
      { objectType: 'junction', objectId: other.id },
    ],
  },
  {
    secondaryType: 'crosswalk',
    geometry: 'polygon',
    emitObjects: (lane, other, hit) => [
      laneOverlapInfo(lane, hit),
      { objectType: 'crosswalk', objectId: other.id },
    ],
  },
  {
    secondaryType: 'clearArea',
    geometry: 'polygon',
    emitObjects: (lane, other, hit) => [
      laneOverlapInfo(lane, hit),
      { objectType: 'clearArea', objectId: other.id },
    ],
  },
  {
    secondaryType: 'parkingSpace',
    geometry: 'polygon',
    emitObjects: (lane, other, hit) => [
      laneOverlapInfo(lane, hit),
      { objectType: 'parkingSpace', objectId: other.id },
    ],
  },
  {
    secondaryType: 'pncJunction',
    geometry: 'polygon',
    emitObjects: (lane, other, hit) => [
      laneOverlapInfo(lane, hit),
      { objectType: 'pncJunction', objectId: other.id },
    ],
  },
  {
    secondaryType: 'area',
    geometry: 'polygon',
    emitObjects: (lane, other, hit) => [
      laneOverlapInfo(lane, hit),
      { objectType: 'area', objectId: other.id },
    ],
  },
  {
    secondaryType: 'signal',
    geometry: 'stopLines',
    emitObjects: (lane, other, hit) => [
      laneOverlapInfo(lane, hit),
      { objectType: 'signal', objectId: other.id },
    ],
  },
  {
    secondaryType: 'stopSign',
    geometry: 'stopLines',
    emitObjects: (lane, other, hit) => [
      laneOverlapInfo(lane, hit),
      { objectType: 'stopSign', objectId: other.id },
    ],
  },
  {
    secondaryType: 'yieldSign',
    geometry: 'stopLines',
    emitObjects: (lane, other, hit) => [
      laneOverlapInfo(lane, hit),
      { objectType: 'yieldSign', objectId: other.id },
    ],
  },
  {
    secondaryType: 'barrierGate',
    geometry: 'stopLines',
    emitObjects: (lane, other, hit) => [
      laneOverlapInfo(lane, hit),
      { objectType: 'barrierGate', objectId: other.id },
    ],
  },
  {
    secondaryType: 'speedBump',
    geometry: 'polylines',
    emitObjects: (lane, other, hit) => [
      laneOverlapInfo(lane, hit),
      { objectType: 'speedBump', objectId: other.id },
    ],
  },
];

const RULE_BY_TYPE = new Map<string, PairRule>(
  PAIR_RULES.map((r) => [r.secondaryType, r] as const),
);

export function findPairRule(secondaryType: string): PairRule | null {
  return RULE_BY_TYPE.get(secondaryType) ?? null;
}

type Interval = { startS: number; endS: number };

function mergeInterval(acc: Interval | undefined, next: Interval): Interval {
  if (!acc) return next;
  return {
    startS: Math.min(acc.startS, next.startS),
    endS: Math.max(acc.endS, next.endS),
  };
}

function detectPolygonHit(lane: LaneEntity, centerline: GeoPoint[], other: MapEntity): PairGeoHit {
  const poly = getPolygon(other);
  if (!poly || poly.length < 3) return { intersects: false };
  if (!polylineIntersectsPolygon(centerline, poly)) return { intersects: false };
  const crossings = polylinePolygonCrossings(centerline, poly);
  return { intersects: true, laneInterval: laneIntervalFromCrossings(lane, crossings) };
}

function detectLineGroupHit(
  lane: LaneEntity,
  centerline: GeoPoint[],
  groups: GeoPoint[][],
): PairGeoHit {
  let hit: Interval | undefined;
  for (const line of groups) {
    if (!polylinesIntersect(centerline, line)) continue;
    const crossings = polylinePolylineCrossings(centerline, line);
    if (crossings.length === 0) continue;
    const ss = crossings.map((c) => projectSegmentParam(lane, c.segmentIndex, c.t));
    hit = mergeInterval(hit, { startS: Math.min(...ss), endS: Math.max(...ss) });
  }
  return hit ? { intersects: true, laneInterval: hit } : { intersects: false };
}

/** 几何检测分发器（pairTable 的"算"函数；emit 在 reconcile 主流程里走） */
export function detectPair(lane: LaneEntity, other: MapEntity, rule: PairRule): PairGeoHit {
  const centerline = getCenterline(lane);
  if (centerline.length < 2) return { intersects: false };
  if (rule.geometry === 'polygon') return detectPolygonHit(lane, centerline, other);
  if (rule.geometry === 'stopLines')
    return detectLineGroupHit(lane, centerline, getStopLines(other));
  return detectLineGroupHit(lane, centerline, getPolylines(other));
}

function laneIntervalFromCrossings(
  lane: LaneEntity,
  crossings: SegmentParam[],
): { startS: number; endS: number } {
  const total = laneArcLength(lane);
  const points = getCenterline(lane);
  if (crossings.length === 0) return { startS: 0, endS: total };
  const first = crossings[0]!;
  const last = crossings[crossings.length - 1]!;
  const s0 = projectSegmentParam(lane, first.segmentIndex, first.t);
  const s1 = projectSegmentParam(lane, last.segmentIndex, last.t);
  return { startS: Math.min(s0, s1), endS: Math.max(s0, s1) };
  void points; // silence unused
}

function polylinePolylineCrossings(a: readonly GeoPoint[], b: readonly GeoPoint[]): SegmentParam[] {
  const out: SegmentParam[] = [];
  for (let i = 0; i < a.length - 1; i++) {
    const a1 = a[i]!;
    const a2 = a[i + 1]!;
    for (let j = 0; j < b.length - 1; j++) {
      const b1 = b[j]!;
      const b2 = b[j + 1]!;
      const r = { x: a2.x - a1.x, y: a2.y - a1.y };
      const s = { x: b2.x - b1.x, y: b2.y - b1.y };
      const denom = r.x * s.y - r.y * s.x;
      if (Math.abs(denom) < 1e-12) continue;
      const dx = b1.x - a1.x;
      const dy = b1.y - a1.y;
      const t = (dx * s.y - dy * s.x) / denom;
      const u = (dx * r.y - dy * r.x) / denom;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      out.push({ segmentIndex: i, t });
    }
  }
  return out;
}

/** lane × lane（仅在同一 junction 内）— 单独走，不走通用 PAIR_RULES */
export function detectLaneLanePair(
  laneA: LaneEntity,
  laneB: LaneEntity,
  cosLat: number,
): PairGeoHit {
  if (!laneA.junctionId || laneA.junctionId !== laneB.junctionId) return { intersects: false };
  const centerA = getCenterline(laneA);
  const centerB = getCenterline(laneB);
  if (centerA.length < 2 || centerB.length < 2) return { intersects: false };

  const aStart = centerA[0]!;
  const aEnd = centerA[centerA.length - 1]!;
  const bStart = centerB[0]!;
  const bEnd = centerB[centerB.length - 1]!;
  const TOL_M = 0.5;
  const mergeAtEnd = endpointsCoincide(aEnd, bEnd, cosLat, TOL_M);
  const mergeAtStart = endpointsCoincide(aStart, bStart, cosLat, TOL_M);
  const isMerge = mergeAtEnd || mergeAtStart;

  if (!polylinesIntersect(centerA, centerB) && !isMerge) return { intersects: false };
  const crossings = polylinePolylineCrossings(centerA, centerB);
  const total = laneArcLength(laneA);
  const interval =
    crossings.length > 0 ? laneIntervalFromCrossings(laneA, crossings) : { startS: 0, endS: total };
  return { intersects: true, laneInterval: interval, isMerge };
}

export function emitLaneLaneObjects(
  laneA: LaneEntity,
  laneB: LaneEntity,
  hitForA: PairGeoHit,
  hitForB: PairGeoHit,
): ObjectOverlapInfo[] {
  return [laneOverlapInfo(laneA, hitForA), laneOverlapInfo(laneB, hitForB)];
}
