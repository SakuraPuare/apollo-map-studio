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
 *   - junctionId：lane 中心线与 junction.polygon **几何相交**（端点在内 OR
 *     任一段穿越多边形边）。与 overlap pipeline 的「centerline × polygon」判定
 *     对齐，避免 lane.junctionId 与 OverlapEntity{lane,junction} 自相矛盾。
 *   - L/R neighbors (fwd/rev)：相邻 lane 的起终点纵向偏移 < 1.5m，
 *     横向距离 ∈ [1, 6] m（典型车道 3.5m，留缓冲），方向 dot 阈值 ±0.95。
 *
 * 性能：O(N²)，1000 lane 量级 < 10ms；不构建持久索引以避开"陈旧索引"问题。
 */
import type { JunctionEntity, LaneEntity } from '@/types/apollo';
import type { GeoPoint, MapEntity } from '@/types/entities';
import { METERS_PER_DEGREE } from '@/config/mapConstants';
import { pointInPolygon } from './hitTest';
import { curvePoints } from './apolloCompile/laneBoundaryGeometry';
import { SpatialIndex } from '@/core/elements/overlap/spatialIndex';
import { bboxOfPoints } from '@/core/elements/overlap/intersect';

/** 段相交（cross product 法），共线视为不相交 */
function segmentsCross(
  a1x: number,
  a1y: number,
  a2x: number,
  a2y: number,
  b1x: number,
  b1y: number,
  b2x: number,
  b2y: number,
): boolean {
  const rx = a2x - a1x;
  const ry = a2y - a1y;
  const sx = b2x - b1x;
  const sy = b2y - b1y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return false;
  const dx = b1x - a1x;
  const dy = b1y - a1y;
  const t = (dx * sy - dy * sx) / denom;
  const u = (dx * ry - dy * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * 折线是否与多边形相交（任一端点在内 OR 任一段穿越多边形边）。
 * 与 core/elements/overlap/intersect.ts 同义；此处内联避免跨模块循环依赖
 * （laneTopology 是 geometry 层，overlap 是 elements 层）。
 */
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
      const b1 = polygon[k]!;
      const b2 = polygon[j]!;
      if (segmentsCross(a1[0], a1[1], a2[0], a2[1], b1[0], b1[1], b2[0], b2[1])) {
        return true;
      }
    }
  }
  return false;
}

/** 与 applyLaneJunctions 渲染端的 toFixed(6) 相同 → 1cm 量级。 */
const COORD_KEY_PRECISION = 6;

/** Neighbor 几何阈值（米） */
const NEIGHBOR_MIN_LATERAL_M = 1.0;
const NEIGHBOR_MAX_LATERAL_M = 8.0;
/** 两条 lane 的纵向投影必须互相覆盖至少 50%（按短的那条算） */
const NEIGHBOR_MIN_OVERLAP_RATIO = 0.5;
const NEIGHBOR_QUERY_PADDING_M = 12;

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

export interface LaneTopologyIncrementalOptions {
  dirtyIds: ReadonlySet<string>;
  previousEntities?: ReadonlyMap<string, MapEntity>;
}

interface NeighborBuckets {
  lF: string[];
  rF: string[];
  lR: string[];
  rR: string[];
}

/** pred/succ：端点 1cm 精度共享坐标的 lane（排除自身）。 */
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

/** selfReverse：B 是 A 的反向孪生 ⇔ B.end == A.start 且 B.start == A.end。 */
function deriveSelfReverse(
  lane: LaneEntity,
  s: GeoPoint,
  t: GeoPoint,
  endsByKey: ReadonlyMap<string, Endpoint[]>,
  lanesById: ReadonlyMap<string, LaneEntity>,
  laneGeometry: ReadonlyMap<string, LaneGeometry>,
): string[] {
  const sKey = endpointKey(s.x, s.y);
  const tKey = endpointKey(t.x, t.y);
  const reverseCandidates = (endsByKey.get(sKey) ?? []).filter((ep) => ep.laneId !== lane.id);
  return Array.from(
    new Set(
      reverseCandidates
        .filter((ep) => {
          const other = lanesById.get(ep.laneId);
          if (!other) return false;
          const os = laneGeometry.get(other.id)?.start;
          return !!os && endpointKey(os.x, os.y) === tKey;
        })
        .map((ep) => ep.laneId),
    ),
  );
}

