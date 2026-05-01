/**
 * Overlap pipeline — lane 通行走廊多边形构造 (Sprint 1, GAP-5).
 *
 * 底层逻辑：导入 Apollo lane 时优先使用 leftBoundary/rightBoundary 的原始
 * 多段线；编辑器新建 lane 没有边界曲线时，再从 lane.centralCurve +
 * leftSamples/rightSamples（half-width）拼出地面占用多边形，作为
 * region_overlap clipping 的 subject 多边形。
 *
 * 抓手：
 *   - 复用 apolloCompile/offsetPolyline 的 offsetPolylineDeg —— 已在仓库
 *     里跑了几个月，处理拐点 miter / bevel 都是稳态。
 *   - leftSamples/rightSamples 现状只取第一个采样点的 width（与 laneJunctions.ts
 *     现有口径对齐）；后续要变宽 lane 再升级到 per-segment 采样。
 *
 * 返回值是闭合环（首尾点重复一次），方便直接喂给 polygon-clipping。
 */
import type { GeoPoint } from '@/types/entities';
import type { LaneEntity } from '@/types/apollo';
import {
  curvePoints,
  explicitLaneBoundaryEdges,
} from '@/core/geometry/apolloCompile/laneBoundaryGeometry';
import { offsetPolylineDeg } from '@/core/geometry/apolloCompile/offsetPolyline';
import { DEFAULT_LANE_HALF_WIDTH } from '@/config/mapConstants';

function closeRing(leftEdge: GeoPoint[], rightEdge: GeoPoint[]): GeoPoint[] {
  if (leftEdge.length < 2 || rightEdge.length < 2) return [];
  const ring: GeoPoint[] = [];
  for (const p of leftEdge) ring.push({ x: p.x, y: p.y });
  for (let i = rightEdge.length - 1; i >= 0; i--) {
    const p = rightEdge[i]!;
    ring.push({ x: p.x, y: p.y });
  }
  const first = ring[0]!;
  ring.push({ x: first.x, y: first.y });
  return ring;
}

/**
 * 构造 lane 在地面投影的封闭走廊多边形.
 *
 * 算法：left boundary + right boundary.reverse() + close-ring；若没有
 * Apollo 原始边界，则 fallback 到 centerline offset。
 *
 * centerline < 2 点 / 任一 width <= 0 → 返回 []（不是合法多边形）.
 */
export function laneCorridorPolygon(lane: LaneEntity): GeoPoint[] {
  const explicitEdges = explicitLaneBoundaryEdges(lane);
  if (explicitEdges) return closeRing(explicitEdges.left, explicitEdges.right);

  const centerline = curvePoints(lane.centralCurve);
  if (centerline.length < 2) return [];

  const leftWidth = lane.leftSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
  const rightWidth = lane.rightSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
  if (leftWidth <= 0 || rightWidth <= 0) return [];

  const leftEdge = offsetPolylineDeg(centerline, leftWidth, 'left');
  const rightEdge = offsetPolylineDeg(centerline, rightWidth, 'right');
  return closeRing(leftEdge, rightEdge);
}
