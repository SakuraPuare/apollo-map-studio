/**
 * Lane topology reconciliation — pure function.
 *
 * 底层逻辑：从几何上重算 lane 的所有拓扑字段，然后产出最小 diff。
 * 所有 lane 走同一份对称规则，A→B 的边和 B→A 的边由同一判定生成，
 * 所以"双向同步"是几何重算的副产品，不需要主动通知对面。
 *
 * 颗粒度：
 *   - pred/succ：端点 1cm 精度（toFixed(6)）共享坐标。
 *   - selfReverse：B.start ≈ A.end 且 B.end ≈ A.start。
 *   - junctionId：lane 中心线 start 和 end 都落在 junction.polygon 内（射线法）。
 *   - L/R neighbors (fwd/rev)：相邻 lane 的起终点纵向偏移 < 1.5m，
 *     横向距离 ∈ [1, 6] m（典型车道 3.5m，留缓冲），方向 dot 阈值 ±0.95。
 *
 * 性能：O(N²)，1000 lane 量级 < 10ms；不构建持久索引以避开"陈旧索引"问题。
 */
import type { JunctionEntity, LaneEntity } from '@/types/apollo';
import type { GeoPoint, MapEntity } from '@/types/entities';
import { pointInPolygon } from './hitTest';

/** 与 applyLaneJunctions 渲染端的 toFixed(6) 相同 → 1cm 量级。 */
const COORD_KEY_PRECISION = 6;

/** 米/度（纬度方向恒定；经度方向需乘 cos(lat)）。WGS84 子午线长度的 1/360。 */
const METERS_PER_DEGREE = 111_319.5;

/** Neighbor 几何阈值（米） */
const NEIGHBOR_MIN_LATERAL_M = 1.0;
const NEIGHBOR_MAX_LATERAL_M = 8.0;
/** 两条 lane 的纵向投影必须互相覆盖至少 50%（按短的那条算） */
const NEIGHBOR_MIN_OVERLAP_RATIO = 0.5;

/** 平行/反平行判定：cos(18°) ≈ 0.95 */
const PARALLEL_DOT_THRESHOLD = 0.95;

interface Endpoint {
  laneId: string;
  isStart: boolean;
  /** 投影前的原始 lng/lat（用于 hash key 一致性） */
  x: number;
  y: number;
}

interface LocalFrame {
  /** 起点（米） */
  sx: number;
  sy: number;
  /** 终点（米） */
  ex: number;
  ey: number;
  /** 方向单位向量 */
  ux: number;
  uy: number;
}

function endpointKey(x: number, y: number): string {
  return `${x.toFixed(COORD_KEY_PRECISION)},${y.toFixed(COORD_KEY_PRECISION)}`;
}

function laneStart(lane: LaneEntity): GeoPoint | null {
  const pts = lane.centralCurve.segments[0]?.lineSegment.points ?? [];
  return pts[0] ?? null;
}

function laneEnd(lane: LaneEntity): GeoPoint | null {
  const pts = lane.centralCurve.segments[0]?.lineSegment.points ?? [];
  return pts[pts.length - 1] ?? null;
}

/** 数组相等（忽略顺序、去重比较），用于判定是否需要写回。 */
function setEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const id of b) if (!sa.has(id)) return false;
  return sa.size === b.length;
}

/**
 * 把 lane 起终点投影到以起点为原点、ENU 近似的局部米空间。
 * 用 lane.start.y 当参考纬度，cos 误差在车道尺度可忽略。
 */
function buildLocalFrame(start: GeoPoint, end: GeoPoint): LocalFrame | null {
  const cosLat = Math.cos((start.y * Math.PI) / 180);
  const mPerLng = METERS_PER_DEGREE * cosLat;
  const sx = 0;
  const sy = 0;
  const ex = (end.x - start.x) * mPerLng;
  const ey = (end.y - start.y) * METERS_PER_DEGREE;
  const len = Math.hypot(ex - sx, ey - sy);
  if (len < 1e-3) return null; // 退化（首尾重合）
  return { sx, sy, ex, ey, ux: (ex - sx) / len, uy: (ey - sy) / len };
}

/** 把 GeoPoint 投到原点为 (originLng, originLat) 的局部米空间，cos 用原点纬度近似。 */
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

export interface LaneTopologyDiff {
  /** Map<laneId, updated lane>; 仅包含拓扑字段实际变化的 lane。 */
  changes: Map<string, LaneEntity>;
}