/**
 * lane 中心线与 junction.polygon 几何相交（端点在内 OR 任一段穿越边）→
 * 视为属于该 junction。与 overlap pipeline 的判定对齐，避免 lane.junctionId
 * 与自动派生的 OverlapEntity{lane,junction} 拓扑自相矛盾。
 */
function deriveJunctionId(
  centerline: readonly GeoPoint[],
  junctionPolygons: readonly { id: string; polygon: [number, number][] }[],
): string | null {
  const centralLine: [number, number][] = centerline.map((p) => [p.x, p.y]);
  for (const j of junctionPolygons) {
    if (j.polygon.length < 3) continue;
    if (polylineHitsPolygon(centralLine, j.polygon)) return j.id;
  }
  return null;
}

/** A lane 在自己的局部 frame 下，分类 neighbor 用到的全部派生量。 */
interface NeighborFrame {
  /** A 起点 lng/lat（用于把 B 的端点投到 A 的局部空间） */
  s: GeoPoint;
  frame: LocalFrame;
  /** A 在自己 frame 下的纵向长度 */
  aLen: number;
  /** A 的左法向 = (-uy, ux) */
  lxA: number;
  lyA: number;
}

interface LaneGeometry {
  start: GeoPoint;
  end: GeoPoint;
  centerline: GeoPoint[];
}

/**
 * 对单条 other lane 在 A 的局部 frame 下做 (forward, left) 分类。
 * 返回 null 表示不构成 neighbor（方向不平行 / 重叠不足 / 横向超界）。
 */
function classifyNeighbor(
  ctx: NeighborFrame,
  other: LaneEntity,
  otherGeometry: LaneGeometry,
): { isForward: boolean; isLeft: boolean } | null {
  const { s, frame, aLen, lxA, lyA } = ctx;
  const oStart = otherGeometry.start;
  const oEnd = otherGeometry.end;
  const oStartLocal = projectInto(s.x, s.y, oStart);
  const oEndLocal = projectInto(s.x, s.y, oEnd);

  // 1. 方向：B 在 A 局部 frame 下的方向单位向量。
  const dx = oEndLocal.x - oStartLocal.x;
  const dy = oEndLocal.y - oStartLocal.y;
  const bLen = Math.hypot(dx, dy);
  if (bLen < 1e-3) return null;
  const cosTheta = (dx / bLen) * frame.ux + (dy / bLen) * frame.uy;

  let isForward: boolean;
  if (cosTheta > PARALLEL_DOT_THRESHOLD) isForward = true;
  else if (cosTheta < -PARALLEL_DOT_THRESHOLD) isForward = false;
  else return null;

  // 2. 纵向重叠：把 B 的两个端点在 A 的纵向轴上的投影组成区间，
  //    要求与 A 的 [0, aLen] 区间重叠至少 50%（按短的那条算）。
  //    这一抓手取代旧版"端点必须紧对齐"，对齐手绘场景的颗粒度。
  const oStartLon = oStartLocal.x * frame.ux + oStartLocal.y * frame.uy;
  const oEndLon = oEndLocal.x * frame.ux + oEndLocal.y * frame.uy;
  const bLonMin = Math.min(oStartLon, oEndLon);
  const bLonMax = Math.max(oStartLon, oEndLon);
  const overlap = Math.max(0, Math.min(aLen, bLonMax) - Math.max(0, bLonMin));
  const minLen = Math.min(aLen, bLonMax - bLonMin);
  if (minLen < 1e-3 || overlap < NEIGHBOR_MIN_OVERLAP_RATIO * minLen) return null;

  // 3. 横向：B 中点在 A 局部 frame 的横向偏移决定相邻性 + 左右。
  const midBX = (oStartLocal.x + oEndLocal.x) / 2;
  const midBY = (oStartLocal.y + oEndLocal.y) / 2;
  const latMid = midBX * lxA + midBY * lyA;
  const absLat = Math.abs(latMid);
  if (absLat < NEIGHBOR_MIN_LATERAL_M || absLat > NEIGHBOR_MAX_LATERAL_M) return null;

  // 左法向上为正 → B 在 A 左侧。
  return { isForward, isLeft: latMid > 0 };
}

