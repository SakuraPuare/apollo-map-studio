import type { MapEntity } from '@/types/entities';
import type { ApolloEntity } from '@/types/apollo';
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
import { getEditPoints, isPolygonEditEntity } from '@/lib/entityOps';

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
  const first = coords[0];
  const last = coords[coords.length - 1];
  const ring =
    first && last && (first[0] !== last[0] || first[1] !== last[1]) ? [...coords, first] : coords;
  return {
    type: 'Feature',
    properties: { ...props },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

/** 将实体转为 hot 层 GeoJSON features（含可拖拽控制点） */
export function entityToHotFeatures(entity: MapEntity): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];

  if (entity.entityType === 'polyline' || entity.entityType === 'catmullRom') {
    const coords = pointsToCoords(entity.points);
    const line = entity.entityType === 'catmullRom' ? catmullRom(coords) : coords;
    features.push(lineFeature(line));
    coords.forEach((c, i) => features.push(pointFeature(c, 'vertex', { index: i })));
  } else if (entity.entityType === 'bezier') {
    const anchors: BezierAnchor[] = entity.anchors.map(anchorToRuntime);
    if (anchors.length >= 2) {
      features.push(lineFeature(cubicBezier(anchors)));
    }
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
  } else if (entity.entityType === 'arc') {
    const p1 = toLngLat(entity.start);
    const p2 = toLngLat(entity.mid);
    const p3 = toLngLat(entity.end);
    features.push(lineFeature(threePointArc(p1, p2, p3)));
    features.push(pointFeature(p1, 'vertex', { index: 0 }));
    features.push(pointFeature(p2, 'vertex', { index: 1 }));
    features.push(pointFeature(p3, 'vertex', { index: 2 }));
  } else if (entity.entityType === 'rect') {
    const p1 = toLngLat(entity.p1);
    const p2 = toLngLat(entity.p2);
    const corners = rectCorners(p1, p2, entity.rotation);
    features.push(polygonFeature(corners));
    for (let i = 0; i < 4; i++) {
      features.push(pointFeature(corners[i]!, 'vertex', { index: i }));
    }
    const center: LngLat = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    const handle = rectRotateHandle(p1, p2, entity.rotation);
    features.push(handleLineFeature(center, handle));
    features.push(pointFeature(handle, 'handle', { index: -1, handleType: 'rotate' }));
  } else if (entity.entityType === 'polygon') {
    const coords = pointsToCoords(entity.points);
    features.push(polygonFeature(coords));
    coords.forEach((c, i) => features.push(pointFeature(c, 'vertex', { index: i })));
  } else {
    // Apollo 实体
    const apolloEntity = entity as ApolloEntity;
    const source = getSource(apolloEntity);
    const sourceRect = getSourceRect(apolloEntity);

    // ① 有贝塞尔源：以贝塞尔模式编辑（含控制柄）
    if (source?.drawTool === 'drawBezier' && source.anchors) {
      const anchors: BezierAnchor[] = source.anchors.map(anchorToRuntime);
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

    // ② 有圆弧源：三点编辑
    if (source?.drawTool === 'drawArc' && source.arcPoints) {
      const arcPts = source.arcPoints;
      const p1 = toLngLat(arcPts[0]),
        p2 = toLngLat(arcPts[1]),
        p3 = toLngLat(arcPts[2]);
      features.push(lineFeature(threePointArc(p1, p2, p3)));
      features.push(pointFeature(p1, 'vertex', { index: 0 }));
      features.push(pointFeature(p2, 'vertex', { index: 1 }));
      features.push(pointFeature(p3, 'vertex', { index: 2 }));
      return features;
    }

    // ③ 有矩形源：矩形编辑（含旋转把手）
    if (sourceRect) {
      const p1 = toLngLat(sourceRect.p1);
      const p2 = toLngLat(sourceRect.p2);
      const corners = rectCorners(p1, p2, sourceRect.rotation);
      features.push(polygonFeature(corners));
      for (let i = 0; i < 4; i++) {
        features.push(pointFeature(corners[i]!, 'vertex', { index: i }));
      }
      const center: LngLat = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      const handle = rectRotateHandle(p1, p2, sourceRect.rotation);
      features.push(handleLineFeature(center, handle));
      features.push(pointFeature(handle, 'handle', { index: -1, handleType: 'rotate' }));
      return features;
    }

    // ④ 通用 Apollo 编辑：顶点编辑
    //
    // 用 isPolygonEditEntity 而不是 isAreaEntity——后者把 lane 算作 area（hitTest
    // 需要保留），但 lane 的 editPoints 是中心线（折线），polygonFeature 会把首尾
    // 闭合成多边形，让导入的 lane 在选中时画成"首尾闭合"的橡皮筋。signal/stopSign
    // 等同理：editPoints 来自 stopLines 是开放折线。
    const editPoints = getEditPoints(apolloEntity);
    const coords = editPoints.map((p) => [p.x, p.y] as LngLat);

    if (coords.length >= 2) {
      if (isPolygonEditEntity(apolloEntity)) {
        features.push(polygonFeature(coords));
      } else {
        features.push(lineFeature(coords));
      }
    }

    coords.forEach((c, i) => features.push(pointFeature(c, 'vertex', { index: i })));
  }

  return features;
}
