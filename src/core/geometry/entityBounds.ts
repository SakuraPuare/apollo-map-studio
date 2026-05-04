import type { MapEntity, GeoPoint } from '@/types/entities';
import type { ApolloEntity, Curve, RoadEntity } from '@/types/apollo';
import { rectCorners } from './interpolate';

export interface EntityBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsForEntity(entity: MapEntity): EntityBounds | null {
  const points = pointsForBounds(entity);
  return boundsOfPoints(points);
}

export function boundsCenter(bounds: EntityBounds): [number, number] {
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
}

export function isTinyBounds(bounds: EntityBounds): boolean {
  return Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) < 1e-7;
}

function pointsForBounds(entity: MapEntity): GeoPoint[] {
  switch (entity.entityType) {
    case 'polyline':
    case 'catmullRom':
    case 'polygon':
      return entity.points;
    case 'bezier':
      return entity.anchors.flatMap((anchor) =>
        [anchor.point, anchor.handleIn, anchor.handleOut].filter((p): p is GeoPoint => p !== null),
      );
    case 'arc':
      return [entity.start, entity.mid, entity.end];
    case 'rect':
      return rectCorners(
        [entity.p1.x, entity.p1.y],
        [entity.p2.x, entity.p2.y],
        entity.rotation,
      ).map(([x, y]) => ({ x, y }));
    default:
      return apolloPointsForBounds(entity);
  }
}

function apolloPointsForBounds(entity: ApolloEntity): GeoPoint[] {
  const polygon = polygonPointsForBounds(entity);
  if (polygon) return polygon;

  switch (entity.entityType) {
    case 'lane':
      return [
        ...curvePoints(entity.leftBoundary.curve),
        ...curvePoints(entity.rightBoundary.curve),
        ...curvePoints(entity.centralCurve),
      ];
    case 'signal':
      return [
        ...entity.boundary.points,
        ...stopLinePoints(entity.stopLines),
        ...subsignalPoints(entity.subsignals),
      ];
    case 'stopSign':
    case 'yieldSign':
      return stopLinePoints(entity.stopLines);
    case 'speedBump':
      return stopLinePoints(entity.position);
    case 'road':
      return roadPoints(entity);
    default:
      return [];
  }
}

function polygonPointsForBounds(entity: ApolloEntity): GeoPoint[] | null {
  switch (entity.entityType) {
    case 'junction':
    case 'parkingSpace':
    case 'parkingLot':
    case 'crosswalk':
    case 'clearArea':
    case 'pncJunction':
    case 'barrierGate':
    case 'area':
    case 'speedControl':
      return entity.polygon.points;
    default:
      return null;
  }
}

function stopLinePoints(curves: readonly Curve[]): GeoPoint[] {
  return curves.flatMap(curvePoints);
}

function subsignalPoints(subsignals: readonly { location?: GeoPoint }[]): GeoPoint[] {
  const out: GeoPoint[] = [];
  for (const subsignal of subsignals) {
    if (subsignal.location) out.push(subsignal.location);
  }
  return out;
}

function roadPoints(road: RoadEntity): GeoPoint[] {
  const out: GeoPoint[] = [];
  for (const section of road.sections) {
    const boundary = section.boundary;
    if (!boundary) continue;
    for (const edge of boundary.outerPolygon.edges) out.push(...curvePoints(edge.curve));
    for (const hole of boundary.holes) {
      for (const edge of hole.edges) out.push(...curvePoints(edge.curve));
    }
  }
  return out;
}

function curvePoints(curve: Curve | undefined): GeoPoint[] {
  return curve?.segments.flatMap((segment) => segment.lineSegment.points) ?? [];
}

function boundsOfPoints(points: readonly GeoPoint[]): EntityBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}