/**
 * 扫描所有 lane + junction，从几何上重算所有 lane 的拓扑字段：
 * predecessor / successor / selfReverse / junctionId / 4 个 neighbor 数组。
 *
 * 不修改：overlapIds（语义是冲突区域，由专门的 overlap 抓手维护）、
 *        leftSamples/rightSamples 等纯几何派生字段（由 derive 引擎管）。
 */
export function reconcileLaneTopology(entities: ReadonlyMap<string, MapEntity>): LaneTopologyDiff {
  // 1. 收集 lane / junction，并算每条 lane 的局部 frame。
  const lanes: LaneEntity[] = [];
  const frames = new Map<string, LocalFrame>();
  const startEndpoints: Endpoint[] = [];
  const endEndpoints: Endpoint[] = [];
  const junctions: JunctionEntity[] = [];

  for (const e of entities.values()) {
    if (e.entityType === 'junction') {
      junctions.push(e);
      continue;
    }
    if (e.entityType !== 'lane') continue;
    const lane = e;
    const s = laneStart(lane);
    const t = laneEnd(lane);
    if (!s || !t) continue;
    lanes.push(lane);
    startEndpoints.push({ laneId: lane.id, isStart: true, x: s.x, y: s.y });
    endEndpoints.push({ laneId: lane.id, isStart: false, x: t.x, y: t.y });
    const frame = buildLocalFrame(s, t);
    if (frame) frames.set(lane.id, frame);
  }

  // 2. 端点 → lane 倒排索引，给 pred/succ 和 selfReverse 用。
  const startsByKey = new Map<string, Endpoint[]>();
  const endsByKey = new Map<string, Endpoint[]>();
  for (const ep of startEndpoints) {
    const k = endpointKey(ep.x, ep.y);
    const list = startsByKey.get(k);
    if (list) list.push(ep);
    else startsByKey.set(k, [ep]);
  }
  for (const ep of endEndpoints) {
    const k = endpointKey(ep.x, ep.y);
    const list = endsByKey.get(k);
    if (list) list.push(ep);
    else endsByKey.set(k, [ep]);
  }

  // junction polygon → [lng,lat][] 形式，给 pointInPolygon 用。
  const junctionPolygons = junctions.map((j) => ({
    id: j.id,
    polygon: j.polygon.points.map((p) => [p.x, p.y] as [number, number]),
  }));

  const lanesById = new Map<string, LaneEntity>();
  for (const lane of lanes) lanesById.set(lane.id, lane);

  // 3. 对每条 lane 推导所有拓扑字段。
  const changes = new Map<string, LaneEntity>();
  for (const lane of lanes) {
    const s = laneStart(lane)!;
    const t = laneEnd(lane)!;

    // ── pred/succ ──
    const predHits = (endsByKey.get(endpointKey(s.x, s.y)) ?? []).filter(
      (ep) => ep.laneId !== lane.id,
    );
    const succHits = (startsByKey.get(endpointKey(t.x, t.y)) ?? []).filter(
      (ep) => ep.laneId !== lane.id,
    );
    const newPred = Array.from(new Set(predHits.map((ep) => ep.laneId)));
    const newSucc = Array.from(new Set(succHits.map((ep) => ep.laneId)));

    // ── selfReverse ──
    // B 是 A 的反向孪生 ⇔ B.end == A.start 且 B.start == A.end。
    const sKey = endpointKey(s.x, s.y);
    const tKey = endpointKey(t.x, t.y);
    const reverseCandidates = (endsByKey.get(sKey) ?? []).filter((ep) => ep.laneId !== lane.id);
    const newSelfReverse = Array.from(
      new Set(
        reverseCandidates
          .filter((ep) => {
            const other = lanesById.get(ep.laneId);
            if (!other) return false;
            const os = laneStart(other);
            return !!os && endpointKey(os.x, os.y) === tKey;
          })
          .map((ep) => ep.laneId),
      ),
    );

    // ── junctionId ──
    // 起终点都落在某个 junction 的多边形内 → 视为属于该 junction。
    let newJunctionId: string | null = null;
    for (const j of junctionPolygons) {
      if (j.polygon.length < 3) continue;
      if (pointInPolygon([s.x, s.y], j.polygon) && pointInPolygon([t.x, t.y], j.polygon)) {
        newJunctionId = j.id;
        break;
      }
    }

    // ── neighbors (fwd/rev × L/R) ──
    const lF: string[] = [];
    const rF: string[] = [];
    const lR: string[] = [];
    const rR: string[] = [];
    const frameA = frames.get(lane.id);
    if (frameA) {
      // A 的左法向 = (-uy, ux)（A 朝 +ux 方向，左侧法向 +y）
      const lxA = -frameA.uy;
      const lyA = frameA.ux;
      const aLen = Math.hypot(frameA.ex, frameA.ey);
      for (const other of lanes) {
        if (other.id === lane.id) continue;
        if (!frames.has(other.id)) continue;
        const oStart = laneStart(other)!;
        const oEnd = laneEnd(other)!;
        const oStartLocal = projectInto(s.x, s.y, oStart);
        const oEndLocal = projectInto(s.x, s.y, oEnd);

        // 1. 方向：B 在 A 局部 frame 下的方向单位向量。
        const dx = oEndLocal.x - oStartLocal.x;
        const dy = oEndLocal.y - oStartLocal.y;
        const bLen = Math.hypot(dx, dy);
        if (bLen < 1e-3) continue;
        const cosTheta = (dx / bLen) * frameA.ux + (dy / bLen) * frameA.uy;

        let isForward: boolean;
        if (cosTheta > PARALLEL_DOT_THRESHOLD) isForward = true;
        else if (cosTheta < -PARALLEL_DOT_THRESHOLD) isForward = false;
        else continue;

        // 2. 纵向重叠：把 B 的两个端点在 A 的纵向轴上的投影组成区间，
        //    要求与 A 的 [0, aLen] 区间重叠至少 50%（按短的那条算）。
        //    这一抓手取代旧版"端点必须紧对齐"，对齐手绘场景的颗粒度。
        const oStartLon = oStartLocal.x * frameA.ux + oStartLocal.y * frameA.uy;
        const oEndLon = oEndLocal.x * frameA.ux + oEndLocal.y * frameA.uy;
        const bLonMin = Math.min(oStartLon, oEndLon);
        const bLonMax = Math.max(oStartLon, oEndLon);
        const overlap = Math.max(0, Math.min(aLen, bLonMax) - Math.max(0, bLonMin));
        const minLen = Math.min(aLen, bLonMax - bLonMin);
        if (minLen < 1e-3 || overlap < NEIGHBOR_MIN_OVERLAP_RATIO * minLen) continue;

        // 3. 横向：B 中点在 A 局部 frame 的横向偏移决定相邻性 + 左右。
        const midBX = (oStartLocal.x + oEndLocal.x) / 2;
        const midBY = (oStartLocal.y + oEndLocal.y) / 2;
        const latMid = midBX * lxA + midBY * lyA;
        const absLat = Math.abs(latMid);
        if (absLat < NEIGHBOR_MIN_LATERAL_M || absLat > NEIGHBOR_MAX_LATERAL_M) continue;

        // 左法向上为正 → B 在 A 左侧。
        const isLeft = latMid > 0;
        if (isForward) {
          if (isLeft) lF.push(other.id);
          else rF.push(other.id);
        } else {
          if (isLeft) lR.push(other.id);
          else rR.push(other.id);
        }
      }
    }

    const newLF = Array.from(new Set(lF));
    const newRF = Array.from(new Set(rF));
    const newLR = Array.from(new Set(lR));
    const newRR = Array.from(new Set(rR));

    // ── 写回 diff（任一字段变化即写） ──
    const dirty =
      !setEqual(lane.predecessorIds, newPred) ||
      !setEqual(lane.successorIds, newSucc) ||
      !setEqual(lane.selfReverseLaneIds, newSelfReverse) ||
      lane.junctionId !== newJunctionId ||
      !setEqual(lane.leftNeighborForwardIds, newLF) ||
      !setEqual(lane.rightNeighborForwardIds, newRF) ||
      !setEqual(lane.leftNeighborReverseIds, newLR) ||
      !setEqual(lane.rightNeighborReverseIds, newRR);

    if (dirty) {
      changes.set(lane.id, {
        ...lane,
        predecessorIds: newPred,
        successorIds: newSucc,
        selfReverseLaneIds: newSelfReverse,
        junctionId: newJunctionId,
        leftNeighborForwardIds: newLF,
        rightNeighborForwardIds: newRF,
        leftNeighborReverseIds: newLR,
        rightNeighborReverseIds: newRR,
      });
    }
  }

  return { changes };
}
