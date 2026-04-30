import { DEFAULT_LANE_HALF_WIDTH } from '@/config/mapConstants';
import type { LngLat } from '@/core/geometry/interpolate';
import { pointsToCoords } from '@/core/geometry/coords';
import { polylineLengthMeters } from '@/lib/geo';
import type { ApolloEntity } from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';
import { offsetPolylineDeg } from './offsetPolyline';

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
      return entity.centralCurve.segments[0]?.lineSegment.points ?? [];
    case 'stopSign':
      return entity.stopLines[0]?.segments[0]?.lineSegment.points ?? [];
    case 'speedBump':
      return entity.position[0]?.segments[0]?.lineSegment.points ?? [];
    case 'yieldSign':
      return entity.stopLines[0]?.segments[0]?.lineSegment.points ?? [];
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
  return setAllApolloEditPoints(
    entity,
    pts.map((p) => ({
      x: p.x + dx,
      y: p.y + dy,
      ...(p.z !== undefined ? { z: p.z } : {}),
    })),
  );
}

export function deleteApolloVertex(entity: ApolloEntity, index: number): ApolloEntity | null {
  const pts = getApolloEditPoints(entity);
  const min = isApolloAreaEntity(entity) ? 3 : 2;
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

export function isApolloAreaEntity(entity: ApolloEntity): boolean {
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
