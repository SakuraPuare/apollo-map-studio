/**
 * 曲线插值算法模块
 * - Catmull-Rom 样条：穿过所有控制点的平滑曲线
 * - Cubic Bezier：带控制柄的贝塞尔曲线
 * - 三点圆弧：经过三点的圆弧插值
 */

type LngLat = [number, number];

/** 贝塞尔锚点：位置 + 入/出控制柄 */
export interface BezierAnchor {
  point: LngLat;
  handleIn: LngLat | null;   // 入方向控制柄（绝对坐标）
  handleOut: LngLat | null;  // 出方向控制柄（绝对坐标）
}

// ─── Catmull-Rom ────────────────────────────────────────────

/**
 * Catmull-Rom 样条插值
 * @param points 途经点（至少 2 个）
 * @param segments 每两个点之间的采样段数
 * @param alpha 0=uniform, 0.5=centripetal, 1=chordal
 */
export function catmullRom(
  points: LngLat[],
  segments = 32,
  alpha = 0.5,
): LngLat[] {
  if (points.length < 2) return [...points];
  if (points.length === 2) return [...points];

  // 扩展首尾虚拟点（镜像）
  const pts: LngLat[] = [
    mirror(points[0], points[1]),
    ...points,
    mirror(points[points.length - 1], points[points.length - 2]),
  ];

  const result: LngLat[] = [];

  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];

    for (let j = 0; j < segments; j++) {
      const t = j / segments;
      result.push(catmullRomPoint(p0, p1, p2, p3, t, alpha));
    }
  }
  // 最后一个点
  result.push(points[points.length - 1]);

  return result;
}

function catmullRomPoint(
  p0: LngLat, p1: LngLat, p2: LngLat, p3: LngLat,
  t: number, alpha: number,
): LngLat {
  const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const d3 = Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);

  const d1a = Math.pow(d1, alpha);
  const d2a = Math.pow(d2, alpha);
  const d3a = Math.pow(d3, alpha);

  const b1x = (d1a * d1a * p2[0] - d2a * d2a * p0[0] + (2 * d1a * d1a + 3 * d1a * d2a + d2a * d2a) * p1[0]) / (3 * d1a * (d1a + d2a));
  const b1y = (d1a * d1a * p2[1] - d2a * d2a * p0[1] + (2 * d1a * d1a + 3 * d1a * d2a + d2a * d2a) * p1[1]) / (3 * d1a * (d1a + d2a));

  const b2x = (d3a * d3a * p1[0] - d2a * d2a * p3[0] + (2 * d3a * d3a + 3 * d3a * d2a + d2a * d2a) * p2[0]) / (3 * d3a * (d3a + d2a));
  const b2y = (d3a * d3a * p1[1] - d2a * d2a * p3[1] + (2 * d3a * d3a + 3 * d3a * d2a + d2a * d2a) * p2[1]) / (3 * d3a * (d3a + d2a));

  return cubicBezierPoint(p1, [b1x, b1y], [b2x, b2y], p2, t);
}

function mirror(anchor: LngLat, neighbor: LngLat): LngLat {
  return [2 * anchor[0] - neighbor[0], 2 * anchor[1] - neighbor[1]];
}

// ─── Cubic Bezier ───────────────────────────────────────────

/**
 * 多段三次贝塞尔曲线插值
 * @param anchors 锚点数组（至少 2 个），每个锚点带入/出控制柄
 * @param segments 每段的采样数
 */
export function cubicBezier(
  anchors: BezierAnchor[],
  segments = 48,
): LngLat[] {
  if (anchors.length < 2) {
    return anchors.map((a) => a.point);
  }

  const result: LngLat[] = [];

  for (let i = 0; i < anchors.length - 1; i++) {
    const a0 = anchors[i];
    const a1 = anchors[i + 1];

    const p0 = a0.point;
    const p1 = a0.handleOut ?? a0.point;
    const p2 = a1.handleIn ?? a1.point;
    const p3 = a1.point;

    for (let j = 0; j < segments; j++) {
      const t = j / segments;
      result.push(cubicBezierPoint(p0, p1, p2, p3, t));
    }
  }
  result.push(anchors[anchors.length - 1].point);

  return result;
}

function cubicBezierPoint(
  p0: LngLat, p1: LngLat, p2: LngLat, p3: LngLat, t: number,
): LngLat {
  const u = 1 - t;
  const uu = u * u;
  const uuu = uu * u;
  const tt = t * t;
  const ttt = tt * t;

  return [
    uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0],
    uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1],
  ];
}

// ─── 三点圆弧 ───────────────────────────────────────────────

/**
 * 三点圆弧插值：经过 p1(起点)、p2(弧上点)、p3(终点) 的圆弧
 * 使用简易等距投影修正经纬度变形
 * @param segments 采样段数
 * @returns 圆弧上的采样点数组；若三点共线则返回直线段
 */
export function threePointArc(
  p1: LngLat, p2: LngLat, p3: LngLat,
  segments = 64,
): LngLat[] {
  // 投影参考纬度（三点平均纬度）
  const refLat = (p1[1] + p2[1] + p3[1]) / 3;
  const cosLat = Math.cos(refLat * Math.PI / 180);

  // 投影到近似等距空间：x = lng * cos(lat), y = lat
  const proj = (p: LngLat): LngLat => [p[0] * cosLat, p[1]];
  const unproj = (p: LngLat): LngLat => [p[0] / cosLat, p[1]];

  const pp1 = proj(p1);
  const pp2 = proj(p2);
  const pp3 = proj(p3);

  const center = circumcenter(pp1, pp2, pp3);
  if (!center) {
    return [p1, p2, p3];
  }

  const [cx, cy] = center;
  const r = Math.hypot(pp1[0] - cx, pp1[1] - cy);

  let a1 = Math.atan2(pp1[1] - cy, pp1[0] - cx);
  let a2 = Math.atan2(pp2[1] - cy, pp2[0] - cx);
  let a3 = Math.atan2(pp3[1] - cy, pp3[0] - cx);

  let sweep = normalizeAngle(a3 - a1);
  const midSweep = normalizeAngle(a2 - a1);

  if ((sweep > 0 && midSweep > sweep) || (sweep < 0 && midSweep < sweep)) {
    sweep = sweep > 0 ? sweep - 2 * Math.PI : sweep + 2 * Math.PI;
  }

  const result: LngLat[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = a1 + sweep * t;
    const projected: LngLat = [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    result.push(unproj(projected));
  }

  return result;
}

/** 三点外接圆圆心，共线时返回 null */
function circumcenter(
  p1: LngLat, p2: LngLat, p3: LngLat,
): LngLat | null {
  const ax = p1[0], ay = p1[1];
  const bx = p2[0], by = p2[1];
  const cx = p3[0], cy = p3[1];

  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D) < 1e-12) return null; // 共线

  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;

  return [ux, uy];
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
