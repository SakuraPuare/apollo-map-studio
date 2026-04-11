/**
 * 精确碰撞检测：点到线段/多边形的距离计算
 *
 * 两套 API：
 *   - pointToPolylineDist / pointToPolygonDist  —— 纯欧氏度空间（legacy，仅用于
 *     向后兼容 + 单元测试断言），把 (lng,lat) 当同一量纲。赤道附近误差小，但
 *     高纬度会把 "东西向 1 度" 错当成 "南北向 1 度" 处理，导致高 zoom 下的命中
 *     排序/半径过滤偏差（R4 bug）。
 *
 *   - pointToPolylineDistGeo / pointToPolygonDistGeo —— 纬度补偿版。caller 传入
 *     midLat 对应的 cosLat，函数内部把 Δlat 乘 1/cosLat 转到 "等效 lng 度空间"，
 *     于是返回的 "距离" 和调用端传入的 lng-度半径 (pixelToRadius) 量纲一致，
 *     排序也反映真实物理距离。worker hitTest 用这一套。
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

// ── 纯欧氏度空间（legacy） ─────────────────────────────────────────────────

/** 点到线段的最近距离（纯欧氏度空间） */
function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 点到折线的最近距离（纯欧氏度空间） */
export function pointToPolylineDist(point: LngLat, coords: LngLat[]): number {
  let min = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = pointToSegmentDist(
      point[0],
      point[1],
      coords[i][0],
      coords[i][1],
      coords[i + 1][0],
      coords[i + 1][1],
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
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** 点到多边形的距离（纯欧氏度空间：内部为 0，外部为到边界的最近距离） */
export function pointToPolygonDist(point: LngLat, polygon: LngLat[]): number {
  if (pointInPolygon(point, polygon)) return 0;
  // 闭合环
  const ring =
    polygon[0][0] === polygon[polygon.length - 1][0] &&
    polygon[0][1] === polygon[polygon.length - 1][1]
      ? polygon
      : [...polygon, polygon[0]];
  return pointToPolylineDist(point, ring);
}

// ── 纬度补偿版（worker hitTest 使用） ─────────────────────────────────────

/** 点到线段的最近距离（Δlat 按 1/cosLat 放大到 lng 度空间） */
function pointToSegmentDistGeo(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  invCosLat: number,
): number {
  const dx = bx - ax;
  const dy = (by - ay) * invCosLat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const dpx = px - ax;
    const dpy = (py - ay) * invCosLat;
    return Math.hypot(dpx, dpy);
  }

  const pdx = px - ax;
  const pdy = (py - ay) * invCosLat;
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
export function pointToPolylineDistGeo(
  point: LngLat,
  coords: LngLat[],
  cosLat: number,
): number {
  // 防御：极端纬度 cosLat 接近 0 时退化回纯欧氏（避免除零）
  const safeCos = Math.max(cosLat, 1e-6);
  const invCosLat = 1 / safeCos;
  let min = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = pointToSegmentDistGeo(
      point[0],
      point[1],
      coords[i][0],
      coords[i][1],
      coords[i + 1][0],
      coords[i + 1][1],
      invCosLat,
    );
    if (d < min) min = d;
  }
  return min;
}

/**
 * 点到多边形的距离（纬度补偿版）。
 * 注：pointInPolygon 只判断拓扑包含，和量纲无关，直接复用欧氏版本。
 */
export function pointToPolygonDistGeo(
  point: LngLat,
  polygon: LngLat[],
  cosLat: number,
): number {
  if (pointInPolygon(point, polygon)) return 0;
  const ring =
    polygon[0][0] === polygon[polygon.length - 1][0] &&
    polygon[0][1] === polygon[polygon.length - 1][1]
      ? polygon
      : [...polygon, polygon[0]];
  return pointToPolylineDistGeo(point, ring, cosLat);
}
