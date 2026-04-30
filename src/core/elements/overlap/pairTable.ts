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
import { intersectPolygons, largestRing } from './polyClip';
import { laneCorridorPolygon } from './laneCorridor';

/** 几何相交检测的结果（带可选的 lane 上的弧长区间） */
export interface PairGeoHit {
  intersects: boolean;
  /** 在 lane centerline 上的米空间区间（穿越多边形 / 与 stopLine 交点） */
  laneInterval?: { startS: number; endS: number };
  /** lane×lane 时的端点重合标记（合流 / 分流） */
  isMerge?: boolean;
  /**
   * GAP-5: lane corridor 与对手多边形的精确相交区域（lng/lat 闭合环，最大块）.
   * 仅在 PairRule.computeRegion 标记的对子上生成（当前 = crosswalk）.
   * 由 reconcile 主流程消费 → 派生 RegionOverlapInfo + 双向 regionOverlapId.
   */
  regionPolygon?: GeoPoint[];
}

/**
 * 与 lane 配对的次实体类型 → 几何检测策略.
 * geometry 决定走哪个相交分支；emitObjects 输出 ObjectOverlapInfo[].
 *
 * emitObjects 的 opts.regionId（GAP-5 Sprint 2）：当 hit.regionPolygon 存在时
 * reconcile 会基于 overlap 派生 id 算出稳定的 region id 传入；emitter 把它
 * 嵌到 lane.laneOverlapInfo.regionOverlapId（任何对子）和 crosswalk
 * 一侧的 ObjectOverlapInfo.regionOverlapId（仅 crosswalk 对子）。
 */
export interface PairRule {
  secondaryType: MapEntity['entityType'];
  /** 'polygon' | 'stopLines' | 'polylines' | 'lane' */
  geometry: 'polygon' | 'stopLines' | 'polylines' | 'lane';
  /** 是否为该对子计算 lane corridor × secondary.polygon 的精确相交区域 */
  computeRegion?: boolean;
  emitObjects(
    lane: LaneEntity,
    other: MapEntity,
    hit: PairGeoHit,
    opts?: { regionId?: string },
  ): ObjectOverlapInfo[];
}

