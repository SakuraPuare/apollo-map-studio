import type { GeoPoint } from '@/types/entities';
import {
  DEG_TO_M,
  projectPoint,
  unprojectPoint,
  type ProjectedPoint,
  type Vec2,
} from './projection';

type DenseOffsetSegment = {
  start: Vec2;
  end: Vec2;
  dir: Vec2;
  normal: Vec2;
};

type BackProject = (mx: number, my: number, zi?: number) => GeoPoint;
type OffsetOptions = { widthMeters: number; sign: number; maxMiter: number };
type OffsetContext = {
  sourcePoints: GeoPoint[];
  projected: Vec2[];
  normals: Vec2[];
  opts: OffsetOptions;
  back: BackProject;
};
type JoinContext = {
  point: Vec2;
  n1: Vec2;
  n2: Vec2;
  zi: number | undefined;
  opts: OffsetOptions;
  back: BackProject;
};

/**
 * Offset a polyline to the left or right by a width in meters.
 *
 * Corners distinguish inside and outside joins:
 * - outside miter <= MAX_MITER: exact miter point
 * - outside miter over limit: bevel with a cap point
 * - inside: exact miter point, so the inside line shortens correctly
 */
export function offsetPolylineDeg(
  points: GeoPoint[],
  widthMeters: number,
  side: 'left' | 'right',
): GeoPoint[] {
  if (points.length < 2 || widthMeters <= 0) return points;

  const sign = side === 'left' ? 1 : -1;
  const MAX_MITER = 3;

  const midLat = points.reduce((s, p) => s + p.y, 0) / points.length;
  const cosLat = Math.cos((midLat * Math.PI) / 180);

  const pts: Vec2[] = points.map((p) => [p.x * cosLat * DEG_TO_M, p.y * DEG_TO_M]);
  const n = pts.length;

  const segN: Vec2[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    segN.push(len < 1e-10 ? [0, sign] : [(-dy / len) * sign, (dx / len) * sign]);
  }

  const back = (mx: number, my: number, zi?: number): GeoPoint => ({
    x: mx / (cosLat * DEG_TO_M),
    y: my / DEG_TO_M,
    ...(zi !== undefined ? { z: zi } : {}),
  });

  const result: GeoPoint[] = [];
  const offsetContext: OffsetContext = {
    sourcePoints: points,
    projected: pts,
    normals: segN,
    opts: { widthMeters, sign, maxMiter: MAX_MITER },
    back,
  };

  for (let i = 0; i < n; i++) {
    result.push(...offsetVertex(i, offsetContext));
  }

  if (points.length < 6) {
    return result;
  }

  if (hasDenseSegmentCollapse(result, pts, cosLat)) {
    return collapseOffsetLoops(rebuildDenseOffset(pts, segN, widthMeters, cosLat), cosLat);
  }

  // Ordinary dense curves should preserve their sampled shape. Running the
  // global loop collapse on them can cut across a valid arc and leave a long
  // chord, which turns the lane fill into a large triangle. The branch above
  // handles the tight-radius cases where adjacent offset segments actually
  // fold backward and need pruning.
  return result;
}

function offsetVertex(index: number, context: OffsetContext): GeoPoint[] {
  const { sourcePoints, projected, normals, opts, back } = context;
  const [px, py] = projected[index]!;
  const zi = sourcePoints[index]!.z;
  if (index === 0) return endpointOffset(projected[0]!, normals[0]!, opts.widthMeters, zi, back);
  if (index === projected.length - 1) {
    return endpointOffset(projected[index]!, normals[index - 1]!, opts.widthMeters, zi, back);
  }
  return joinOffset({
    point: [px, py],
    n1: normals[index - 1]!,
    n2: normals[index]!,
    zi,
    opts,
    back,
  });
}

function endpointOffset(
  point: Vec2,
  normal: Vec2,
  widthMeters: number,
  zi: number | undefined,
  back: BackProject,
): GeoPoint[] {
  return [back(point[0] + normal[0] * widthMeters, point[1] + normal[1] * widthMeters, zi)];
}

