/**
 * Overlap pipeline — geometric intersection primitives.
 *
 * 量纲约定：
 *   输入坐标统一为 lng/lat 度数。所有"米空间"计算先经 cosLat 修正
 *   到等效 lng 度数，避免高纬度（lat 40°）东西向被算小 0.766 倍。
 *
 *   纯几何函数，无副作用；caller 决定缓存策略（spatialIndex / arc length cache）。
 */
import type { GeoPoint } from '@/types/entities';
import { METERS_PER_DEGREE } from '@/config/mapConstants';
import type { BBox } from './types';

const EPS = 1e-12;

/**
 * 折线 bbox。空数组返回 null —— 历史上的「零 bbox 退化」会在 (0,0) 凭空命中
 * 任何包含原点的查询，不能再当真值用。caller 自行 null-guard。
 */
export function bboxOfPoints(points: readonly GeoPoint[], pad = 0): BBox | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/**
 * 多组 bbox 的并集（stopLines / speedBump.position 用）。空数组返回 null，
 * 同 bboxOfPoints 的契约。
 */
export function bboxUnion(boxes: readonly BBox[]): BBox | null {
  if (boxes.length === 0) return null;
  let { minX, minY, maxX, maxY } = boxes[0]!;
  for (let i = 1; i < boxes.length; i++) {
    const b = boxes[i]!;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  return { minX, minY, maxX, maxY };
}

export function bboxOverlap(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** 线段相交（cross product 法），共线视为不相交 */
export function segmentsIntersect(
  a1: GeoPoint,
  a2: GeoPoint,
  b1: GeoPoint,
  b2: GeoPoint,
): GeoPoint | null {
  const r = { x: a2.x - a1.x, y: a2.y - a1.y };
  const s = { x: b2.x - b1.x, y: b2.y - b1.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < EPS) return null;
  const dx = b1.x - a1.x;
  const dy = b1.y - a1.y;
  const t = (dx * s.y - dy * s.x) / denom;
  const u = (dx * r.y - dy * r.x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + t * r.x, y: a1.y + t * r.y };
}

/**
 * 半开射线法判定点是否在多边形内。
 *
 * 通过 `(pi.y > py) !== (pj.y > py)` 显式跳过水平边 —— 因为该判别式只在
 * 两端点跨越扫描线时为真，必然蕴含 `pi.y !== pj.y`，所以分母安全，
 * 不需要 EPS bias（旧版 `+ EPS` 会把水平边的交叉点算成一个微小但非零
 * 的偏置，反而引入 false-positive）。
 */
export function pointInPolygon(point: GeoPoint, polygon: readonly GeoPoint[]): boolean {
  if (polygon.length < 3) return false;
  const px = point.x;
  const py = point.y;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    // 水平边在半开约定下不会切换 inside；该断言同时保证 pi.y !== pj.y，
    // 后续除法不会触发 0/0。
    if (pi.y > py !== pj.y > py) {
      const xCross = ((pj.x - pi.x) * (py - pi.y)) / (pj.y - pi.y) + pi.x;
      if (px < xCross) inside = !inside;
    }
  }
  return inside;
}

/** 折线与折线的相交命中（任一对线段交叉即返回 true） */
export function polylinesIntersect(a: readonly GeoPoint[], b: readonly GeoPoint[]): boolean {
  if (a.length < 2 || b.length < 2) return false;
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsIntersect(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!)) return true;
    }
  }
  return false;
}

/** 折线与多边形相交（穿过边或起/终点落入内部均算相交） */
export function polylineIntersectsPolygon(
  line: readonly GeoPoint[],
  polygon: readonly GeoPoint[],
): boolean {
  if (line.length < 2 || polygon.length < 3) return false;
  if (pointInPolygon(line[0]!, polygon)) return true;
  if (pointInPolygon(line[line.length - 1]!, polygon)) return true;
  for (let i = 0; i < line.length - 1; i++) {
    for (let j = 0, k = polygon.length - 1; j < polygon.length; k = j++) {
      if (segmentsIntersect(line[i]!, line[i + 1]!, polygon[k]!, polygon[j]!)) return true;
    }
  }
  return false;
}

/**
 * 折线穿越多边形的进出区间（按线段索引 + 比例 t）。
 * 用于计算 lane 在 junction/crosswalk 内的 start_s / end_s。
 *
 * 返回连续 [enter, exit] 对；若起点/终点在内部，对应端点为 null（caller 决定取边界）。
 */
export interface SegmentParam {
  segmentIndex: number;
  t: number;
}

export function polylinePolygonCrossings(
  line: readonly GeoPoint[],
  polygon: readonly GeoPoint[],
): SegmentParam[] {
  const out: SegmentParam[] = [];
  if (line.length < 2 || polygon.length < 3) return out;
  for (let i = 0; i < line.length - 1; i++) {
    const a1 = line[i]!;
    const a2 = line[i + 1]!;
    const r = { x: a2.x - a1.x, y: a2.y - a1.y };
    for (let j = 0, k = polygon.length - 1; j < polygon.length; k = j++) {
      const b1 = polygon[k]!;
      const b2 = polygon[j]!;
      const s = { x: b2.x - b1.x, y: b2.y - b1.y };
      const denom = r.x * s.y - r.y * s.x;
      if (Math.abs(denom) < EPS) continue;
      const dx = b1.x - a1.x;
      const dy = b1.y - a1.y;
      const t = (dx * s.y - dy * s.x) / denom;
      const u = (dx * r.y - dy * r.x) / denom;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      out.push({ segmentIndex: i, t });
    }
  }
  out.sort((a, b) =>
    a.segmentIndex !== b.segmentIndex ? a.segmentIndex - b.segmentIndex : a.t - b.t,
  );
  return out;
}

/** 端点是否近似重合（米空间，cosLat 修正） */
export function endpointsCoincide(
  a: GeoPoint,
  b: GeoPoint,
  cosLat: number,
  toleranceM: number,
): boolean {
  const dx = (a.x - b.x) * METERS_PER_DEGREE * cosLat;
  const dy = (a.y - b.y) * METERS_PER_DEGREE;
  return dx * dx + dy * dy <= toleranceM * toleranceM;
}

/**
 * 折线 × 折线的全部相交点（按 a-side segmentIndex/t 上报）.
 *
 * pairTable 的 stopLine / polyline 分支与 lane×lane crossings 都消费这个函数；
 * 历史上 pairTable 里有一份私拷贝 ——已合并到这里，唯一真值源.
 */
export function polylinePolylineCrossings(
  a: readonly GeoPoint[],
  b: readonly GeoPoint[],
): SegmentParam[] {
  const out: SegmentParam[] = [];
  if (a.length < 2 || b.length < 2) return out;
  for (let i = 0; i < a.length - 1; i++) {
    const a1 = a[i]!;
    const a2 = a[i + 1]!;
    const r = { x: a2.x - a1.x, y: a2.y - a1.y };
    for (let j = 0; j < b.length - 1; j++) {
      const b1 = b[j]!;
      const b2 = b[j + 1]!;
      const s = { x: b2.x - b1.x, y: b2.y - b1.y };
      const denom = r.x * s.y - r.y * s.x;
      if (Math.abs(denom) < EPS) continue;
      const dx = b1.x - a1.x;
      const dy = b1.y - a1.y;
      const t = (dx * s.y - dy * s.x) / denom;
      const u = (dx * r.y - dy * r.x) / denom;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      out.push({ segmentIndex: i, t });
    }
  }
  return out;
}
