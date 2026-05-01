/**
 * Lane connection — pure function.
 *
 * 底层逻辑：
 *   两条 lane 的 4 个端点对组合 (Astart-Bstart, Astart-Bend, Aend-Bstart,
 *   Aend-Bend) 中找几何距离最小的一对，把第一条 lane 的对应端点平移到
 *   第二条 lane 的对应端点位置（保留第二条 lane 不动）。reconcile 在
 *   addEntity/updateEntity 时自动派生 pred/succ。
 *
 * 方向语义：
 *   - mode 'AendToBstart'  → A.end ≡ B.start → A.successor += B
 *   - mode 'AstartToBend'  → A.start ≡ B.end → A.predecessor += B
 *   - mode 'AstartToBstart' / 'AendToBend' → fork / merge → reconcile 不写入 pred/succ
 *
 * 决策权交给调用方：返回最佳匹配 + 距离 + mode，由调用方决定执行还是
 * 提示用户（例如对 fork/merge 弹确认对话框）。
 */
import type { LaneEntity, SourceDrawInfo } from '@/types/apollo';
import { getSource } from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';
import { polylineLengthMeters } from '@/lib/geo';
import { anchorToRuntime } from './anchorConvert';
import { coordsToPoints, toLngLat } from './coords';
import { cubicBezier, threePointArc } from './interpolate';
import { curvePoints } from './apolloCompile/laneBoundaryGeometry';
import { applyDerive } from '@/core/elements/derive';

const DEG_TO_M = 111320;

export type ConnectionMode = 'AendToBstart' | 'AstartToBend' | 'AstartToBstart' | 'AendToBend';

export interface ConnectionPlan {
  /** Which lane's endpoint moves; the other is the anchor. */
  mode: ConnectionMode;
  /** Distance in meters between the two chosen endpoints. */
  distanceMeters: number;
  /** Whether this connection establishes pred/succ (vs fork/merge). */
  isContinuous: boolean;
  /**
   * Index within A's centerline polyline of the endpoint that moves.
   * The caller feeds this into `applyDrag(a, indexToMove, 'vertex', target)`
   * so the existing source-aware drag pipeline (bezier `_source.anchors`,
   * arc `_source.arcPoints`, polyline) handles all the bookkeeping —
   * including syncing anchors when the underlying lane was drawn with
   * a curve tool.
   */
  indexToMove: number;
  /** Target coordinate (lng/lat) the moving endpoint snaps to. */
  target: GeoPoint;
}

function laneStart(lane: LaneEntity): GeoPoint | null {
  return curvePoints(lane.centralCurve)[0] ?? null;
}

function laneEnd(lane: LaneEntity): GeoPoint | null {
  const pts = curvePoints(lane.centralCurve);
  return pts[pts.length - 1] ?? null;
}

function distMeters(p1: GeoPoint, p2: GeoPoint): number {
  const midLat = (p1.y + p2.y) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const dx = (p2.x - p1.x) * cosLat * DEG_TO_M;
  const dy = (p2.y - p1.y) * DEG_TO_M;
  return Math.hypot(dx, dy);
}

/**
 * Pick the best of 4 endpoint-pair combinations by minimum distance.
 * Returns null when either lane lacks both endpoints (degenerate).
 *
 * The plan tells the caller WHICH of A's endpoints to move and WHERE
 * to move it. Applying the move is delegated to the source-aware
 * `applyDrag` helper so curves drawn with bezier / arc keep their
 * source anchors in sync (otherwise the worker would re-sample the
 * curve from stale anchors and overwrite the endpoint move).
 */
export function planConnection(a: LaneEntity, b: LaneEntity): ConnectionPlan | null {
  const aS = laneStart(a);
  const aE = laneEnd(a);
  const bS = laneStart(b);
  const bE = laneEnd(b);
  if (!aS || !aE || !bS || !bE) return null;

  const aPts = curvePoints(a.centralCurve);
  const aLast = aPts.length - 1;

  const candidates: Array<{
    mode: ConnectionMode;
    distance: number;
    indexToMove: number;
    target: GeoPoint;
  }> = [
    { mode: 'AendToBstart', distance: distMeters(aE, bS), indexToMove: aLast, target: bS },
    { mode: 'AstartToBend', distance: distMeters(aS, bE), indexToMove: 0, target: bE },
    { mode: 'AstartToBstart', distance: distMeters(aS, bS), indexToMove: 0, target: bS },
    { mode: 'AendToBend', distance: distMeters(aE, bE), indexToMove: aLast, target: bE },
  ];
  candidates.sort((x, y) => x.distance - y.distance);
  const best = candidates[0]!;

  return {
    mode: best.mode,
    distanceMeters: best.distance,
    isContinuous: best.mode === 'AendToBstart' || best.mode === 'AstartToBend',
    indexToMove: best.indexToMove,
    target: best.target,
  };
}

