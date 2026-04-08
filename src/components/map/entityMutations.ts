import type { MapEntity, BezierEntity } from '@/types/entities';
import type { DragPointType } from '@/core/fsm/editorMachine';
import type { LngLat } from '@/core/geometry/interpolate';

/** Alt+点击锚点：尖角↔平滑切换 */
export function toggleSmooth(entity: BezierEntity, index: number): BezierEntity {
  const anchors = entity.anchors.map((a) => ({ ...a }));
  const anchor = anchors[index];
  const hasHandles = anchor.handleIn !== null || anchor.handleOut !== null;

  if (hasHandles) {
    anchor.handleIn = null;
    anchor.handleOut = null;
  } else {
    const prev = index > 0 ? anchors[index - 1] : null;
    const next = index < anchors.length - 1 ? anchors[index + 1] : null;
    const px = anchor.point.x;
    const py = anchor.point.y;

    let dx = 0, dy = 0, len = 0;
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
      const scale = (prev && next) ? len / 6 : len / 3;
      const nx = dx / len;
      const ny = dy / len;
      anchor.handleOut = { x: px + nx * scale, y: py + ny * scale };
      anchor.handleIn = { x: px - nx * scale, y: py - ny * scale };
    }
  }

  anchors[index] = anchor;
  return { ...entity, anchors };
}

/** 对实体应用拖拽偏移，返回新实体（不修改原实体） */
export function applyDrag(
  entity: MapEntity,
  index: number,
  pointType: DragPointType,
  newPoint: LngLat,
  altKey = false,
): MapEntity {
  if (entity.entityType === 'polyline' || entity.entityType === 'catmullRom') {
    const points = [...entity.points];
    points[index] = { ...points[index], x: newPoint[0], y: newPoint[1] };
    return { ...entity, points };
  }

  if (entity.entityType === 'bezier') {
    const anchors = entity.anchors.map((a) => ({ ...a }));
    const anchor = { ...anchors[index] };

    if (pointType === 'vertex') {
      const dx = newPoint[0] - anchor.point.x;
      const dy = newPoint[1] - anchor.point.y;
      anchor.point = { x: newPoint[0], y: newPoint[1] };
      if (anchor.handleIn) {
        anchor.handleIn = { x: anchor.handleIn.x + dx, y: anchor.handleIn.y + dy };
      }
      if (anchor.handleOut) {
        anchor.handleOut = { x: anchor.handleOut.x + dx, y: anchor.handleOut.y + dy };
      }
    } else if (pointType === 'handleOut') {
      anchor.handleOut = { x: newPoint[0], y: newPoint[1] };
      if (!altKey) {
        anchor.handleIn = {
          x: 2 * anchor.point.x - newPoint[0],
          y: 2 * anchor.point.y - newPoint[1],
        };
      }
    } else if (pointType === 'handleIn') {
      anchor.handleIn = { x: newPoint[0], y: newPoint[1] };
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
    if (index === 0) e.start = { x: newPoint[0], y: newPoint[1] };
    else if (index === 1) e.mid = { x: newPoint[0], y: newPoint[1] };
    else if (index === 2) e.end = { x: newPoint[0], y: newPoint[1] };
    return e;
  }

  return entity;
}
