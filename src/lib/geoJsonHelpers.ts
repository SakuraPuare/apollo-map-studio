import type { MapEntity } from '@/types/entities';
import type { ApolloEntity, SourceDrawInfo, SourceRectInfo } from '@/types/apollo';
import { getSource, getSourceRect } from '@/types/apollo';
import type { BezierAnchor, LngLat } from '@/core/geometry/interpolate';
import {
  catmullRom,
  cubicBezier,
  threePointArc,
  rectCorners,
  rectRotateHandle,
} from '@/core/geometry/interpolate';
import { anchorToRuntime } from '@/core/geometry/anchorConvert';
import { pointsToCoords, toLngLat } from '@/core/geometry/coords';
import { polygonGeometry } from '@/core/geometry/polygonGeometry';
import { getEditPoints, isPolygonEditEntity } from '@/lib/entityOps';
import type {
  ArcEntity,
  BezierEntity,
  CatmullRomEntity,
  PolygonEntity,
  PolylineEntity,
  RectEntity,
} from '@/types/entities';

export function lineFeature(
  coords: LngLat[],
  props: Record<string, unknown> = {},
): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { ...props },
    geometry: { type: 'LineString', coordinates: coords },
  };
}

export function pointFeature(
  coord: LngLat,
  role: string,
  props: Record<string, unknown> = {},
): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { role, ...props },
    geometry: { type: 'Point', coordinates: coord },
  };
}

export function handleLineFeature(from: LngLat, to: LngLat): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { role: 'handleLine' },
    geometry: { type: 'LineString', coordinates: [from, to] },
  };
}

export function polygonFeature(
  coords: LngLat[],
  props: Record<string, unknown> = {},
): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { ...props },
    geometry: polygonGeometry(coords),
  };
}

/** 将实体转为 hot 层 GeoJSON features（含可拖拽控制点） */
export function entityToHotFeatures(entity: MapEntity): GeoJSON.Feature[] {
  if (entity.entityType === 'polyline' || entity.entityType === 'catmullRom') {
    return polylineHotFeatures(entity);
  }
  if (entity.entityType === 'bezier') return bezierHotFeatures(entity);
  if (entity.entityType === 'arc') return arcHotFeatures(entity);
  if (entity.entityType === 'rect') return rectHotFeatures(entity);
  if (entity.entityType === 'polygon') return polygonHotFeatures(entity);
  return apolloHotFeatures(entity as ApolloEntity);
}

function polylineHotFeatures(entity: PolylineEntity | CatmullRomEntity): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const coords = pointsToCoords(entity.points);
  const line = entity.entityType === 'catmullRom' ? catmullRom(coords) : coords;
  features.push(lineFeature(line));
  coords.forEach((c, i) => features.push(pointFeature(c, 'vertex', { index: i })));
  return features;
}

function bezierHotFeatures(entity: BezierEntity): GeoJSON.Feature[] {
  return bezierAnchorFeatures(entity.anchors.map(anchorToRuntime));
}

function bezierAnchorFeatures(anchors: BezierAnchor[]): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  if (anchors.length >= 2) features.push(lineFeature(cubicBezier(anchors)));
  anchors.forEach((a, i) => {
    features.push(pointFeature(a.point, 'vertex', { index: i }));
    if (a.handleIn) {
      features.push(handleLineFeature(a.point, a.handleIn));
      features.push(pointFeature(a.handleIn, 'handle', { index: i, handleType: 'handleIn' }));
    }
    if (a.handleOut) {
      features.push(handleLineFeature(a.point, a.handleOut));
      features.push(pointFeature(a.handleOut, 'handle', { index: i, handleType: 'handleOut' }));
    }
  });
  return features;
}

function arcHotFeatures(entity: ArcEntity): GeoJSON.Feature[] {
  return arcPointFeatures([toLngLat(entity.start), toLngLat(entity.mid), toLngLat(entity.end)]);
}

function arcPointFeatures([p1, p2, p3]: [LngLat, LngLat, LngLat]): GeoJSON.Feature[] {
  return [
    lineFeature(threePointArc(p1, p2, p3)),
    pointFeature(p1, 'vertex', { index: 0 }),
    pointFeature(p2, 'vertex', { index: 1 }),
    pointFeature(p3, 'vertex', { index: 2 }),
  ];
}

function rectHotFeatures(entity: RectEntity): GeoJSON.Feature[] {
  return rectControlFeatures(toLngLat(entity.p1), toLngLat(entity.p2), entity.rotation);
}

function rectControlFeatures(p1: LngLat, p2: LngLat, rotation: number): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const corners = rectCorners(p1, p2, rotation);
  features.push(polygonFeature(corners));
  for (let i = 0; i < 4; i++) features.push(pointFeature(corners[i]!, 'vertex', { index: i }));
  const center: LngLat = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const handle = rectRotateHandle(p1, p2, rotation);
  features.push(handleLineFeature(center, handle));
  features.push(pointFeature(handle, 'handle', { index: -1, handleType: 'rotate' }));
  return features;
}

function polygonHotFeatures(entity: PolygonEntity): GeoJSON.Feature[] {
  const coords = pointsToCoords(entity.points);
  return [polygonFeature(coords), ...coords.map((c, i) => pointFeature(c, 'vertex', { index: i }))];
}

function apolloHotFeatures(entity: ApolloEntity): GeoJSON.Feature[] {
  const source = getSource(entity);
  const sourceRect = getSourceRect(entity);
  if (source?.drawTool === 'drawBezier' && source.anchors) {
    return bezierSourceFeatures(source);
  }
  if (source?.drawTool === 'drawArc' && source.arcPoints) return arcSourceFeatures(source);
  if (sourceRect) return rectSourceFeatures(sourceRect);
  return genericApolloHotFeatures(entity);
}

function bezierSourceFeatures(source: SourceDrawInfo): GeoJSON.Feature[] {
  return bezierAnchorFeatures(source.anchors!.map(anchorToRuntime));
}

function arcSourceFeatures(source: SourceDrawInfo): GeoJSON.Feature[] {
  const [p1, p2, p3] = source.arcPoints!.map(toLngLat) as [LngLat, LngLat, LngLat];
  return arcPointFeatures([p1, p2, p3]);
}

function rectSourceFeatures(sourceRect: SourceRectInfo): GeoJSON.Feature[] {
  return rectControlFeatures(toLngLat(sourceRect.p1), toLngLat(sourceRect.p2), sourceRect.rotation);
}

function genericApolloHotFeatures(entity: ApolloEntity): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const coords = getEditPoints(entity).map((p) => [p.x, p.y] as LngLat);
  if (coords.length >= 2) {
    features.push(isPolygonEditEntity(entity) ? polygonFeature(coords) : lineFeature(coords));
  }
  coords.forEach((c, i) => features.push(pointFeature(c, 'vertex', { index: i })));
  return features;
}