/**
 * Move A's connecting endpoint to `plan.target`, keeping the rest of the
 * lane geometry intact and re-syncing curve sources.
 *
 * 底层逻辑：`plan.indexToMove` 是 lane 中心线点位的索引（0 或 N-1）。
 * `applyDrag` 在贝塞尔源分支把这个索引当成 `_source.anchors[index]`
 * 直读，但贝塞尔锚点数 ≪ 中心线采样数，会越界爆 `Cannot read properties
 * of undefined (reading 'x')`。所以 connect 路径单独走一条函数：
 *
 *   - 贝塞尔源：定位首/末锚点，按 dx/dy 整体平移锚点 + 控制柄，
 *     再用 `cubicBezier` 重采样写回中心线，保留 `_source.anchors`。
 *   - 圆弧源：改 `arcPoints[0]` 或 `arcPoints[2]` 后 `threePointArc` 重采样。
 *   - 折线源 / 无源：直接覆写 `centralCurve` 中对应索引点位。
 *
 * 任何分支结束都 `applyDerive(editGeometry)` 一遍，让 lane.length /
 * lane.turn 等派生字段闭环；reconcile 仍由 `updateEntity` 负责。
 */
function isStartIndex(plan: ConnectionPlan): boolean {
  return plan.indexToMove === 0;
}

function shiftAnchor(
  anchor: { point: GeoPoint; handleIn: GeoPoint | null; handleOut: GeoPoint | null },
  target: GeoPoint,
) {
  const dx = target.x - anchor.point.x;
  const dy = target.y - anchor.point.y;
  return {
    point: { ...anchor.point, x: target.x, y: target.y },
    handleIn: anchor.handleIn
      ? { ...anchor.handleIn, x: anchor.handleIn.x + dx, y: anchor.handleIn.y + dy }
      : null,
    handleOut: anchor.handleOut
      ? { ...anchor.handleOut, x: anchor.handleOut.x + dx, y: anchor.handleOut.y + dy }
      : null,
  };
}

function writeCenterline(
  lane: LaneEntity,
  points: GeoPoint[],
  source?: SourceDrawInfo,
): LaneEntity {
  const segs = [...lane.centralCurve.segments];
  segs[0] = { ...segs[0]!, lineSegment: { points } };
  const next: LaneEntity = {
    ...lane,
    centralCurve: { segments: segs },
    length: polylineLengthMeters(points),
  };
  if (source) {
    return { ...next, _source: source } as LaneEntity & { _source: SourceDrawInfo };
  }
  return next;
}

export function applyLaneConnection(lane: LaneEntity, plan: ConnectionPlan): LaneEntity {
  const source = getSource(lane);

  // Bezier source: shift first/last anchor (and its handles), re-sample.
  if (source?.drawTool === 'drawBezier' && source.anchors && source.anchors.length > 0) {
    const anchors = source.anchors.map((a) => ({ ...a }));
    const idx = isStartIndex(plan) ? 0 : anchors.length - 1;
    anchors[idx] = shiftAnchor(anchors[idx]!, plan.target);
    const runtime = anchors.map(anchorToRuntime);
    const newPoints = coordsToPoints(cubicBezier(runtime));
    const next = writeCenterline(lane, newPoints, { ...source, anchors });
    return applyDerive(next, { cause: 'editGeometry', prev: lane }) as LaneEntity;
  }

  // Arc source: replace one of the three control points, re-sample.
  if (source?.drawTool === 'drawArc' && source.arcPoints) {
    const arcPoints = [...source.arcPoints] as [GeoPoint, GeoPoint, GeoPoint];
    const idx = isStartIndex(plan) ? 0 : 2;
    arcPoints[idx] = { ...arcPoints[idx]!, x: plan.target.x, y: plan.target.y };
    const newPoints = coordsToPoints(
      threePointArc(toLngLat(arcPoints[0]), toLngLat(arcPoints[1]), toLngLat(arcPoints[2])),
    );
    const next = writeCenterline(lane, newPoints, { ...source, arcPoints });
    return applyDerive(next, { cause: 'editGeometry', prev: lane }) as LaneEntity;
  }

  // Polyline / unknown source: just overwrite the centerline endpoint.
  const pts = curvePoints(lane.centralCurve);
  if (pts.length === 0) return lane;
  const idx = isStartIndex(plan) ? 0 : pts.length - 1;
  if (idx < 0 || idx >= pts.length) return lane;
  const newPoints = pts.map((p, i) =>
    i === idx ? { ...p, x: plan.target.x, y: plan.target.y } : p,
  );
  const next = writeCenterline(lane, newPoints, source);
  return applyDerive(next, { cause: 'editGeometry', prev: lane }) as LaneEntity;
}