function joinOffset(context: JoinContext): GeoPoint[] {
  const { point, n1, n2, zi, opts, back } = context;
  const [px, py] = point;
  const [n1x, n1y] = n1;
  const [n2x, n2y] = n2;
  const dot = n1x * n2x + n1y * n2y;
  const denom = 1 + dot;
  const crossN = n1x * n2y - n1y * n2x;
  const isInner = crossN * opts.sign < 0;
  const cap: Vec2 = crossN > 0 ? [n1y, -n1x] : [-n1y, n1x];

  if (denom < 0.01) {
    return isInner ? innerDegenerateJoin(context) : bevelJoin({ ...context, cap });
  }

  const miter: Vec2 = [(n1x + n2x) / denom, (n1y + n2y) / denom];
  if (Math.hypot(miter[0], miter[1]) > opts.maxMiter && !isInner) {
    return bevelJoin({ ...context, cap });
  }
  return [back(px + miter[0] * opts.widthMeters, py + miter[1] * opts.widthMeters, zi)];
}

function innerDegenerateJoin({ point, n1, n2, zi, opts, back }: JoinContext): GeoPoint[] {
  const avg: Vec2 = [n1[0] + n2[0], n1[1] + n2[1]];
  const avgLen = Math.hypot(avg[0], avg[1]);
  if (avgLen <= 1e-10) return [back(point[0], point[1], zi)];
  return [
    back(
      point[0] + (avg[0] / avgLen) * opts.widthMeters,
      point[1] + (avg[1] / avgLen) * opts.widthMeters,
      zi,
    ),
  ];
}

function bevelJoin({
  point,
  n1,
  n2,
  cap,
  zi,
  opts,
  back,
}: JoinContext & { cap: Vec2 }): GeoPoint[] {
  const [px, py] = point;
  return [
    back(px + n1[0] * opts.widthMeters, py + n1[1] * opts.widthMeters, zi),
    back(px + cap[0] * opts.widthMeters, py + cap[1] * opts.widthMeters, zi),
    back(px + n2[0] * opts.widthMeters, py + n2[1] * opts.widthMeters, zi),
  ];
}

function dedupeProjected(points: ProjectedPoint[]): ProjectedPoint[] {
  const out: ProjectedPoint[] = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (prev && Math.hypot(point.x - prev.x, point.y - prev.y) < 1e-6) continue;
    out.push(point);
  }
  return out;
}

function segmentIntersection(
  a1: ProjectedPoint,
  a2: ProjectedPoint,
  b1: ProjectedPoint,
  b2: ProjectedPoint,
): ProjectedPoint | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const det = dax * dby - day * dbx;
  if (Math.abs(det) < 1e-8) return null;

  const dx = b1.x - a1.x;
  const dy = b1.y - a1.y;
  const t = (dx * dby - dy * dbx) / det;
  const u = (dx * day - dy * dax) / det;
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null;

  return { x: a1.x + dax * t, y: a1.y + day * t };
}

function lineIntersection(
  a: ProjectedPoint,
  dirA: Vec2,
  b: ProjectedPoint,
  dirB: Vec2,
): ProjectedPoint | null {
  const det = dirA[0] * dirB[1] - dirA[1] * dirB[0];
  if (Math.abs(det) < 1e-8) return null;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = (dx * dirB[1] - dy * dirB[0]) / det;
  return { x: a.x + dirA[0] * t, y: a.y + dirA[1] * t };
}

function offsetProjected(anchor: Vec2, normal: Vec2, widthMeters: number): ProjectedPoint {
  return { x: anchor[0] + normal[0] * widthMeters, y: anchor[1] + normal[1] * widthMeters };
}

function projectedLength(a: ProjectedPoint, b: ProjectedPoint, dir: Vec2): number {
  return (b.x - a.x) * dir[0] + (b.y - a.y) * dir[1];
}

