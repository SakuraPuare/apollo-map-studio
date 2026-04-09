/**
 * 几何验证函数：线段相交检测、自交检测
 * 从 interpolate.ts 分离，供 FSM 和 entityMutations 使用
 */
import type { LngLat } from './interpolate';

function cross(o: LngLat, a: LngLat, b: LngLat): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** 判断两条线段 (a1→a2) 和 (b1→b2) 是否严格相交（不含端点重合） */
export function segmentsIntersect(a1: LngLat, a2: LngLat, b1: LngLat, b2: LngLat): boolean {
  const d1 = cross(a1, a2, b1);
  const d2 = cross(a1, a2, b2);
  const d3 = cross(b1, b2, a1);
  const d4 = cross(b1, b2, a2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

/** 检查多边形是否自交（将 newPt 加入 points 后形成的新边是否与已有边相交） */
export function wouldSelfIntersect(points: LngLat[], newPt: LngLat): boolean {
  const n = points.length;
  if (n < 2) return false;

  const edgeStart = points[n - 1];
  const edgeEnd = newPt;

  for (let i = 0; i < n - 2; i++) {
    if (segmentsIntersect(edgeStart, edgeEnd, points[i], points[i + 1])) {
      return true;
    }
  }
  return false;
}

/** 检查闭合多边形是否自交（闭合边 points[n-1]→points[0] 与其他边） */
export function polygonSelfIntersects(points: LngLat[]): boolean {
  const n = points.length;
  if (n < 4) return false;

  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}
