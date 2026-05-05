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
import type { MapElementType } from '@/core/elements';
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

export function hasDrawableGeometry(
  state: string,
  points: LngLat[],
  anchors: BezierAnchor[],
): boolean {
  const drawPoints = normalizePolylineDrawPoints(state, points);
  return (
    (state === 'drawBezier' && anchors.length >= 2) ||
    (state === 'drawArc' && drawPoints.length >= 3) ||
    (state === 'drawRotatedRect' && drawPoints.length >= 3) ||
    (state === 'drawPolygon' && drawPoints.length >= 3) ||
    ((state === 'drawPolyline' || state === 'drawCatmullRom') && drawPoints.length >= 2)
  );
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
