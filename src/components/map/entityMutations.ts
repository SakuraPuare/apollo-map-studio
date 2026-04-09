import type { MapEntity, BezierEntity, BezierAnchorData } from '@/types/entities';
import type { ApolloEntity, SourceDrawInfo, SourceRectInfo } from '@/types/apollo';
import type { DragPointType } from '@/types/editor';
import type { LngLat } from '@/core/geometry/interpolate';
import { rectCorners, cubicBezier } from '@/core/geometry/interpolate';
import { anchorToRuntime } from '@/core/geometry/anchorConvert';
import { polygonSelfIntersects } from '@/core/geometry/validation';
import { toGeoPoint, pointsToCoords, coordsToPoints } from '@/core/geometry/coords';
import {
  getApolloEditPoints, setApolloEditPoint, setAllApolloEditPoints,
  moveApolloEntity, deleteApolloVertex, isApolloAreaEntity, pointsToCurve,
} from '@/core/geometry/apolloCompile';

const DRAWING_TYPES = new Set(['polyline', 'catmullRom', 'bezier', 'arc', 'rect', 'polygon']);

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
  if (DRAWING_TYPES.has(entity.entityType)) return entity;

  // Apollo 实体
  return deleteApolloVertex(entity as ApolloEntity, index);
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
    points[index] = { ...points[index], ...toGeoPoint(newPoint) };
    return { ...entity, points };
  }

  if (entity.entityType === 'bezier') {
    const anchors = entity.anchors.map((a) => ({ ...a }));
    const anchor = { ...anchors[index] };

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
    const opIdx = (index + 2) % 4;
    const anchor = corners[opIdx];
    const dragged = newPoint;

    const refLat = (anchor[1] + dragged[1]) / 2;
    const cosLat = Math.cos(refLat * Math.PI / 180);
    const rot = entity.rotation;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    const project = (pt: LngLat): [number, number] => [pt[0] * cosLat, pt[1]];
    const [anchorX, anchorY] = project(anchor);
    const [draggedX, draggedY] = project(dragged);

    const mcx = (anchorX + draggedX) / 2;
    const mcy = (anchorY + draggedY) / 2;

    function unrotate(x: number, y: number): [number, number] {
      const px = x - mcx;
      const py = y - mcy;
      return [
        mcx + px * cosR - py * sinR,
        mcy + px * sinR + py * cosR,
      ];
    }

    const [ax, ay] = unrotate(anchorX, anchorY);
    const [dx, dy] = unrotate(draggedX, draggedY);

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
    points[index] = { ...points[index], ...toGeoPoint(newPoint) };
    if (polygonSelfIntersects(pointsToCoords(points))) return entity;
    return { ...entity, points };
  }

  // Apollo 实体
  if (!DRAWING_TYPES.has(entity.entityType)) {
    const apolloEntity = entity as ApolloEntity;
    const source = (apolloEntity as Record<string, unknown>)._source as SourceDrawInfo | undefined;
    const sourceRect = (apolloEntity as Record<string, unknown>)._sourceRect as SourceRectInfo | undefined;

    // ① 贝塞尔源：编辑锚点和控制柄，然后重新采样曲线
    if (source?.drawTool === 'drawBezier' && source.anchors) {
      const anchors = source.anchors.map((a) => ({ ...a }));
      const anchor = { ...anchors[index] };

      if (pointType === 'vertex') {
        const dx = newPoint[0] - anchor.point.x;
        const dy = newPoint[1] - anchor.point.y;
        anchor.point = toGeoPoint(newPoint);
        if (anchor.handleIn) anchor.handleIn = { x: anchor.handleIn.x + dx, y: anchor.handleIn.y + dy };
        if (anchor.handleOut) anchor.handleOut = { x: anchor.handleOut.x + dx, y: anchor.handleOut.y + dy };
      } else if (pointType === 'handleOut') {
        anchor.handleOut = toGeoPoint(newPoint);
        if (!altKey) anchor.handleIn = { x: 2 * anchor.point.x - newPoint[0], y: 2 * anchor.point.y - newPoint[1] };
      } else if (pointType === 'handleIn') {
        anchor.handleIn = toGeoPoint(newPoint);
        if (!altKey) anchor.handleOut = { x: 2 * anchor.point.x - newPoint[0], y: 2 * anchor.point.y - newPoint[1] };
      }
      anchors[index] = anchor;

      // 重新采样贝塞尔曲线
      const runtimeAnchors = anchors.map(anchorToRuntime);
      const newCurvePoints = coordsToPoints(cubicBezier(runtimeAnchors));
      const newSource: SourceDrawInfo = { ...source, anchors };
      const updated = setAllApolloEditPoints(apolloEntity, newCurvePoints);
      return { ...updated, _source: newSource } as MapEntity;
    }

    // ② 矩形源：旋转把手 + 角点拖拽
    if (sourceRect) {
      if (pointType === 'rotate') {
        const cx = (sourceRect.p1.x + sourceRect.p2.x) / 2;
        const cy = (sourceRect.p1.y + sourceRect.p2.y) / 2;
        const cosLat = Math.cos(cy * Math.PI / 180);
        const dx = (newPoint[0] - cx) * cosLat;
        const dy = newPoint[1] - cy;
        const angle = Math.atan2(dx, dy);
        const corners = rectCorners([sourceRect.p1.x, sourceRect.p1.y], [sourceRect.p2.x, sourceRect.p2.y], angle);
        const pts = corners.map((c) => ({ x: c[0], y: c[1] }));
        const newRect: SourceRectInfo = { ...sourceRect, rotation: angle };
        return { ...apolloEntity, polygon: { points: pts }, _sourceRect: newRect } as unknown as MapEntity;
      }
      if (pointType === 'vertex') {
        // 角点拖拽：固定对角点，重新计算矩形
        const p1L: LngLat = [sourceRect.p1.x, sourceRect.p1.y];
        const p2L: LngLat = [sourceRect.p2.x, sourceRect.p2.y];
        const corners = rectCorners(p1L, p2L, sourceRect.rotation);
        const opIdx = (index + 2) % 4;
        const anchor = corners[opIdx];
        const dragged = newPoint;
        const refLat = (anchor[1] + dragged[1]) / 2;
        const cosLat = Math.cos(refLat * Math.PI / 180);
        const rot = sourceRect.rotation;
        const cosR = Math.cos(rot), sinR = Math.sin(rot);
        const project = (pt: LngLat): [number, number] => [pt[0] * cosLat, pt[1]];
        const [anchorX, anchorY] = project(anchor);
        const [draggedX, draggedY] = project(dragged);
        const mcx = (anchorX + draggedX) / 2, mcy = (anchorY + draggedY) / 2;
        function unrotate(x: number, y: number): [number, number] {
          const px = x - mcx, py = y - mcy;
          return [mcx + px * cosR - py * sinR, mcy + px * sinR + py * cosR];
        }
        const [ax, ay] = unrotate(anchorX, anchorY);
        const [dx, dy] = unrotate(draggedX, draggedY);
        const newP1 = { x: Math.min(ax, dx) / cosLat, y: Math.min(ay, dy) };
        const newP2 = { x: Math.max(ax, dx) / cosLat, y: Math.max(ay, dy) };
        const newRect: SourceRectInfo = { p1: newP1, p2: newP2, rotation: sourceRect.rotation };
        const newCorners = rectCorners([newP1.x, newP1.y], [newP2.x, newP2.y], sourceRect.rotation);
        const pts = newCorners.map((c) => ({ x: c[0], y: c[1] }));
        return { ...apolloEntity, polygon: { points: pts }, _sourceRect: newRect } as unknown as MapEntity;
      }
    }

    // ③ 通用拖拽
    if (pointType === 'center') {
      const pts = getApolloEditPoints(apolloEntity);
      if (pts.length === 0) return entity;
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      return moveApolloEntity(apolloEntity, newPoint[0] - cx, newPoint[1] - cy) as MapEntity;
    }
    return setApolloEditPoint(apolloEntity, index, toGeoPoint(newPoint)) as MapEntity;
  }

  return entity;
}
