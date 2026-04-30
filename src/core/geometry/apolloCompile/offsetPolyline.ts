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

  for (let i = 0; i < n; i++) {
    const [px, py] = pts[i]!;
    const zi = points[i]!.z;

    if (i === 0) {
      const [nx, ny] = segN[0]!;
      result.push(back(px + nx * widthMeters, py + ny * widthMeters, zi));
    } else if (i === n - 1) {
      const [nx, ny] = segN[n - 2]!;
      result.push(back(px + nx * widthMeters, py + ny * widthMeters, zi));
    } else {
      const [n1x, n1y] = segN[i - 1]!;
      const [n2x, n2y] = segN[i]!;
      const dot = n1x * n2x + n1y * n2y;
      const denom = 1 + dot;
      const crossN = n1x * n2y - n1y * n2x;
      const isInner = crossN * sign < 0;
      const capX = crossN > 0 ? n1y : -n1y;
      const capY = crossN > 0 ? -n1x : n1x;

      if (denom < 0.01) {
        if (isInner) {
          const avgX = n1x + n2x;
          const avgY = n1y + n2y;
          const avgLen = Math.hypot(avgX, avgY);
          if (avgLen > 1e-10) {
            result.push(
              back(px + (avgX / avgLen) * widthMeters, py + (avgY / avgLen) * widthMeters, zi),
            );
          } else {
            result.push(back(px, py, zi));
          }
        } else {
          result.push(back(px + n1x * widthMeters, py + n1y * widthMeters, zi));
          result.push(back(px + capX * widthMeters, py + capY * widthMeters, zi));
          result.push(back(px + n2x * widthMeters, py + n2y * widthMeters, zi));
        }
      } else {
        const mx = (n1x + n2x) / denom;
        const my = (n1y + n2y) / denom;
        const miterRatio = Math.hypot(mx, my);

        if (miterRatio > MAX_MITER && !isInner) {
          result.push(back(px + n1x * widthMeters, py + n1y * widthMeters, zi));
          result.push(back(px + capX * widthMeters, py + capY * widthMeters, zi));
          result.push(back(px + n2x * widthMeters, py + n2y * widthMeters, zi));
        } else {
          result.push(back(px + mx * widthMeters, py + my * widthMeters, zi));
        }
      }
    }
  }

  if (points.length < 6) {
    return result;
  }

  if (hasDenseSegmentCollapse(result, pts, cosLat)) {
    return collapseOffsetLoops(rebuildDenseOffset(pts, segN, widthMeters, cosLat), cosLat);
  }

  return collapseOffsetLoops(result, cosLat);
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
