import { DEFAULT_LANE_HALF_WIDTH } from '@/config/mapConstants';
import type { LngLat } from '@/core/geometry/interpolate';
import type { GeoPoint } from '@/types/entities';
import type { LaneEntity } from '@/types/apollo';
import {
  curvePoints,
  explicitLaneBoundaryEdges,
} from '@/core/geometry/apolloCompile/laneBoundaryGeometry';

export const DEG_TO_M = 111320;
const MAX_OUTER_MITER = 3;
const SHARP_TURN_DOT = -0.5; // cos(120deg)
const SPARSE_BOUNDARY_TRIM_POINT_LIMIT = 6;

export type Vec2 = [number, number];

export type LaneEndpoint = {
  id: string;
  isStart: boolean;
  pts: GeoPoint[];
  leftWidth: number;
  rightWidth: number;
  trimBoundaryOnStitch: boolean;
};

export type LaneFeatureRefs = {
  left?: GeoJSON.Feature<GeoJSON.LineString>;
  right?: GeoJSON.Feature<GeoJSON.LineString>;
  polygon?: GeoJSON.Feature<GeoJSON.Polygon>;
};

function normalize2(dx: number, dy: number): Vec2 {
  const len = Math.hypot(dx, dy);
  return len < 1e-12 ? [0, 1] : [dx / len, dy / len];
}

function cross2(a: Vec2, b: Vec2): number {
  return a[0] * b[1] - a[1] * b[0];
}

function normalForSide(dir: Vec2, side: 'left' | 'right'): Vec2 {
  const sign = side === 'left' ? 1 : -1;
  return [-dir[1] * sign, dir[0] * sign];
}

function intersectLines(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): Vec2 | null {
  const det = cross2(d1, d2);
  if (Math.abs(det) < 1e-8) return null;

  const delta: Vec2 = [p2[0] - p1[0], p2[1] - p1[1]];
  const t = cross2(delta, d2) / det;
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
}

function midpoint(a: Vec2, b: Vec2): Vec2 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export function endpointDirection(ep: LaneEndpoint, cosLat: number): Vec2 {
  const pts = ep.pts;
  const [p0, p1] = ep.isStart ? [pts[0]!, pts[1]!] : [pts[pts.length - 2]!, pts[pts.length - 1]!];

  return normalize2((p1.x - p0.x) * cosLat * DEG_TO_M, (p1.y - p0.y) * DEG_TO_M);
}

function clampVector(vec: Vec2, maxLen: number): Vec2 {
  const len = Math.hypot(vec[0], vec[1]);
  if (len < 1e-10 || len <= maxLen) return vec;
  return [(vec[0] / len) * maxLen, (vec[1] / len) * maxLen];
}

export function sideJoinOffset(
  side: 'left' | 'right',
  a: LaneEndpoint,
  b: LaneEndpoint,
  dirA: Vec2,
  dirB: Vec2,
): Vec2 {
  const widthA = side === 'left' ? a.leftWidth : a.rightWidth;
  const widthB = side === 'left' ? b.leftWidth : b.rightWidth;
  const anchorA = normalForSide(dirA, side).map((v) => v * widthA) as Vec2;
  const anchorB = normalForSide(dirB, side).map((v) => v * widthB) as Vec2;
  const bevel = midpoint(anchorA, anchorB);
  const exact = intersectLines(anchorA, dirA, anchorB, dirB);
  const maxWidth = Math.max(widthA, widthB);

  if (a.isStart === b.isStart) {
    return exact ?? bevel;
  }

  const turnInDir = a.isStart ? dirB : dirA;
  const turnOutDir = a.isStart ? dirA : dirB;
  const sign = side === 'left' ? 1 : -1;
  const isInner = cross2(turnInDir, turnOutDir) * sign < 0;
  if (isInner) {
    return exact ?? bevel;
  }

  const cap = MAX_OUTER_MITER * maxWidth;
  if (!exact) return bevel;
  if (Math.hypot(exact[0], exact[1]) > cap) {
    const dot = dirA[0] * dirB[0] + dirA[1] * dirB[1];
    return dot <= SHARP_TURN_DOT ? clampVector(exact, cap) : bevel;
  }
  return exact;
}

export function cloneFeature(feature: GeoJSON.Feature): GeoJSON.Feature {
  switch (feature.geometry.type) {
    case 'LineString':
      return {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: [...feature.geometry.coordinates],
        } as GeoJSON.LineString,
      };
    case 'Polygon':
      return {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: feature.geometry.coordinates.map((ring) => [...ring]),
        } as GeoJSON.Polygon,
      };
    default:
      return feature;
  }
}

