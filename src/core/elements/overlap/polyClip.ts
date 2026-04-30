/**
 * Overlap pipeline — 多边形布尔运算包装层 (Sprint 1, GAP-5).
 *
 * 底层逻辑：用 `polygon-clipping`（Martinez 算法实现）做任意多边形的
 * 求交 / 求并 / 求差。Apollo HD Map 里 crosswalk × lane corridor 的
 * region 多边形需要任意凹凸 + holes 支持，自研 Sutherland-Hodgman 只
 * 能扛凸 clip，留坑成本高。
 *
 * 抓手定位：
 *   - 输入输出统一用 `GeoPoint[]`（不闭合的开环）：和 ApolloPolygon /
 *     centerline 抓手一致，调用端零适配。
 *   - 内部转 polygon-clipping 的 `[lng, lat]` Ring 数组并显式闭合。
 *   - 返回 `GeoPoint[][]`：求交结果可能是多块（disjoint pieces），
 *     每块是一个独立环。caller 决定取哪一块（一般取最大的那一块）。
 *
 * 颗粒度：纯几何，无副作用。库本身在 lng/lat 度数空间无歧义，不需要
 * 米空间投影 —— 求交是位置关系判断，量纲一致即可。
 */
import polygonClipping, { type Polygon as PCPolygon, type Ring } from 'polygon-clipping';
import type { GeoPoint } from '@/types/entities';
import { METERS_PER_DEGREE } from '@/config/mapConstants';

/** GeoPoint[] → polygon-clipping Ring（闭合环）. */
function toRing(points: readonly GeoPoint[]): Ring {
  if (points.length === 0) return [];
  const ring: Ring = points.map((p) => [p.x, p.y]);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

/** polygon-clipping Ring → GeoPoint[]（去掉重复闭合点）. */
function fromRing(ring: Ring): GeoPoint[] {
  if (ring.length === 0) return [];
  const out: GeoPoint[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = ring[i]!;
    if (i === ring.length - 1) {
      const first = ring[0]!;
      if (x === first[0] && y === first[1]) break;
    }
    out.push({ x, y });
  }
  return out;
}

function toPolygon(points: readonly GeoPoint[]): PCPolygon {
  const ring = toRing(points);
  // 退化保护：< 4 个点（含闭合点）的环不是合法多边形
  if (ring.length < 4) return [];
  return [ring];
}

/**
 * 求两个多边形的交集（intersection）.
 *
 * 返回 0..n 块独立外环。每块只取外边界 ring（drop holes）—— region
 * 多边形在 Apollo 协议里是简单环，不携带 holes。
 *
 * 任一输入退化（< 3 个点）则返回空数组。
 */
export function intersectPolygons(a: readonly GeoPoint[], b: readonly GeoPoint[]): GeoPoint[][] {
  if (a.length < 3 || b.length < 3) return [];
  const polyA = toPolygon(a);
  const polyB = toPolygon(b);
  if (polyA.length === 0 || polyB.length === 0) return [];

  let result;
  try {
    result = polygonClipping.intersection(polyA, polyB);
  } catch (err) {
    // polygon-clipping 在某些自相交退化输入上会抛错；保守返回空，但留 telemetry
    // —— 静默吞错会把真实库 bug / 上游 sanitize 漏洞变成"没相交"的假阴性.
    console.error('[polyClip] intersection failed; returning empty', {
      inputA: a.length,
      inputB: b.length,
      error: err,
    });
    return [];
  }

  const out: GeoPoint[][] = [];
  for (const poly of result) {
    const outer = poly[0];
    if (!outer) continue;
    const ring = fromRing(outer);
    if (ring.length >= 3) out.push(ring);
  }
  return out;
}

/** 取面积最大的那一块（米空间近似面积，cosLat 修正 lng 方向）. */
export function largestRing(rings: readonly GeoPoint[][]): GeoPoint[] | null {
  if (rings.length === 0) return null;
  if (rings.length === 1) return rings[0] ?? null;
  let bestIdx = 0;
  let bestArea = -1;
  for (let i = 0; i < rings.length; i++) {
    const a = absAreaApproxM2(rings[i]!);
    if (a > bestArea) {
      bestArea = a;
      bestIdx = i;
    }
  }
  return rings[bestIdx] ?? null;
}

/** 米空间近似面积（绝对值）；用 ring 中点纬度的 cosLat 修正 lng 方向. */
function absAreaApproxM2(ring: readonly GeoPoint[]): number {
  if (ring.length < 3) return 0;
  let latSum = 0;
  for (const p of ring) latSum += p.y;
  const meanLat = latSum / ring.length;
  const cosLat = Math.cos((meanLat * Math.PI) / 180) || 1;
  let twiceArea = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i]!;
    const pj = ring[j]!;
    twiceArea += (pj.x - pi.x) * (pj.y + pi.y);
  }
  // (lng-deg × lat-deg) → m² 量纲修正
  return Math.abs(twiceArea / 2) * METERS_PER_DEGREE * METERS_PER_DEGREE * cosLat;
}
