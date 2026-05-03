import type { DragPointType } from '@/types/editor';
import type { ApolloEntity, SourceDrawInfo, SourceRectInfo } from '@/types/apollo';
import { getSource, getSourceRect } from '@/types/apollo';
import type { GeoPoint, MapEntity } from '@/types/entities';
import type { LngLat } from '@/core/geometry/interpolate';
import { cubicBezier, threePointArc } from '@/core/geometry/interpolate';
import { anchorToRuntime } from '@/core/geometry/anchorConvert';
import { coordsToPoints, toGeoPoint, toLngLat } from '@/core/geometry/coords';
import {
  deleteVertex as deleteApolloVertex,
  getEditPoints as getApolloEditPoints,
  moveEntity as moveApolloEntity,
  setAllEditPoints as setAllApolloEditPoints,
  setEditPoint as setApolloEditPoint,
} from '@/lib/entityOps';
import { rectCenter, rectPolygonPoints, rectRotationFromHandle, resizeRotatedRect } from './rect';

type RectSourceEntity<E> = E extends { polygon: unknown }
  ? '_sourceRect' extends keyof E
    ? E
    : never
  : never;

type ApolloRectSourceEntity = RectSourceEntity<ApolloEntity>;

function hasRectSource(
  entity: ApolloEntity,
): entity is ApolloRectSourceEntity & { _sourceRect: SourceRectInfo } {
  return getSourceRect(entity) !== undefined && 'polygon' in entity;
}

function withSourceRect<TEntity extends ApolloRectSourceEntity>(
  entity: TEntity,
  sourceRect: SourceRectInfo,
): TEntity {
  return {
    ...entity,
    polygon: { points: rectPolygonPoints(sourceRect) },
    _sourceRect: sourceRect,
  };
}

export function getApolloDragCenter(entity: ApolloEntity): LngLat | null {
  const sourceRect = getSourceRect(entity);
  if (sourceRect) return rectCenter(sourceRect);

  const pts = getApolloEditPoints(entity);
  if (pts.length === 0) return null;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return [cx, cy];
}

export function deleteApolloEntityVertex(entity: ApolloEntity, index: number): MapEntity | null {
  return deleteApolloVertex(entity, index);
}

interface BezierSourceDragContext {
  entity: ApolloEntity;
  source: SourceDrawInfo;
  index: number;
  pointType: DragPointType;
  newPoint: LngLat;
  altKey: boolean;
}

function applyBezierSourceDrag({
  entity,
  source,
  index,
  pointType,
  newPoint,
  altKey,
}: BezierSourceDragContext): MapEntity {
  const anchors = source.anchors!.map((a) => ({ ...a }));
  const anchor = { ...anchors[index]! };

  if (pointType === 'vertex') {
    const dx = newPoint[0] - anchor.point.x;
    const dy = newPoint[1] - anchor.point.y;
    anchor.point = toGeoPoint(newPoint);
    if (anchor.handleIn) anchor.handleIn = { x: anchor.handleIn.x + dx, y: anchor.handleIn.y + dy };
    if (anchor.handleOut)
      anchor.handleOut = { x: anchor.handleOut.x + dx, y: anchor.handleOut.y + dy };
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

  const runtimeAnchors = anchors.map(anchorToRuntime);
  const newCurvePoints = coordsToPoints(cubicBezier(runtimeAnchors));
  const newSource: SourceDrawInfo = { ...source, anchors };
  const updated = setAllApolloEditPoints(entity, newCurvePoints);
  return { ...updated, _source: newSource } as MapEntity;
}

function applyArcSourceDrag(
  entity: ApolloEntity,
  source: SourceDrawInfo,
  index: number,
  newPoint: LngLat,
): MapEntity {
  const arcPoints = [...source.arcPoints!] as [GeoPoint, GeoPoint, GeoPoint];
  if (index >= 0 && index < 3) arcPoints[index] = toGeoPoint(newPoint);
  const [s, m, e] = arcPoints;
  const newCurvePoints = coordsToPoints(threePointArc(toLngLat(s), toLngLat(m), toLngLat(e)));
  const newSource: SourceDrawInfo = { ...source, arcPoints };
  const updated = setAllApolloEditPoints(entity, newCurvePoints);
  return { ...updated, _source: newSource } as MapEntity;
}

function applyRectSourceDrag(
  entity: ApolloRectSourceEntity,
  sourceRect: SourceRectInfo,
  index: number,
  pointType: DragPointType,
  newPoint: LngLat,
): MapEntity {
  if (pointType === 'rotate') {
    const newRect: SourceRectInfo = {
      ...sourceRect,
      rotation: rectRotationFromHandle(sourceRect, newPoint),
    };
    return withSourceRect(entity, newRect);
  }

  if (pointType === 'vertex') {
    const newRect = resizeRotatedRect(sourceRect, index, newPoint);
    return withSourceRect(entity, newRect);
  }

  if (pointType === 'center') {
    const [cx, cy] = rectCenter(sourceRect);
    const dx = newPoint[0] - cx;
    const dy = newPoint[1] - cy;
    const newRect: SourceRectInfo = {
      p1: { x: sourceRect.p1.x + dx, y: sourceRect.p1.y + dy },
      p2: { x: sourceRect.p2.x + dx, y: sourceRect.p2.y + dy },
      rotation: sourceRect.rotation,
    };
    return withSourceRect(entity, newRect);
  }

  return entity;
}

export function applyApolloDrag(
  entity: ApolloEntity,
  index: number,
  pointType: DragPointType,
  newPoint: LngLat,
  altKey = false,
): MapEntity {
  const source = getSource(entity);

  if (source?.drawTool === 'drawBezier' && source.anchors) {
    return applyBezierSourceDrag({ entity, source, index, pointType, newPoint, altKey });
  }

  if (source?.drawTool === 'drawArc' && source.arcPoints) {
    return applyArcSourceDrag(entity, source, index, newPoint);
  }

  if (hasRectSource(entity)) {
    return applyRectSourceDrag(entity, entity._sourceRect, index, pointType, newPoint);
  }

  if (pointType === 'center') {
    const pts = getApolloEditPoints(entity);
    if (pts.length === 0) return entity;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return moveApolloEntity(entity, newPoint[0] - cx, newPoint[1] - cy);
  }

  return setApolloEditPoint(entity, index, toGeoPoint(newPoint));
}

/** Alt+点击 Apollo 贝塞尔源实体的锚点：尖角 ↔ 平滑切换 */
export function toggleSmoothApollo(entity: ApolloEntity, index: number): ApolloEntity {
  const source = getSource(entity);
  if (!source?.anchors) return entity;

  const anchors = source.anchors.map((a) => ({ ...a }));
  const anchor = { ...anchors[index]! };
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
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const scale = prev && next ? len / 6 : len / 3;
      const nx = dx / len;
      const ny = dy / len;
      anchor.handleOut = { x: px + nx * scale, y: py + ny * scale };
      anchor.handleIn = { x: px - nx * scale, y: py - ny * scale };
    }
  }
  anchors[index] = anchor;

  const runtimeAnchors = anchors.map(anchorToRuntime);
  const newCurvePoints = coordsToPoints(cubicBezier(runtimeAnchors));
  const newSource: SourceDrawInfo = { ...source, anchors };
  const updated = setAllApolloEditPoints(entity, newCurvePoints);
  return { ...updated, _source: newSource } as ApolloEntity;
}
