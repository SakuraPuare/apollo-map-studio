/**
 * Lane connection — pure function.
 *
 * 底层逻辑：
 *   Connect mode is click-order driven: click lane A, then lane B. The first
 *   lane's forward end (driving-direction head) moves to the second lane's
 *   forward start (driving-direction tail). The second lane stays fixed, and
 *   reconcile derives pred/succ when `updateEntity` writes the changed lane.
 *
 * 方向语义：
 *   - mode 'AendToBstart' → A.end ≡ B.start → A.successor += B
 */
import type {
  LaneEntity,
  SourceArcInfo,
  SourceBezierInfo,
  SourceCatmullRomInfo,
  SourceDrawInfo,
} from '@/types/apollo';
import { getSource } from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';
import { polylineLengthMeters } from '@/lib/geo';
import { anchorToRuntime } from './anchorConvert';
import { coordsToPoints, toLngLat } from './coords';
import { catmullRom, cubicBezier, threePointArc } from './interpolate';
import { curvePoints } from './apolloCompile/laneBoundaryGeometry';
import { applyDerive } from '@/core/elements/derive';

const DEG_TO_M = 111320;

type ConnectionMode = 'AendToBstart' | 'AstartToBend' | 'AstartToBstart' | 'AendToBend';

export interface ConnectionPlan {
  /** Which lane's endpoint moves; the other is the anchor. */
  mode: ConnectionMode;
  /** Distance in meters between the two chosen endpoints. */
  distanceMeters: number;
  /** Whether this connection establishes pred/succ. Connect mode plans always do. */
  isContinuous: boolean;
  /**
   * Index within A's centerline polyline of the endpoint that moves.
   * `applyLaneConnection` uses this endpoint index to preserve source-aware
   * geometry bookkeeping for bezier anchors, arc points, and polylines.
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
 * Build the deterministic click-order connection plan.
 * Returns null when either lane lacks the needed endpoint (degenerate).
 *
 * The plan tells the caller WHICH of A's endpoints to move and WHERE
 * to move it. Applying the move is delegated to `applyLaneConnection`
 * so curves drawn with bezier / arc keep their source anchors in sync.
 */
export function planConnection(a: LaneEntity, b: LaneEntity): ConnectionPlan | null {
  const aE = laneEnd(a);
  const bS = laneStart(b);
  if (!aE || !bS) return null;

  const aPts = curvePoints(a.centralCurve);
  const aLast = aPts.length - 1;

  return {
    mode: 'AendToBstart',
    distanceMeters: distMeters(aE, bS),
    isContinuous: true,
    indexToMove: aLast,
    target: bS,
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
 *   - Catmull-Rom 源：改 `points[0]` 或 `points[last]` 后 `catmullRom` 重采样。
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

  if (source?.drawTool === 'drawBezier' && source.anchors && source.anchors.length > 0) {
    return applyBezierSourceConnection(lane, source, plan);
  }

  if (source?.drawTool === 'drawArc' && source.arcPoints) {
    return applyArcSourceConnection(lane, source, plan);
  }

  if (source?.drawTool === 'drawCatmullRom' && source.points.length > 0) {
    return applyCatmullRomSourceConnection(lane, source, plan);
  }

  return applyPolylineConnection(lane, source, plan);
}

function applyBezierSourceConnection(
  lane: LaneEntity,
  source: SourceBezierInfo,
  plan: ConnectionPlan,
): LaneEntity {
  const anchors = source.anchors.map((a) => ({ ...a }));
  const idx = isStartIndex(plan) ? 0 : anchors.length - 1;
  anchors[idx] = shiftAnchor(anchors[idx]!, plan.target);
  const runtime = anchors.map(anchorToRuntime);
  const newPoints = coordsToPoints(cubicBezier(runtime));
  const next = writeCenterline(lane, newPoints, { ...source, anchors });
  return applyDerive(next, { cause: 'editGeometry', prev: lane }) as LaneEntity;
}

function applyArcSourceConnection(
  lane: LaneEntity,
  source: SourceArcInfo,
  plan: ConnectionPlan,
): LaneEntity {
  const arcPoints = [...source.arcPoints] as [GeoPoint, GeoPoint, GeoPoint];
  const idx = isStartIndex(plan) ? 0 : 2;
  arcPoints[idx] = { ...arcPoints[idx]!, x: plan.target.x, y: plan.target.y };
  const newPoints = coordsToPoints(
    threePointArc(toLngLat(arcPoints[0]), toLngLat(arcPoints[1]), toLngLat(arcPoints[2])),
  );
  const next = writeCenterline(lane, newPoints, { ...source, arcPoints });
  return applyDerive(next, { cause: 'editGeometry', prev: lane }) as LaneEntity;
}

function applyCatmullRomSourceConnection(
  lane: LaneEntity,
  source: SourceCatmullRomInfo,
  plan: ConnectionPlan,
): LaneEntity {
  const points = source.points.map((p) => ({ ...p }));
  const idx = isStartIndex(plan) ? 0 : points.length - 1;
  points[idx] = { ...points[idx]!, x: plan.target.x, y: plan.target.y };
  const newPoints = coordsToPoints(catmullRom(points.map(toLngLat)));
  const next = writeCenterline(lane, newPoints, { ...source, points });
  return applyDerive(next, { cause: 'editGeometry', prev: lane }) as LaneEntity;
}

function applyPolylineConnection(
  lane: LaneEntity,
  source: SourceDrawInfo | undefined,
  plan: ConnectionPlan,
): LaneEntity {
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