/** ── neighbors (fwd/rev × L/R) ── */
function deriveNeighbors(
  lane: LaneEntity,
  s: GeoPoint,
  frameA: LocalFrame,
  lanes: readonly LaneEntity[],
  frames: ReadonlyMap<string, LocalFrame>,
  laneGeometry: ReadonlyMap<string, LaneGeometry>,
): NeighborBuckets {
  const lF: string[] = [];
  const rF: string[] = [];
  const lR: string[] = [];
  const rR: string[] = [];

  // A 的左法向 = (-uy, ux)（A 朝 +ux 方向，左侧法向 +y）
  const ctx: NeighborFrame = {
    s,
    frame: frameA,
    aLen: Math.hypot(frameA.ex, frameA.ey),
    lxA: -frameA.uy,
    lyA: frameA.ux,
  };

  for (const other of lanes) {
    if (other.id === lane.id) continue;
    if (!frames.has(other.id)) continue;
    const otherGeometry = laneGeometry.get(other.id);
    if (!otherGeometry) continue;
    const cls = classifyNeighbor(ctx, other, otherGeometry);
    if (!cls) continue;
    if (cls.isForward) {
      if (cls.isLeft) lF.push(other.id);
      else rF.push(other.id);
    } else {
      if (cls.isLeft) lR.push(other.id);
      else rR.push(other.id);
    }
  }

  return {
    lF: Array.from(new Set(lF)),
    rF: Array.from(new Set(rF)),
    lR: Array.from(new Set(lR)),
    rR: Array.from(new Set(rR)),
  };
}

function metersToLngDegrees(meters: number, latDeg: number): number {
  const cosLat = Math.max(0.01, Math.abs(Math.cos((latDeg * Math.PI) / 180)));
  return meters / (METERS_PER_DEGREE * cosLat);
}

function paddedLaneBBoxFromBBox(
  bbox: NonNullable<ReturnType<typeof bboxOfPoints>>,
  refLat: number,
  paddingM: number,
) {
  const dx = metersToLngDegrees(paddingM, refLat);
  const dy = paddingM / METERS_PER_DEGREE;
  return {
    minX: bbox.minX - dx,
    minY: bbox.minY - dy,
    maxX: bbox.maxX + dx,
    maxY: bbox.maxY + dy,
  };
}

interface TopologyIndices {
  lanes: LaneEntity[];
  laneGeometry: Map<string, LaneGeometry>;
  frames: Map<string, LocalFrame>;
  startsByKey: Map<string, Endpoint[]>;
  endsByKey: Map<string, Endpoint[]>;
  junctionPolygons: { id: string; polygon: [number, number][] }[];
  junctionById: Map<string, { id: string; polygon: [number, number][]; order: number }>;
  junctionIndex: SpatialIndex;
  lanesById: Map<string, LaneEntity>;
  laneIndex: SpatialIndex;
}

function geometryForLane(lane: LaneEntity): LaneGeometry | null {
  const centerline = curvePoints(lane.centralCurve);
  const start = centerline[0] ?? null;
  const end = centerline[centerline.length - 1] ?? null;
  if (!start || !end) return null;
  return { start, end, centerline };
}

