import { rectCorners } from '@/core/geometry/interpolate';
import type { LngLat } from '@/core/geometry/interpolate';
import type { GeoPoint } from '@/types/entities';

export interface RectGeometry {
  p1: GeoPoint;
  p2: GeoPoint;
  rotation: number;
}

export function rectCenter(rect: RectGeometry): LngLat {
  return [(rect.p1.x + rect.p2.x) / 2, (rect.p1.y + rect.p2.y) / 2];
}

export function rectRotationFromHandle(rect: RectGeometry, newPoint: LngLat): number {
  const [cx, cy] = rectCenter(rect);
  const cosLat = Math.cos((cy * Math.PI) / 180);
  const dx = (newPoint[0] - cx) * cosLat;
  const dy = newPoint[1] - cy;
  return Math.atan2(dx, dy);
}

export function resizeRotatedRect(
  rect: RectGeometry,
  cornerIndex: number,
  dragged: LngLat,
): RectGeometry {
  const corners = rectCorners([rect.p1.x, rect.p1.y], [rect.p2.x, rect.p2.y], rect.rotation);
  const opIdx = (cornerIndex + 2) % 4;
  const anchor = corners[opIdx]!;

  const refLat = (anchor[1] + dragged[1]) / 2;
  const cosLat = Math.cos((refLat * Math.PI) / 180);
  const cosR = Math.cos(rect.rotation);
  const sinR = Math.sin(rect.rotation);

  const project = (pt: LngLat): [number, number] => [pt[0] * cosLat, pt[1]];
  const [anchorX, anchorY] = project(anchor);
  const [draggedX, draggedY] = project(dragged);
  const mcx = (anchorX + draggedX) / 2;
  const mcy = (anchorY + draggedY) / 2;

  function unrotate(x: number, y: number): [number, number] {
    const px = x - mcx;
    const py = y - mcy;
    return [mcx + px * cosR - py * sinR, mcy + px * sinR + py * cosR];
  }

  const [ax, ay] = unrotate(anchorX, anchorY);
  const [dx, dy] = unrotate(draggedX, draggedY);

  return {
    p1: { x: Math.min(ax, dx) / cosLat, y: Math.min(ay, dy) },
    p2: { x: Math.max(ax, dx) / cosLat, y: Math.max(ay, dy) },
    rotation: rect.rotation,
  };
}

export function rectPolygonPoints(rect: RectGeometry): GeoPoint[] {
  return rectCorners([rect.p1.x, rect.p1.y], [rect.p2.x, rect.p2.y], rect.rotation).map((c) => ({
    x: c[0],
    y: c[1],
  }));
}
