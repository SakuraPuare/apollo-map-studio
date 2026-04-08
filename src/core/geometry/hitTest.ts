/**
 * 精确碰撞检测：点到线段/多边形的距离计算
 */
import type { LngLat } from '@/core/geometry/interpolate';

/** 点到线段的最近距离 */
function pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 点到折线的最近距离 */
export function pointToPolylineDist(point: LngLat, coords: LngLat[]): number {
  let min = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = pointToSegmentDist(
      point[0], point[1],
      coords[i][0], coords[i][1],
      coords[i + 1][0], coords[i + 1][1],
    );
    if (d < min) min = d;
  }
  return min;
}

/** 点是否在多边形内（射线法） */
export function pointInPolygon(point: LngLat, polygon: LngLat[]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** 点到多边形的距离（内部为 0，外部为到边界的最近距离） */
export function pointToPolygonDist(point: LngLat, polygon: LngLat[]): number {
  if (pointInPolygon(point, polygon)) return 0;
  // 闭合环
  const ring = polygon[0][0] === polygon[polygon.length - 1][0] && polygon[0][1] === polygon[polygon.length - 1][1]
    ? polygon
    : [...polygon, polygon[0]];
  return pointToPolylineDist(point, ring);
}
