import {
  entitiesToApolloMap,
  entityToRawApolloElement,
  rawApolloElementToEntity,
  type ApolloMapEntityField,
} from '@/io/proto/entityBridge';
import type { BezierAnchor, LngLat } from '@/core/geometry/interpolate';
import { rotatedRectFromPoints } from '@/core/geometry/interpolate';
import { anchorToData } from '@/core/geometry/anchorConvert';
import { coordsToPoints, toGeoPoint } from '@/core/geometry/coords';
import {
  areDrawPointsNear,
  DRAW_FINISH_CLUSTER_METERS,
  normalizePolylineDrawPoints,
} from '@/core/geometry/drawPoints';
import { DEFAULT_LANE_HALF_WIDTH } from '@/config/mapConstants';
import { createEntity as createApolloEntity } from '@/lib/entityOps';
import { nextEntityId } from '@/lib/idGenerator';
import type {
  ArcEntity,
  BezierEntity,
  CatmullRomEntity,
  MapEntity,
  PolygonEntity,
  PolylineEntity,
  RectEntity,
} from '@/types/entities';
import { ELEMENT_MAP, type MapElementType } from '@/core/elements';
import type { DrawTool } from '@/core/fsm/editorMachine';
import type { BoundaryLineType } from '@/types/apollo';

export interface MapEditingSession {
  readonly entities: ReadonlyMap<string, MapEntity>;
  addEntity(entity: MapEntity): MapEntity;
  addApolloRawElement(field: ApolloMapEntityField, raw: unknown): MapEntity | null;
  toEntitiesArray(): MapEntity[];
  exportApolloMap(baseMap: Record<string, unknown>): Record<string, unknown>;
  exportApolloRawElement(entity: MapEntity): unknown | null;
}

interface CreateDrawnEntityOptions {
  laneHalfWidth?: number;
  laneSpeedLimit?: number;
  laneBoundaryType?: BoundaryLineType;
  entities?: ReadonlyMap<string, MapEntity>;
}

const MIN_POLYGON_AREA_DEGREES = 1e-18;

function triangleArea(a: LngLat, b: LngLat, c: LngLat): number {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
}

function polygonArea(points: LngLat[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area) / 2;
}

function countDistinctPoints(points: LngLat[]): number {
  const distinct: LngLat[] = [];
  for (const point of points) {
    if (distinct.every((candidate) => !areDrawPointsNear(candidate, point))) {
      distinct.push(point);
    }
  }
  return distinct.length;
}

function hasNonDegenerateArc(points: LngLat[]): boolean {
  if (points.length < 3) return false;
  const [a, b, c] = points as [LngLat, LngLat, LngLat, ...LngLat[]];
  if (areDrawPointsNear(a, b) || areDrawPointsNear(b, c) || areDrawPointsNear(a, c)) return false;
  return triangleArea(a, b, c) > MIN_POLYGON_AREA_DEGREES;
}

function hasNonDegenerateRotatedRect(points: LngLat[]): boolean {
  if (points.length < 3) return false;
  const [a, b, c] = points as [LngLat, LngLat, LngLat, ...LngLat[]];
  if (areDrawPointsNear(a, b)) return false;
  return triangleArea(a, b, c) > MIN_POLYGON_AREA_DEGREES;
}

function hasNonDegeneratePolygon(points: LngLat[]): boolean {
  return countDistinctPoints(points) >= 3 && polygonArea(points) > MIN_POLYGON_AREA_DEGREES;
}

function hasNonDegenerateBezier(anchors: BezierAnchor[]): boolean {
  return countDistinctPoints(anchors.map((anchor) => anchor.point)) >= 2;
}

export function hasDrawableGeometry(
  state: string,
  points: LngLat[],
  anchors: BezierAnchor[],
): boolean {
  const drawPoints = normalizePolylineDrawPoints(state, points);
  return (
    (state === 'drawBezier' && hasNonDegenerateBezier(anchors)) ||
    (state === 'drawArc' && hasNonDegenerateArc(drawPoints)) ||
    (state === 'drawRotatedRect' && hasNonDegenerateRotatedRect(drawPoints)) ||
    (state === 'drawPolygon' && hasNonDegeneratePolygon(drawPoints)) ||
    ((state === 'drawPolyline' || state === 'drawCatmullRom') && drawPoints.length >= 2)
  );
}

