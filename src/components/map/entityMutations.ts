import type { MapEntity, BezierEntity, RectEntity } from '@/types/entities';
import type { DragPointType } from '@/core/fsm/editorMachine';
import type { LngLat } from '@/core/geometry/interpolate';
import { rectCorners, polygonSelfIntersects } from '@/core/geometry/interpolate';

/**
 * 删除实体的第 index 个顶点。
 * 返回新实体，如果删除后顶点不足最小数量则返回 null（表示应删除整个实体）。
 */
export function deleteVertex(entity: MapEntity, index: number): MapEntity | null {
  if (entity.entityType === 'polyline' || entity.entityType === 'catmullRom') {
    if (entity.points.length <= 2) return null;
    const points = entity.points.filter((_, i) => i !== index);
    return { ...entity, points };
  }

  if (entity.entityType === 'bezier') {
    if (entity.anchors.length <= 2) return null;
    const anchors = entity.anchors.filter((_, i) => i !== index);
    return { ...entity, anchors };
  }

  if (entity.entityType === 'polygon') {
    if (entity.points.length <= 3) return null;
    const points = entity.points.filter((_, i) => i !== index);
    return { ...entity, points };
  }

  // arc / rect 不支持顶点删除
  return entity;
}

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

  if (entity.entityType === 'rect') {
    if (pointType === 'center') {
      // 整体平移：newPoint 是鼠标当前位置，算出相对当前中心的偏移
      const cx = (entity.p1.x + entity.p2.x) / 2;
      const cy = (entity.p1.y + entity.p2.y) / 2;
      const dx = newPoint[0] - cx;
      const dy = newPoint[1] - cy;
      return {
        ...entity,
        p1: { x: entity.p1.x + dx, y: entity.p1.y + dy },
        p2: { x: entity.p2.x + dx, y: entity.p2.y + dy },
      };
    }
    if (pointType === 'rotate') {
      // 旋转手柄：计算鼠标相对中心的角度
      const cx = (entity.p1.x + entity.p2.x) / 2;
      const cy = (entity.p1.y + entity.p2.y) / 2;
      const refLat = cy;
      const cosLat = Math.cos(refLat * Math.PI / 180);
      const dx = (newPoint[0] - cx) * cosLat;
      const dy = newPoint[1] - cy;
      const angle = Math.atan2(dx, dy);
      return { ...entity, rotation: angle };
    }

    // 角点拖拽：对角点固定，拖拽点和对角点重新定义 p1/p2
    const corners = rectCorners([entity.p1.x, entity.p1.y], [entity.p2.x, entity.p2.y], entity.rotation);
    // corners: [0]=p1旋转后, [1]=(p2.x,p1.y)旋转后, [2]=p2旋转后, [3]=(p1.x,p2.y)旋转后, [4]=闭合
    const opIdx = (index + 2) % 4;
    const anchor = corners[opIdx]; // 对角点固定不动
    const dragged = newPoint;      // 拖拽到的新位置

    const refLat = (anchor[1] + dragged[1]) / 2;
    const cosLat = Math.cos(refLat * Math.PI / 180);
    const rot = entity.rotation;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    // 统一到投影坐标（x 按 cosLat 缩放）后再做逆旋转，避免坐标空间混用
    const project = (pt: LngLat): [number, number] => [pt[0] * cosLat, pt[1]];
    const [anchorX, anchorY] = project(anchor);
    const [draggedX, draggedY] = project(dragged);

    // 将两个点逆旋转回轴对齐空间（绕两点中心）
    const mcx = (anchorX + draggedX) / 2;
    const mcy = (anchorY + draggedY) / 2;

    function unrotate(x: number, y: number): [number, number] {
      const px = x - mcx;
      const py = y - mcy;
      // 逆旋转（rectCorners 用 -rotation，所以逆旋转用 +rotation）
      return [
        mcx + px * cosR - py * sinR,
        mcy + px * sinR + py * cosR,
      ];
    }

    const [ax, ay] = unrotate(anchorX, anchorY);
    const [dx, dy] = unrotate(draggedX, draggedY);

    // 轴对齐空间中的 p1/p2（min/max）
    const minX = Math.min(ax, dx);
    const maxX = Math.max(ax, dx);
    const minY = Math.min(ay, dy);
    const maxY = Math.max(ay, dy);

    return {
      ...entity,
      p1: { x: minX / cosLat, y: minY },
      p2: { x: maxX / cosLat, y: maxY },
    };
  }

  if (entity.entityType === 'polygon') {
    if (pointType === 'center') {
      const cx = entity.points.reduce((s, p) => s + p.x, 0) / entity.points.length;
      const cy = entity.points.reduce((s, p) => s + p.y, 0) / entity.points.length;
      const dx = newPoint[0] - cx;
      const dy = newPoint[1] - cy;
      const points = entity.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      return { ...entity, points };
    }
    const points = [...entity.points];
    points[index] = { ...points[index], x: newPoint[0], y: newPoint[1] };
    // 自交检测：如果拖拽后自交，拒绝变更
    const coords: LngLat[] = points.map(p => [p.x, p.y]);
    if (polygonSelfIntersects(coords)) return entity;
    return { ...entity, points };
  }

  return entity;
}
