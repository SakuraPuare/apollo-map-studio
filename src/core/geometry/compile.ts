/**
 * 纯函数版实体 → GeoJSON 编译器
 * 可在 Worker 和主线程中复用，不依赖 React
 */
import type { MapEntity } from '@/types/entities';
import type { ApolloEntity } from '@/types/apollo';
import type { BezierAnchor, LngLat } from '@/core/geometry/interpolate';
import { catmullRom, cubicBezier, threePointArc, rectCorners } from '@/core/geometry/interpolate';
import { anchorToRuntime } from '@/core/geometry/anchorConvert';
import { pointsToCoords, toLngLat } from '@/core/geometry/coords';
import { compileApolloFeatures, apolloEntityCoords, isApolloAreaEntity } from './apolloCompile';
import { elementColor } from '@/core/elements';

const CURVE_COLORS: Record<string, string> = {
  polyline: '#00d4ff',
  catmullRom: '#00ff88',
  bezier: '#ff66cc',
  arc: '#ffaa00',
  rect: '#ff4444',
  polygon: '#aa66ff',
};

function lineFeature(coords: LngLat[], props: Record<string, unknown> = {}): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { ...props },
    geometry: { type: 'LineString', coordinates: coords },
  };
}

function pointFeature(coord: LngLat, role: string, props: Record<string, unknown> = {}): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { role, ...props },
    geometry: { type: 'Point', coordinates: coord },
  };
}

function polygonFeature(coords: LngLat[], props: Record<string, unknown> = {}): GeoJSON.Feature {
  const ring = coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])
    ? [...coords, coords[0]]
    : coords;
  return {
    type: 'Feature',
    properties: { ...props },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

/** 判断 entityType 是否为基础绘制图形 */
function isDrawingEntity(entity: MapEntity): entity is import('@/types/entities').DrawingEntity {
  return entity.entityType === 'polyline' || entity.entityType === 'catmullRom'
    || entity.entityType === 'bezier' || entity.entityType === 'arc'
    || entity.entityType === 'rect' || entity.entityType === 'polygon';
}

/** 将实体编译为冷层 GeoJSON features */
export function compileColdFeatures(entity: MapEntity): GeoJSON.Feature[] {
  // Apollo 实体走专用编译器
  if (!isDrawingEntity(entity)) {
    return compileApolloFeatures(entity as ApolloEntity);
  }

  const color = CURVE_COLORS[entity.entityType] ?? '#ffffff';
  const props = { color, id: entity.id, entityType: entity.entityType };
  const features: GeoJSON.Feature[] = [];

  // 冷层只渲染几何体，不渲染顶点（顶点仅在选中时由热层显示）
  if (entity.entityType === 'polyline' || entity.entityType === 'catmullRom') {
    const coords = pointsToCoords(entity.points);
    const line = entity.entityType === 'catmullRom' ? catmullRom(coords) : coords;
    features.push(lineFeature(line, props));
  } else if (entity.entityType === 'bezier') {
    const anchors: BezierAnchor[] = entity.anchors.map(anchorToRuntime);
    features.push(lineFeature(cubicBezier(anchors), props));
  } else if (entity.entityType === 'arc') {
    const p1 = toLngLat(entity.start);
    const p2 = toLngLat(entity.mid);
    const p3 = toLngLat(entity.end);
    features.push(lineFeature(threePointArc(p1, p2, p3), props));
  } else if (entity.entityType === 'rect') {
    const p1 = toLngLat(entity.p1);
    const p2 = toLngLat(entity.p2);
    const corners = rectCorners(p1, p2, entity.rotation);
    features.push(polygonFeature(corners, props));
  } else if (entity.entityType === 'polygon') {
    const coords = pointsToCoords(entity.points);
    features.push(polygonFeature(coords, props));
  }

  return features;
}

/** 计算实体的 AABB 包围盒 [minX, minY, maxX, maxY] */
export function entityBBox(entity: MapEntity): [number, number, number, number] {
  const coords = entityCoords(entity);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/** 提取实体的所有坐标点（用于 AABB 和 hitTest） */
export function entityCoords(entity: MapEntity): LngLat[] {
  if (!isDrawingEntity(entity)) {
    return apolloEntityCoords(entity as ApolloEntity);
  }
  if (entity.entityType === 'polyline' || entity.entityType === 'catmullRom') {
    return pointsToCoords(entity.points);
  }
  if (entity.entityType === 'bezier') {
    return cubicBezier(entity.anchors.map(anchorToRuntime));
  }
  if (entity.entityType === 'arc') {
    return threePointArc(toLngLat(entity.start), toLngLat(entity.mid), toLngLat(entity.end));
  }
  if (entity.entityType === 'rect') {
    return rectCorners(toLngLat(entity.p1), toLngLat(entity.p2), entity.rotation);
  }
  if (entity.entityType === 'polygon') {
    return pointsToCoords(entity.points);
  }
  return [];
}

/** 获取实体的渲染曲线坐标（用于精确 hitTest） */
export function entityRenderCoords(entity: MapEntity): LngLat[] {
  if (!isDrawingEntity(entity)) {
    return apolloEntityCoords(entity as ApolloEntity);
  }
  if (entity.entityType === 'catmullRom') {
    return catmullRom(pointsToCoords(entity.points));
  }
  return entityCoords(entity);
}

/** 判断实体是否为面类型 */
export function isAreaEntity(entity: MapEntity): boolean {
  if (!isDrawingEntity(entity)) {
    return isApolloAreaEntity(entity as ApolloEntity);
  }
  return entity.entityType === 'rect' || entity.entityType === 'polygon';
}
