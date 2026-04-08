import type { GeoJSON } from 'geojson';
import type { MapEntity } from '@/types/entities';
import type { BezierAnchor, LngLat } from '@/core/geometry/interpolate';
import { catmullRom, cubicBezier, threePointArc } from '@/core/geometry/interpolate';
import { anchorToRuntime } from '@/core/geometry/anchorConvert';

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

/** 将实体转为 hot 层 GeoJSON features（含可拖拽控制点） */
export function entityToHotFeatures(entity: MapEntity): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];

  if (entity.entityType === 'polyline' || entity.entityType === 'catmullRom') {
    const coords = entity.points.map((p): LngLat => [p.x, p.y]);
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
    const p1: LngLat = [entity.start.x, entity.start.y];
    const p2: LngLat = [entity.mid.x, entity.mid.y];
    const p3: LngLat = [entity.end.x, entity.end.y];
    features.push(lineFeature(threePointArc(p1, p2, p3)));
    features.push(pointFeature(p1, 'vertex', { index: 0 }));
    features.push(pointFeature(p2, 'vertex', { index: 1 }));
    features.push(pointFeature(p3, 'vertex', { index: 2 }));
  }

  return features;
}

/** 将实体转为 cold 层 GeoJSON features（含颜色和 id） */
export function entityToColdFeatures(entity: MapEntity, color: string): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const props = { color, id: entity.id };

  if (entity.entityType === 'polyline' || entity.entityType === 'catmullRom') {
    const coords = entity.points.map((p): LngLat => [p.x, p.y]);
    const line = entity.entityType === 'catmullRom' ? catmullRom(coords) : coords;
    features.push(lineFeature(line, props));
    for (const c of coords) features.push(pointFeature(c, 'vertex', props));
  } else if (entity.entityType === 'bezier') {
    const anchors = entity.anchors.map(anchorToRuntime);
    features.push(lineFeature(cubicBezier(anchors), props));
    for (const a of anchors) features.push(pointFeature(a.point, 'vertex', props));
  } else if (entity.entityType === 'arc') {
    const p1: LngLat = [entity.start.x, entity.start.y];
    const p2: LngLat = [entity.mid.x, entity.mid.y];
    const p3: LngLat = [entity.end.x, entity.end.y];
    features.push(lineFeature(threePointArc(p1, p2, p3), props));
    features.push(pointFeature(p1, 'vertex', props));
    features.push(pointFeature(p2, 'vertex', props));
    features.push(pointFeature(p3, 'vertex', props));
  }

  return features;
}