function hasDenseSegmentCollapse(
  offsetPoints: GeoPoint[],
  sourcePts: Vec2[],
  cosLat: number,
): boolean {
  if (offsetPoints.length !== sourcePts.length || offsetPoints.length < 3) return false;

  const projected = offsetPoints.map((point) => projectPoint(point, cosLat));
  for (let i = 0; i < sourcePts.length - 1; i++) {
    const a = sourcePts[i]!;
    const b = sourcePts[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-8) continue;

    if (projectedLength(projected[i]!, projected[i + 1]!, [dx / len, dy / len]) <= 1e-4) {
      return true;
    }
  }

  return false;
}

function denseJoin(
  a: DenseOffsetSegment,
  b: DenseOffsetSegment,
  widthMeters: number,
): ProjectedPoint {
  const aOffset = offsetProjected(a.end, a.normal, widthMeters);
  const bOffset = offsetProjected(b.start, b.normal, widthMeters);
  return (
    lineIntersection(aOffset, a.dir, bOffset, b.dir) ?? {
      x: (aOffset.x + bOffset.x) / 2,
      y: (aOffset.y + bOffset.y) / 2,
    }
  );
}

function rebuildDenseOffset(
  sourcePts: Vec2[],
  segN: Vec2[],
  widthMeters: number,
  cosLat: number,
): GeoPoint[] {
  const segments: DenseOffsetSegment[] = [];

  for (let i = 0; i < sourcePts.length - 1; i++) {
    const a = sourcePts[i]!;
    const b = sourcePts[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-8) continue;

    segments.push({
      start: a,
      end: b,
      dir: [dx / len, dy / len],
      normal: segN[i]!,
    });
  }

  if (segments.length === 0) return [];

  const active = [segments[0]!];
  const poly: ProjectedPoint[] = [
    offsetProjected(segments[0]!.start, segments[0]!.normal, widthMeters),
  ];

  for (let i = 1; i < segments.length; i++) {
    active.push(segments[i]!);
    poly.push(denseJoin(active[active.length - 2]!, active[active.length - 1]!, widthMeters));

    while (active.length >= 3) {
      const segment = active[active.length - 2]!;
      const start = poly[poly.length - 2]!;
      const end = poly[poly.length - 1]!;
      if (projectedLength(start, end, segment.dir) > 1e-4) break;

      active.splice(active.length - 2, 1);
      poly.splice(poly.length - 2, 2);
      poly.push(denseJoin(active[active.length - 2]!, active[active.length - 1]!, widthMeters));
    }
  }

  poly.push(
    offsetProjected(active[active.length - 1]!.end, active[active.length - 1]!.normal, widthMeters),
  );

  let changed = true;
  while (changed) {
    changed = false;

    while (
      active.length >= 2 &&
      projectedLength(
        poly[poly.length - 2]!,
        poly[poly.length - 1]!,
        active[active.length - 1]!.dir,
      ) <= 1e-4
    ) {
      active.pop();
      poly.splice(poly.length - 2, 1);
      changed = true;
    }

    while (active.length >= 2 && projectedLength(poly[0]!, poly[1]!, active[0]!.dir) <= 1e-4) {
      active.shift();
      poly.splice(1, 1);
      changed = true;
    }
  }

  return poly.map((point) => unprojectPoint(point, cosLat));
}

function collapseOffsetLoops(points: GeoPoint[], cosLat: number): GeoPoint[] {
  if (points.length < 4) return points;

  let projected = dedupeProjected(points.map((point) => projectPoint(point, cosLat)));
  let changed = true;

  while (changed && projected.length >= 4) {
    changed = false;

    outer: for (let i = 0; i < projected.length - 1; i++) {
      for (let j = i + 2; j < projected.length - 1; j++) {
        const hit = segmentIntersection(
          projected[i]!,
          projected[i + 1]!,
          projected[j]!,
          projected[j + 1]!,
        );
        if (!hit) continue;

        projected = dedupeProjected([...projected.slice(0, i + 1), hit, ...projected.slice(j + 1)]);
        changed = true;
        break outer;
      }
    }
  }

  return projected.map((point) => unprojectPoint(point, cosLat));
}
