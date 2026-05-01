import { DEFAULT_LANE_HALF_WIDTH } from '@/config/mapConstants';
import type { LngLat } from '@/core/geometry/interpolate';
import { pointsToCoords } from '@/core/geometry/coords';
import { polylineLengthMeters } from '@/lib/geo';
import type { ApolloEntity, Curve, LaneBoundary } from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';
import { curvePoints, explicitLaneBoundaryEdges } from './laneBoundaryGeometry';
import { offsetPolylineDeg } from './offsetPolyline';

function translatePoint(point: GeoPoint, dx: number, dy: number): GeoPoint {
  return {
    x: point.x + dx,
    y: point.y + dy,
    ...(point.z !== undefined ? { z: point.z } : {}),
  };
}

function translateCurve(curve: Curve, dx: number, dy: number): Curve {
  return {
    segments: curve.segments.map((segment) => {
      const points = segment.lineSegment.points.map((point) => translatePoint(point, dx, dy));
      const startPosition = segment.startPosition ??
        segment.lineSegment.points[0] ?? { x: 0, y: 0 };
      return {
        ...segment,
        startPosition: translatePoint(startPosition, dx, dy),
        lineSegment: { points },
      };
    }),
  };
}

function emptyBoundaryCurve(boundary: LaneBoundary): LaneBoundary {
  return {
    ...boundary,
    curve: { segments: [] },
    length: 0,
  };
}

export function getApolloEditPoints(entity: ApolloEntity): GeoPoint[] {
  switch (entity.entityType) {
    case 'junction':
    case 'pncJunction':
    case 'parkingSpace':
    case 'crosswalk':
    case 'clearArea':
    case 'area':
    case 'parkingLot':
      return entity.polygon.points;
    case 'barrierGate':
      return entity.stopLines[0]?.segments[0]?.lineSegment.points ?? entity.polygon.points;
    case 'signal':
      return entity.stopLines[0]?.segments[0]?.lineSegment.points ?? entity.boundary.points;
    case 'lane':
      return curvePoints(entity.centralCurve);
    case 'stopSign':
      return entity.stopLines[0]?.segments[0]?.lineSegment.points ?? [];
    case 'speedBump':
      return entity.position[0]?.segments[0]?.lineSegment.points ?? [];
    case 'yieldSign':
      return entity.stopLines[0]?.segments[0]?.lineSegment.points ?? [];
    case 'road':
      // Road geometry lives in section[].boundary.outer_polygon.edge[].curve.
      // For now we expose the first section's first outer edge as the
      // editable polyline — enough to make road selectable + draggable. A
      // multi-edge editor is future work.
      return (
        entity.sections[0]?.boundary?.outerPolygon.edges[0]?.curve.segments[0]?.lineSegment
          .points ?? []
      );
    default:
      return [];
  }
}

export function setAllApolloEditPoints(entity: ApolloEntity, points: GeoPoint[]): ApolloEntity {
  switch (entity.entityType) {
    case 'junction':
    case 'pncJunction':
    case 'parkingSpace':
    case 'crosswalk':
    case 'clearArea':
    case 'area':
    case 'parkingLot':
      return { ...entity, polygon: { points } } as typeof entity;
    case 'barrierGate': {
      if (entity.stopLines.length > 0) {
        const l = [...entity.stopLines];
        const s = [...l[0]!.segments];
        s[0] = { ...s[0]!, lineSegment: { points } };
        l[0] = { ...l[0]!, segments: s };
        return { ...entity, stopLines: l };
      }
      return { ...entity, polygon: { points } } as typeof entity;
    }
    case 'signal': {
      if (entity.stopLines.length > 0) {
        const l = [...entity.stopLines];
        const s = [...l[0]!.segments];
        s[0] = { ...s[0]!, lineSegment: { points } };
        l[0] = { ...l[0]!, segments: s };
        return { ...entity, stopLines: l };
      }
      return { ...entity, boundary: { points } } as typeof entity;
    }
    case 'lane': {
      const segs = [...entity.centralCurve.segments];
      segs[0] = { ...segs[0]!, lineSegment: { points } };
      return {
        ...entity,
        centralCurve: { segments: segs },
        leftBoundary: emptyBoundaryCurve(entity.leftBoundary),
        rightBoundary: emptyBoundaryCurve(entity.rightBoundary),
        length: polylineLengthMeters(points),
      };
    }
    case 'stopSign': {
      const l = [...entity.stopLines];
      const s = [...l[0]!.segments];
      s[0] = { ...s[0]!, lineSegment: { points } };
      l[0] = { ...l[0]!, segments: s };
      return { ...entity, stopLines: l };
    }
    case 'speedBump': {
      const p = [...entity.position];
      const s = [...p[0]!.segments];
      s[0] = { ...s[0]!, lineSegment: { points } };
      p[0] = { ...p[0]!, segments: s };
      return { ...entity, position: p };
    }
    case 'yieldSign': {
      const l = [...entity.stopLines];
      const s = [...l[0]!.segments];
      s[0] = { ...s[0]!, lineSegment: { points } };
      l[0] = { ...l[0]!, segments: s };
      return { ...entity, stopLines: l };
    }
    case 'road': {
      const sections = [...entity.sections];
      const sec0 = sections[0];
      if (!sec0?.boundary) return entity;
      const outer = sec0.boundary.outerPolygon;
      const edges = [...outer.edges];
      const edge0 = edges[0];
      if (!edge0) return entity;
      const segs = [...edge0.curve.segments];
      segs[0] = { ...segs[0]!, lineSegment: { points } };
      edges[0] = { ...edge0, curve: { segments: segs } };
      sections[0] = {
        ...sec0,
        boundary: { ...sec0.boundary, outerPolygon: { ...outer, edges } },
      };
      return { ...entity, sections };
    }
    default:
      return entity;
  }
}