export function buildLaneFeatureMap(features: GeoJSON.Feature[]): Map<string, LaneFeatureRefs> {
  const map = new Map<string, LaneFeatureRefs>();

  for (const feature of features) {
    if (feature.properties?.entityType !== 'lane') continue;
    const id = String(feature.properties.id ?? '');
    if (!id) continue;

    const refs = map.get(id) ?? {};
    if (feature.geometry.type === 'Polygon') {
      refs.polygon = feature as GeoJSON.Feature<GeoJSON.Polygon>;
    } else if (feature.geometry.type === 'LineString') {
      if (feature.properties?.role === 'laneEdgeLeft') {
        refs.left = feature as GeoJSON.Feature<GeoJSON.LineString>;
      } else if (feature.properties?.role === 'laneEdgeRight') {
        refs.right = feature as GeoJSON.Feature<GeoJSON.LineString>;
      }
    }
    map.set(id, refs);
  }

  return map;
}

interface LineEndpointUpdate {
  feature: GeoJSON.Feature<GeoJSON.LineString> | undefined;
  isStart: boolean;
  joinPt: LngLat;
  dir: Vec2;
  cosLat: number;
  trimFolded?: boolean;
}

export function updateLineEndpoint({
  feature,
  isStart,
  joinPt,
  dir,
  cosLat,
  trimFolded = true,
}: LineEndpointUpdate) {
  if (!feature) return;
  const coords = feature.geometry.coordinates;
  if (coords.length === 0) return;
  coords[isStart ? 0 : coords.length - 1] = joinPt;

  if (!trimFolded) return;

  // Preserve the single-lane tight-turn behavior after stitching: if the
  // join lands behind short terminal edge segments, remove those folded points.
  while (coords.length > 2) {
    const endpointIndex = isStart ? 0 : coords.length - 1;
    const adjacentIndex = isStart ? 1 : coords.length - 2;
    const endpoint = projectCoord(coords[endpointIndex] as LngLat, cosLat);
    const adjacent = projectCoord(coords[adjacentIndex] as LngLat, cosLat);
    const vx = isStart ? adjacent[0] - endpoint[0] : endpoint[0] - adjacent[0];
    const vy = isStart ? adjacent[1] - endpoint[1] : endpoint[1] - adjacent[1];
    if (vx * dir[0] + vy * dir[1] > 1e-4) break;
    coords.splice(adjacentIndex, 1);
  }
}

function projectCoord(coord: LngLat, cosLat: number): Vec2 {
  return [coord[0] * cosLat * DEG_TO_M, coord[1] * DEG_TO_M];
}

function shouldTrimBoundaryOnStitch(lane: LaneEntity, pts: GeoPoint[], _isStart: boolean): boolean {
  const sourceTool = lane._source?.drawTool;
  if (sourceTool === 'drawArc' || sourceTool === 'drawBezier' || sourceTool === 'drawCatmullRom') {
    return false;
  }

  // Endpoint trimming removes folded sparse-polyline terminal segments after a
  // junction join. Dense sampled lanes already encode their shape; even when
  // the local endpoint tangent looks straight, trimming those samples can cut
  // across the lane and turn the fill into a long triangle.
  return pts.length <= SPARSE_BOUNDARY_TRIM_POINT_LIMIT;
}

export function syncPolygonFromEdges(refs: LaneFeatureRefs | undefined) {
  if (!refs?.polygon || !refs.left || !refs.right) return;
  const left = refs.left.geometry.coordinates as LngLat[];
  const right = refs.right.geometry.coordinates as LngLat[];
  const ring = [...left, ...[...right].reverse()].map(([lng, lat]) => [lng, lat] as LngLat);
  if (ring.length > 0) ring.push([ring[0]![0], ring[0]![1]]);
  refs.polygon.geometry.coordinates[0] = ring;
}

export function laneEndpointsFromEntity(lane: LaneEntity): LaneEndpoint[] {
  if (explicitLaneBoundaryEdges(lane)) return [];

  const pts = curvePoints(lane.centralCurve);
  if (pts.length < 2) return [];

  const leftWidth = lane.leftSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
  const rightWidth = lane.rightSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
  const trimStartBoundaryOnStitch = shouldTrimBoundaryOnStitch(lane, pts, true);
  const trimEndBoundaryOnStitch = shouldTrimBoundaryOnStitch(lane, pts, false);

  return [
    {
      id: lane.id,
      isStart: true,
      pts,
      leftWidth,
      rightWidth,
      trimBoundaryOnStitch: trimStartBoundaryOnStitch,
    },
    {
      id: lane.id,
      isStart: false,
      pts,
      leftWidth,
      rightWidth,
      trimBoundaryOnStitch: trimEndBoundaryOnStitch,
    },
  ];
}