function isDrawToolCompatibleWithElement(
  element: MapElementType,
  state: string,
): state is DrawTool {
  return ELEMENT_MAP.get(element)?.tools.includes(state as DrawTool) ?? false;
}

function finishClusterMetersForElement(
  element: MapElementType | null,
  options: CreateDrawnEntityOptions | undefined,
): number {
  if (element !== 'lane') return DRAW_FINISH_CLUSTER_METERS;
  return Math.max(
    DRAW_FINISH_CLUSTER_METERS,
    (options?.laneHalfWidth ?? DEFAULT_LANE_HALF_WIDTH) * 2,
  );
}

function createPrimitiveDrawnEntity(
  state: string,
  drawPoints: LngLat[],
  anchors: BezierAnchor[],
  entities: ReadonlyMap<string, MapEntity> | undefined,
): MapEntity | null {
  if (state === 'drawPolyline' || state === 'drawCatmullRom') {
    const entityType = state === 'drawPolyline' ? 'polyline' : 'catmullRom';
    return {
      id: nextEntityId(entityType, entities),
      entityType,
      points: coordsToPoints(drawPoints),
    } as PolylineEntity | CatmullRomEntity;
  }

  if (state === 'drawBezier') {
    return {
      id: nextEntityId('bezier', entities),
      entityType: 'bezier',
      anchors: anchors.map(anchorToData),
    } as BezierEntity;
  }

  if (state === 'drawArc') {
    return {
      id: nextEntityId('arc', entities),
      entityType: 'arc',
      start: toGeoPoint(drawPoints[0]!),
      mid: toGeoPoint(drawPoints[1]!),
      end: toGeoPoint(drawPoints[2]!),
    } as ArcEntity;
  }

  if (state === 'drawRotatedRect') {
    const rect = rotatedRectFromPoints(drawPoints[0]!, drawPoints[1]!, drawPoints[2]!);
    return {
      id: nextEntityId('rect', entities),
      entityType: 'rect',
      p1: toGeoPoint(rect.p1),
      p2: toGeoPoint(rect.p2),
      rotation: rect.rotation,
    } as RectEntity;
  }

  if (state === 'drawPolygon') {
    return {
      id: nextEntityId('polygon', entities),
      entityType: 'polygon',
      points: coordsToPoints(drawPoints),
    } as PolygonEntity;
  }

  return null;
}

export function createDrawnEntity(
  state: string,
  points: LngLat[],
  anchors: BezierAnchor[],
  element: MapElementType | null,
  options?: CreateDrawnEntityOptions,
): MapEntity | null {
  const drawPoints = normalizePolylineDrawPoints(state, points, {
    finishClusterMeters: finishClusterMetersForElement(element, options),
  });
  if (!hasDrawableGeometry(state, drawPoints, anchors)) return null;

  if (element) {
    if (!isDrawToolCompatibleWithElement(element, state)) return null;
    return createApolloEntity(element, state, drawPoints, anchors, {
      laneHalfWidth: options?.laneHalfWidth,
      laneSpeedLimit: options?.laneSpeedLimit,
      laneBoundaryType: options?.laneBoundaryType,
      entities: options?.entities,
    });
  }

  return createPrimitiveDrawnEntity(state, drawPoints, anchors, options?.entities);
}

export function createMapEditingSession(seed?: Iterable<MapEntity>): MapEditingSession {
  const entities = new Map<string, MapEntity>();
  for (const entity of seed ?? []) entities.set(entity.id, entity);

  return {
    get entities() {
      return entities;
    },

    addEntity(entity) {
      entities.set(entity.id, entity);
      return entity;
    },

    addApolloRawElement(field, raw) {
      const entity = rawApolloElementToEntity(field, raw);
      if (!entity) return null;
      this.addEntity(entity);
      return entity;
    },

    toEntitiesArray() {
      return Array.from(entities.values());
    },

    exportApolloMap(baseMap) {
      return entitiesToApolloMap(baseMap, this.toEntitiesArray());
    },

    exportApolloRawElement(entity) {
      return entityToRawApolloElement(entity);
    },
  };
}
