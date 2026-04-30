/**
 * Overlap pipeline — lane 通行走廊多边形构造 (Sprint 1, GAP-5).
 *
 * 底层逻辑：从 lane.centralCurve + leftSamples/rightSamples（half-width）
 * 拼出 lane 在地面上占用的真实多边形，作为 region_overlap clipping 的
 * subject 多边形。
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
import { offsetPolylineDeg } from '@/core/geometry/apolloCompile/offsetPolyline';
import { DEFAULT_LANE_HALF_WIDTH } from '@/config/mapConstants';
import { getCenterline } from './geometryAdapters';

/**
 * 构造 lane 在地面投影的封闭走廊多边形.
 *
 * 算法：left offset + right offset.reverse() + close-ring
 *   1. 左边界：centerline 向左 offset half-leftWidth
 *   2. 右边界：centerline 向右 offset half-rightWidth
 *   3. 环 = [left..., right.reverse()..., left[0]]（闭合）
 *
 * centerline < 2 点 / 任一 width <= 0 → 返回 []（不是合法多边形）.
 */
export function laneCorridorPolygon(lane: LaneEntity): GeoPoint[] {
  const centerline = getCenterline(lane);
  if (centerline.length < 2) return [];

  const leftWidth = lane.leftSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
  const rightWidth = lane.rightSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
  if (leftWidth <= 0 || rightWidth <= 0) return [];

  const leftEdge = offsetPolylineDeg(centerline, leftWidth, 'left');
  const rightEdge = offsetPolylineDeg(centerline, rightWidth, 'right');
  if (leftEdge.length < 2 || rightEdge.length < 2) return [];

  const ring: GeoPoint[] = [];
  for (const p of leftEdge) ring.push({ x: p.x, y: p.y });
  for (let i = rightEdge.length - 1; i >= 0; i--) {
    const p = rightEdge[i]!;
    ring.push({ x: p.x, y: p.y });
  }
  // 闭合环：首尾点显式相等，方便下游一致处理
  const first = ring[0]!;
  ring.push({ x: first.x, y: first.y });
  return ring;
}
