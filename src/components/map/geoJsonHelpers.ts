import type { MapEntity } from '@/types/entities';
import type { BezierAnchor, LngLat } from '@/core/geometry/interpolate';
import { catmullRom, cubicBezier, threePointArc, rectCorners, rectRotateHandle } from '@/core/geometry/interpolate';
import { anchorToRuntime } from '@/core/geometry/anchorConvert';
import { pointsToCoords, toLngLat } from '@/core/geometry/coords';

export function lineFeature(coords: LngLat[], props: Record<string, unknown> = {}): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { ...props },
    geometry: { type: 'LineString', coordinates: coords },
  };
}

export function pointFeature(coord: LngLat, role: string, props: Record<string, unknown> = {}): GeoJSON.Feature {
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

export function polygonFeature(coords: LngLat[], props: Record<string, unknown> = {}): GeoJSON.Feature {
  const ring = coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])
    ? [...coords, coords[0]]
    : coords;
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
      features.push(pointFeature(corners[i], 'vertex', { index: i }));
    }
    const center: LngLat = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    const handle = rectRotateHandle(p1, p2, entity.rotation);
    features.push(handleLineFeature(center, handle));
    features.push(pointFeature(handle, 'handle', { index: -1, handleType: 'rotate' }));
  } else if (entity.entityType === 'polygon') {
    const coords = pointsToCoords(entity.points);
    features.push(polygonFeature(coords));
    coords.forEach((c, i) => features.push(pointFeature(c, 'vertex', { index: i })));
  }

  return features;
}
