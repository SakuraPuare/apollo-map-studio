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
import type { LaneEntity } from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';

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
  return lane.centralCurve.segments[0]?.lineSegment.points[0] ?? null;
}

function laneEnd(lane: LaneEntity): GeoPoint | null {
  const pts = lane.centralCurve.segments[0]?.lineSegment.points ?? [];
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

  const aPts = a.centralCurve.segments[0]?.lineSegment.points ?? [];
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

// Apply step deliberately delegated to `entityMutations.applyDrag` — see
// header comment. That helper already handles `_source.anchors` (bezier)
// and `_source.arcPoints` (arc) so a connect operation on a curved lane
// re-samples the curve correctly instead of leaving the source stale
// (which the worker would silently revert on next render).