/** 1+2 阶段：收集 lane / junction、构 frame、端点倒排索引、junction polygon。 */
function buildTopologyIndices(entities: ReadonlyMap<string, MapEntity>): TopologyIndices {
  const lanes: LaneEntity[] = [];
  const laneGeometry = new Map<string, LaneGeometry>();
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
    const geometry = geometryForLane(lane);
    if (!geometry) continue;
    const { start: s, end: t } = geometry;
    lanes.push(lane);
    laneGeometry.set(lane.id, geometry);
    startEndpoints.push({ laneId: lane.id, isStart: true, x: s.x, y: s.y });
    endEndpoints.push({ laneId: lane.id, isStart: false, x: t.x, y: t.y });
    const frame = buildLocalFrame(s, t);
    if (frame) frames.set(lane.id, frame);
  }

  // 端点 → lane 倒排索引，给 pred/succ 和 selfReverse 用。
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
  const junctionById = new Map<
    string,
    { id: string; polygon: [number, number][]; order: number }
  >();
  for (let i = 0; i < junctionPolygons.length; i++) {
    const junction = junctionPolygons[i]!;
    junctionById.set(junction.id, { ...junction, order: i });
  }

  const lanesById = new Map<string, LaneEntity>();
  for (const lane of lanes) lanesById.set(lane.id, lane);

  const laneIndex = new SpatialIndex();
  laneIndex.build(new Map(lanes.map((lane) => [lane.id, lane])));
  const junctionIndex = new SpatialIndex();
  junctionIndex.build(new Map(junctions.map((junction) => [junction.id, junction])));

  return {
    lanes,
    laneGeometry,
    frames,
    startsByKey,
    endsByKey,
    junctionPolygons,
    junctionById,
    junctionIndex,
    lanesById,
    laneIndex,
  };
}

function addEndpointPeers(indices: TopologyIndices, point: GeoPoint, affected: Set<string>) {
  const key = endpointKey(point.x, point.y);
  for (const ep of indices.startsByKey.get(key) ?? []) affected.add(ep.laneId);
  for (const ep of indices.endsByKey.get(key) ?? []) affected.add(ep.laneId);
}

function addSpatialLanePeers(
  indices: TopologyIndices,
  geometry: LaneGeometry,
  affected: Set<string>,
) {
  const bbox = bboxOfPoints(geometry.centerline);
  if (!bbox) return;
  const padded = paddedLaneBBoxFromBBox(bbox, geometry.start.y, NEIGHBOR_QUERY_PADDING_M);
  for (const node of indices.laneIndex.queryBBox(padded)) affected.add(node.id);
}

function addJunctionLanePeers(
  indices: TopologyIndices,
  junction: JunctionEntity,
  affected: Set<string>,
) {
  const bbox = bboxOfPoints(junction.polygon.points);
  if (!bbox) return;
  for (const node of indices.laneIndex.queryBBox(bbox)) affected.add(node.id);
}

function collectAffectedLanes(
  indices: TopologyIndices,
  dirtyIds: ReadonlySet<string>,
  previousEntities?: ReadonlyMap<string, MapEntity>,
): Set<string> {
  const affected = new Set<string>();
  const dirtyJunctionIds = new Set<string>();

  for (const id of dirtyIds) {
    const current = indices.lanesById.get(id);
    const previous = previousEntities?.get(id);

    if (current) {
      affected.add(current.id);
      const geometry = indices.laneGeometry.get(current.id);
      if (geometry) {
        addEndpointPeers(indices, geometry.start, affected);
        addEndpointPeers(indices, geometry.end, affected);
        addSpatialLanePeers(indices, geometry, affected);
      }
    }

    if (previous?.entityType === 'lane') {
      affected.add(previous.id);
      const geometry = geometryForLane(previous);
      if (geometry) {
        addEndpointPeers(indices, geometry.start, affected);
        addEndpointPeers(indices, geometry.end, affected);
        addSpatialLanePeers(indices, geometry, affected);
      }
    }

    const previousJunction = previous?.entityType === 'junction' ? previous : null;
    if (previousJunction) {
      dirtyJunctionIds.add(previousJunction.id);
      addJunctionLanePeers(indices, previousJunction, affected);
    }
  }

  for (const id of dirtyIds) {
    const junction = indices.junctionById.get(id);
    if (junction) {
      dirtyJunctionIds.add(id);
      const entity = {
        id: junction.id,
        entityType: 'junction',
        polygon: { points: junction.polygon.map(([x, y]) => ({ x, y })) },
        overlapIds: [],
      } as JunctionEntity;
      addJunctionLanePeers(indices, entity, affected);
    }
  }

  if (dirtyJunctionIds.size > 0) {
    for (const lane of indices.lanes) {
      if (lane.junctionId && dirtyJunctionIds.has(lane.junctionId)) affected.add(lane.id);
    }
  }

  return affected;
}