export function setApolloEditPoint(
  entity: ApolloEntity,
  index: number,
  point: GeoPoint,
): ApolloEntity {
  const pts = [...getApolloEditPoints(entity)];
  if (index < 0 || index >= pts.length) return entity;
  pts[index] = point;
  return setAllApolloEditPoints(entity, pts);
}

export function moveApolloEntity(entity: ApolloEntity, dx: number, dy: number): ApolloEntity {
  const pts = getApolloEditPoints(entity);
  if (pts.length === 0) return entity;
  if (entity.entityType === 'lane') {
    return {
      ...entity,
      centralCurve: translateCurve(entity.centralCurve, dx, dy),
      leftBoundary: {
        ...entity.leftBoundary,
        curve: translateCurve(entity.leftBoundary.curve, dx, dy),
      },
      rightBoundary: {
        ...entity.rightBoundary,
        curve: translateCurve(entity.rightBoundary.curve, dx, dy),
      },
    };
  }
  return setAllApolloEditPoints(
    entity,
    pts.map((p) => translatePoint(p, dx, dy)),
  );
}

export function deleteApolloVertex(entity: ApolloEntity, index: number): ApolloEntity | null {
  const pts = getApolloEditPoints(entity);
  // lane 的 editPoints 是中心线（折线），最小 2 点；其他面元素的 editPoints 是
  // 多边形环，最小 3 点。用 isApolloPolygonEditPoints 而非 isApolloAreaEntity——
  // 后者把 lane 也算 area（hitTest 需要），但删点要看的是 editPoints 本身的拓扑。
  const min = isApolloPolygonEditPoints(entity) ? 3 : 2;
  if (pts.length <= min) return null;
  return setAllApolloEditPoints(
    entity,
    pts.filter((_, i) => i !== index),
  );
}

export function apolloEntityCoords(entity: ApolloEntity): LngLat[] {
  const pts = getApolloEditPoints(entity);
  if (pts.length === 0) return [];
  if (entity.entityType === 'lane') {
    const explicitEdges = explicitLaneBoundaryEdges(entity);
    if (explicitEdges) {
      return [...explicitEdges.left, ...[...explicitEdges.right].reverse()].map(
        (point) => [point.x, point.y] as LngLat,
      );
    }
    const leftW = entity.leftSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
    const rightW = entity.rightSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
    const left = offsetPolylineDeg(pts, leftW, 'left');
    const right = offsetPolylineDeg(pts, rightW, 'right');
    // Keep lane hit-test rings non-self-intersecting; compileApolloFeatures
    // builds the same left + reversed-right polygon.
    return [...left, ...[...right].reverse()].map((point) => [point.x, point.y] as LngLat);
  }
  return pointsToCoords(pts);
}

export function isApolloAreaEntity(entity: { entityType: string }): boolean {
  switch (entity.entityType) {
    case 'junction':
    case 'parkingSpace':
    case 'crosswalk':
    case 'clearArea':
    case 'area':
    case 'parkingLot':
    case 'pncJunction':
    case 'lane':
      return true;
    default:
      return false;
  }
}

/**
 * Whether this entity's `getApolloEditPoints` output is a closed polygon ring
 * (true) or an open polyline (false).
 *
 * Distinct from `isApolloAreaEntity`:
 *   - lane is "area" (hitTest treats fill interior as a hit) but its editPoints
 *     are the central curve — a polyline. Using `isApolloAreaEntity` for hot
 *     layer rendering would close the central curve into a polygon.
 *   - signal/stopSign/yieldSign/barrierGate/speedBump edit on stop_line /
 *     position curves — polyline.
 */
export function isApolloPolygonEditPoints(entity: { entityType: string }): boolean {
  switch (entity.entityType) {
    case 'junction':
    case 'parkingSpace':
    case 'crosswalk':
    case 'clearArea':
    case 'area':
    case 'parkingLot':
    case 'pncJunction':
      return true;
    default:
      return false;
  }
}
