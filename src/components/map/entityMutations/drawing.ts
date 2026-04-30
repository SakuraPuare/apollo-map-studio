import type { DragPointType } from '@/types/editor';
import type { BezierEntity, DrawingEntity } from '@/types/entities';
import type { LngLat } from '@/core/geometry/interpolate';
import { polygonSelfIntersects } from '@/core/geometry/validation';
import { pointsToCoords, toGeoPoint } from '@/core/geometry/coords';
import { rectCenter, rectRotationFromHandle, resizeRotatedRect } from './rect';

const DRAWING_TYPES = new Set(['polyline', 'catmullRom', 'bezier', 'arc', 'rect', 'polygon']);

export function isDrawingEntity(entity: { entityType: string }): entity is DrawingEntity {
  return DRAWING_TYPES.has(entity.entityType);
}

export function getDrawingDragCenter(entity: DrawingEntity): LngLat | null {
  if (entity.entityType === 'rect') return rectCenter(entity);

  if (entity.entityType === 'polygon') {
    if (entity.points.length === 0) return null;
    const cx = entity.points.reduce((s, p) => s + p.x, 0) / entity.points.length;
    const cy = entity.points.reduce((s, p) => s + p.y, 0) / entity.points.length;
    return [cx, cy];
  }

  return null;
}

export function deleteDrawingVertex(entity: DrawingEntity, index: number): DrawingEntity | null {
  if (entity.entityType === 'polyline' || entity.entityType === 'catmullRom') {
    if (entity.points.length <= 2) return null;
    return { ...entity, points: entity.points.filter((_, i) => i !== index) };
  }

  if (entity.entityType === 'bezier') {
    if (entity.anchors.length <= 2) return null;
    return { ...entity, anchors: entity.anchors.filter((_, i) => i !== index) };
  }

  if (entity.entityType === 'polygon') {
    if (entity.points.length <= 3) return null;
    return { ...entity, points: entity.points.filter((_, i) => i !== index) };
  }

  return entity;
}

/** Alt+点击锚点：尖角↔平滑切换 */
export function toggleSmooth(entity: BezierEntity, index: number): BezierEntity {
  const anchors = entity.anchors.map((a) => ({ ...a }));
  const anchor = anchors[index]!;
  const hasHandles = anchor.handleIn !== null || anchor.handleOut !== null;

  if (hasHandles) {
    anchor.handleIn = null;
    anchor.handleOut = null;
  } else {
    const prev = index > 0 ? anchors[index - 1] : null;
    const next = index < anchors.length - 1 ? anchors[index + 1] : null;
    const px = anchor.point.x;
    const py = anchor.point.y;

    let dx = 0;
    let dy = 0;
    let len = 0;
    if (prev && next) {
      dx = next.point.x - prev.point.x;
      dy = next.point.y - prev.point.y;
    } else if (next) {
      dx = next.point.x - px;
      dy = next.point.y - py;
    } else if (prev) {
      dx = px - prev.point.x;
      dy = py - prev.point.y;
    }

    len = Math.hypot(dx, dy);
    if (len > 0) {
      const scale = prev && next ? len / 6 : len / 3;
      const nx = dx / len;
      const ny = dy / len;
      anchor.handleOut = { x: px + nx * scale, y: py + ny * scale };
      anchor.handleIn = { x: px - nx * scale, y: py - ny * scale };
    }
  }

  anchors[index] = anchor;
  return { ...entity, anchors };
}

export function applyDrawingDrag(
  entity: DrawingEntity,
  index: number,
  pointType: DragPointType,
  newPoint: LngLat,
  altKey = false,
): DrawingEntity {
  if (entity.entityType === 'polyline' || entity.entityType === 'catmullRom') {
    const points = [...entity.points];
    points[index] = { ...points[index]!, ...toGeoPoint(newPoint) };
    return { ...entity, points };
  }

  if (entity.entityType === 'bezier') {
    const anchors = entity.anchors.map((a) => ({ ...a }));
    const anchor = { ...anchors[index]! };

    if (pointType === 'vertex') {
      const dx = newPoint[0] - anchor.point.x;
      const dy = newPoint[1] - anchor.point.y;
      anchor.point = toGeoPoint(newPoint);
      if (anchor.handleIn) {
        anchor.handleIn = { x: anchor.handleIn.x + dx, y: anchor.handleIn.y + dy };
      }
      if (anchor.handleOut) {
        anchor.handleOut = { x: anchor.handleOut.x + dx, y: anchor.handleOut.y + dy };
      }
    } else if (pointType === 'handleOut') {
      anchor.handleOut = toGeoPoint(newPoint);
      if (!altKey) {
        anchor.handleIn = {
          x: 2 * anchor.point.x - newPoint[0],
          y: 2 * anchor.point.y - newPoint[1],
        };
      }
    } else if (pointType === 'handleIn') {
      anchor.handleIn = toGeoPoint(newPoint);
      if (!altKey) {
        anchor.handleOut = {
          x: 2 * anchor.point.x - newPoint[0],
          y: 2 * anchor.point.y - newPoint[1],
        };
      }
    }

    anchors[index] = anchor;
    return { ...entity, anchors };
  }

  if (entity.entityType === 'arc') {
    const e = { ...entity };
    if (index === 0) e.start = toGeoPoint(newPoint);
    else if (index === 1) e.mid = toGeoPoint(newPoint);
    else if (index === 2) e.end = toGeoPoint(newPoint);
    return e;
  }

  if (entity.entityType === 'rect') {
    if (pointType === 'center') {
      const [cx, cy] = rectCenter(entity);
      const dx = newPoint[0] - cx;
      const dy = newPoint[1] - cy;
      return {
        ...entity,
        p1: { x: entity.p1.x + dx, y: entity.p1.y + dy },
        p2: { x: entity.p2.x + dx, y: entity.p2.y + dy },
      };
    }
    if (pointType === 'rotate') {
      return { ...entity, rotation: rectRotationFromHandle(entity, newPoint) };
    }

    const next = resizeRotatedRect(entity, index, newPoint);
    return { ...entity, p1: next.p1, p2: next.p2 };
  }

  if (entity.entityType === 'polygon') {
    if (pointType === 'center') {
      const cx = entity.points.reduce((s, p) => s + p.x, 0) / entity.points.length;
      const cy = entity.points.reduce((s, p) => s + p.y, 0) / entity.points.length;
      const dx = newPoint[0] - cx;
      const dy = newPoint[1] - cy;
      const points = entity.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      return { ...entity, points };
    }
    const points = [...entity.points];
    points[index] = { ...points[index]!, ...toGeoPoint(newPoint) };
    if (polygonSelfIntersects(pointsToCoords(points))) return entity;
    return { ...entity, points };
  }

  return entity;
}