function deriveChangesForLanes(
  indices: TopologyIndices,
  laneIds: Iterable<string>,
): Map<string, LaneEntity> {
  const changes = new Map<string, LaneEntity>();
  for (const laneId of laneIds) {
    const lane = indices.lanesById.get(laneId);
    if (!lane) continue;
    const geom = indices.laneGeometry.get(lane.id);
    if (!geom) continue;
    const { start: s, end: t } = geom;

    const { pred: newPred, succ: newSucc } = derivePredSucc(
      lane,
      s,
      t,
      indices.startsByKey,
      indices.endsByKey,
    );
    const newSelfReverse = deriveSelfReverse(
      lane,
      s,
      t,
      indices.endsByKey,
      indices.lanesById,
      indices.laneGeometry,
    );

    const laneBBox = bboxOfPoints(geom.centerline);
    const candidateJunctions =
      laneBBox && indices.junctionPolygons.length > 0
        ? indices.junctionIndex
            .queryBBox(laneBBox)
            .map((n) => indices.junctionById.get(n.id))
            .filter((j): j is { id: string; polygon: [number, number][]; order: number } => !!j)
            .sort((a, b) => a.order - b.order)
        : [];
    const newJunctionId = deriveJunctionId(geom.centerline, candidateJunctions);

    const frameA = indices.frames.get(lane.id);
    const neighborBBox =
      frameA && laneBBox
        ? paddedLaneBBoxFromBBox(laneBBox, geom.start.y, NEIGHBOR_QUERY_PADDING_M)
        : null;
    const neighborCandidates = neighborBBox
      ? indices.laneIndex
          .queryBBox(neighborBBox)
          .map((n) => indices.lanesById.get(n.id))
          .filter((e): e is LaneEntity => !!e && e.id !== lane.id)
      : [];
    const neighbors: NeighborBuckets = frameA
      ? deriveNeighbors(lane, s, frameA, neighborCandidates, indices.frames, indices.laneGeometry)
      : { lF: [], rF: [], lR: [], rR: [] };
    const { lF: newLF, rF: newRF, lR: newLR, rR: newRR } = neighbors;

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

  return changes;
}

/**
 * 扫描所有 lane + junction，从几何上重算所有 lane 的拓扑字段：
 * predecessor / successor / selfReverse / junctionId / 4 个 neighbor 数组。
 *
 * 不修改：overlapIds（语义是冲突区域，由专门的 overlap 抓手维护）、
 *        leftSamples/rightSamples 等纯几何派生字段（由 derive 引擎管）。
 */
export function reconcileLaneTopology(entities: ReadonlyMap<string, MapEntity>): LaneTopologyDiff {
  const indices = buildTopologyIndices(entities);
  return {
    changes: deriveChangesForLanes(
      indices,
      indices.lanes.map((lane) => lane.id),
    ),
  };
}

export function reconcileLaneTopologyIncremental(
  entities: ReadonlyMap<string, MapEntity>,
  options: LaneTopologyIncrementalOptions,
): LaneTopologyDiff {
  if (options.dirtyIds.size === 0) return { changes: new Map() };
  const indices = buildTopologyIndices(entities);
  const affected = collectAffectedLanes(indices, options.dirtyIds, options.previousEntities);
  return { changes: deriveChangesForLanes(indices, affected) };
}
