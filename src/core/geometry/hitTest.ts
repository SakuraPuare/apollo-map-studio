/**
 * 精确碰撞检测：点到线段/多边形的距离计算
 *
 * `pointToPolylineDistGeo` / `pointToPolygonDistGeo` 是纬度补偿版。caller
 * 传入 midLat 对应的 cosLat，函数内部把 Δlat 乘 1/cosLat 转到 "等效 lng
 * 度空间"，于是返回的 "距离" 和调用端传入的 lng-度半径 (pixelToRadius)
 * 量纲一致，排序也反映真实物理距离。worker hitTest 用这一套。
 *
 * 数学说明：
 *   Web Mercator 每像素 lng 步长 = 360 / (512 * 2^zoom)  （常数，与 lat 无关）
 *   Web Mercator 每像素 lat 步长 = lng 步长 × cos(lat)   （高纬变小）
 *   所以同一 pixelToRadius 既是 lng 半径 r，也是 lat 半径 r/cos(lat)。
 *   等价地，把 Δlat 乘 1/cosLat 后，可直接与 r 比较。
 *   之所以选 "把 dy 放大到 lng 空间" 而非 "把 dx 压缩到 lat 空间"，是为了保持
 *   距离量纲和 caller 的 r (lng 度数) 一致，调用端零改动。
 */
import type { LngLat } from '@/core/geometry/interpolate';

/** 点是否在多边形内（射线法） */
export function pointInPolygon(point: LngLat, polygon: LngLat[]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const [xi, yi] = pi;
    const [xj, yj] = pj;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** 点到线段的最近距离（Δlat 按 1/cosLat 放大到 lng 度空间） */
function pointToSegmentDistGeo(point: LngLat, a: LngLat, b: LngLat, invCosLat: number): number {
  const [px, py] = point;
  const dx = b[0] - a[0];
  const dy = (b[1] - a[1]) * invCosLat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const dpx = px - a[0];
    const dpy = (py - a[1]) * invCosLat;
    return Math.hypot(dpx, dpy);
  }

  const pdx = px - a[0];
  const pdy = (py - a[1]) * invCosLat;
  let t = (pdx * dx + pdy * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = pdx - t * dx;
  const cy = pdy - t * dy;
  return Math.hypot(cx, cy);
}

/**
 * 点到折线的最近距离（纬度补偿版）。
 * 返回值量纲 = lng 度数，可直接与 pixelToRadius(px) 返回的半径比较。
 */
export function pointToPolylineDistGeo(point: LngLat, coords: LngLat[], cosLat: number): number {
  // 防御：极端纬度 cosLat 接近 0 时退化回纯欧氏（避免除零）
  const safeCos = Math.max(cosLat, 1e-6);
  const invCosLat = 1 / safeCos;
  let min = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    const d = pointToSegmentDistGeo(point, a, b, invCosLat);
    if (d < min) min = d;
  }
  return min;
}

/**
 * 点到多边形的距离（纬度补偿版）。
 * 注：pointInPolygon 只判断拓扑包含，和量纲无关，可直接复用。
 */
export function pointToPolygonDistGeo(point: LngLat, polygon: LngLat[], cosLat: number): number {
  if (pointInPolygon(point, polygon)) return 0;
  if (polygon.length === 0) return Infinity;
  const first = polygon[0]!;
  const last = polygon[polygon.length - 1]!;
  const ring = first[0] === last[0] && first[1] === last[1] ? polygon : [...polygon, first];
  return pointToPolylineDistGeo(point, ring, cosLat);
}