function laneOverlapInfo(
  lane: LaneEntity,
  hit: PairGeoHit,
  opts?: { regionId?: string },
): ObjectOverlapInfo {
  const interval = hit.laneInterval ?? { startS: 0, endS: laneArcLength(lane) };
  const info: ObjectOverlapInfo = {
    objectType: 'lane',
    objectId: lane.id,
    laneOverlapInfo: {
      startS: interval.startS,
      endS: interval.endS,
      isMerge: hit.isMerge,
    },
  };
  if (opts?.regionId) info.laneOverlapInfo.regionOverlapId = opts.regionId;
  return info;
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
    computeRegion: true,
    emitObjects: (lane, other, hit, opts) => {
      const cw: ObjectOverlapInfo = { objectType: 'crosswalk', objectId: other.id };
      if (opts?.regionId) cw.regionOverlapId = opts.regionId;
      return [laneOverlapInfo(lane, hit, opts), cw];
    },
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

/**
 * GAP-5 Sprint 2: lane corridor × secondary.polygon → 精确相交区域.
 *
 * 取面积最大的那一块（多块时；对正常 crosswalk × lane 几乎都是单块）。
 * 任一退化输入或求交失败 → 返回 undefined（hit.regionPolygon 不写）。
 */
function computeRegionPolygon(lane: LaneEntity, other: MapEntity): GeoPoint[] | undefined {
  const poly = getPolygon(other);
  if (!poly || poly.length < 3) return undefined;
  const corridor = laneCorridorPolygon(lane);
  if (corridor.length < 3) return undefined;
  const pieces = intersectPolygons(corridor, poly);
  const ring = largestRing(pieces);
  return ring ?? undefined;
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
  if (rule.geometry === 'polygon') {
    const hit = detectPolygonHit(lane, centerline, other);
    if (hit.intersects && rule.computeRegion) {
      const region = computeRegionPolygon(lane, other);
      if (region) return { ...hit, regionPolygon: region };
    }
    return hit;
  }
  if (rule.geometry === 'stopLines')
    return detectLineGroupHit(lane, centerline, getStopLines(other));
  return detectLineGroupHit(lane, centerline, getPolylines(other));
}

function laneIntervalFromCrossings(
  lane: LaneEntity,
  crossings: SegmentParam[],
): { startS: number; endS: number } {
  const total = laneArcLength(lane);
  if (crossings.length === 0) return { startS: 0, endS: total };
  const first = crossings[0]!;
  const last = crossings[crossings.length - 1]!;
  const s0 = projectSegmentParam(lane, first.segmentIndex, first.t);
  const s1 = projectSegmentParam(lane, last.segmentIndex, last.t);
  return { startS: Math.min(s0, s1), endS: Math.max(s0, s1) };
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

/**
 * lane × lane — 单独走，不走通用 PAIR_RULES.
 *
 * 触发分支（GAP-2 修订）：
 *   1. 同一 junction 内：穿越 / 端点合流 / 端点分流 都计为 overlap（路口
 *      内部的轨迹冲突）。
 *   2. junction 外：仅当中心线**真实穿越**（segments 相交）才计 overlap，
 *      端点重合是 succ/pred 拓扑链接，**不**算 overlap。这一条挡掉了高速
 *      ramp 等 junction 外几何穿越场景被漏算的 bug。
 *
 * cosLat（GAP-8）：弃用入参，改用 laneA 起点纬度的局部 cosLat，避免大范围
 * 跨纬度地图用全图均值导致的米空间偏差。
 */
export function detectLaneLanePair(
  laneA: LaneEntity,
  laneB: LaneEntity,
  _cosLat?: number,
): PairGeoHit {
  void _cosLat; // 签名向后兼容；内部以 laneA 起点局部 cosLat 计算
  const centerA = getCenterline(laneA);
  const centerB = getCenterline(laneB);
  if (centerA.length < 2 || centerB.length < 2) return { intersects: false };

  const aStart = centerA[0]!;
  const aEnd = centerA[centerA.length - 1]!;
  const bStart = centerB[0]!;
  const bEnd = centerB[centerB.length - 1]!;
  const localCosLat = Math.cos((aStart.y * Math.PI) / 180) || 1;
  const TOL_M = 0.5;
  const mergeAtEnd = endpointsCoincide(aEnd, bEnd, localCosLat, TOL_M);
  const mergeAtStart = endpointsCoincide(aStart, bStart, localCosLat, TOL_M);
  const aEndBStart = endpointsCoincide(aEnd, bStart, localCosLat, TOL_M);
  const aStartBEnd = endpointsCoincide(aStart, bEnd, localCosLat, TOL_M);
  const anyEndpointTouch = mergeAtEnd || mergeAtStart || aEndBStart || aStartBEnd;
  // GAP-7: Apollo `LaneOverlapInfo.is_merge` 语义是「车道汇入冲突区域」。
  // 端点尾部重合 → 真合流；端点头部重合 → 分流（split），不是 merge。
  const isMerge = mergeAtEnd;

  const sameJunction = laneA.junctionId !== null && laneA.junctionId === laneB.junctionId;
  const crosses = polylinesIntersect(centerA, centerB);

  let hits = false;
  if (sameJunction) {
    // junction 内：穿越 / 端点合流（merge）/ 端点分流（split）都算 ——
    // 路口内同源同汇的车道之间存在轨迹冲突，无论几何是否真的相交。
    hits = crosses || mergeAtEnd || mergeAtStart;
  } else {
    // junction 外：要求真实穿越且**不**是单纯端点共享。端点共享（4 种组合：
    // start-start fork / end-end merge / end-start succ / start-end 反 succ）
    // 都属于 pred/succ 或 selfReverse 拓扑关系，由 laneTopology 维护，不进
    // overlap 表。「内部穿越且端点也碰巧重合」是退化场景，统一归到拓扑层处理。
    hits = crosses && !anyEndpointTouch;
  }
  if (!hits) return { intersects: false };

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
