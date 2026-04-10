import { DEFAULT_LANE_HALF_WIDTH, LANE_EDGE_LINE_OPACITY, LANE_EDGE_LINE_WIDTH } from '@/config/mapConstants';
import type { LngLat } from '@/core/geometry/interpolate';
import { offsetPolylineDeg } from '@/core/geometry/apolloCompile';
import type { MapEntity, GeoPoint } from '@/types/entities';
import type { BoundaryLineType, LaneBoundary, LaneBoundaryTypeEntry, LaneEntity } from '@/types/apollo';

const DEG_TO_M = 111320;
const MAX_OUTER_MITER = 3;
const DOUBLE_YELLOW_GAP_METERS = 0.18;

type Vec2 = [number, number];
type LaneEndpoint = {
  id: string;
  isStart: boolean;
  pts: GeoPoint[];
  leftWidth: number;
  rightWidth: number;
};

type LaneFeatureRefs = {
  left?: GeoJSON.Feature<GeoJSON.LineString>;
  right?: GeoJSON.Feature<GeoJSON.LineString>;
  polygon?: GeoJSON.Feature<GeoJSON.Polygon>;
};

type BoundarySegment = {
  startS: number;
  endS: number;
  type: BoundaryLineType;
};

type ProjectedLine = {
  points: Vec2[];
  cumulative: number[];
  total: number;
  cosLat: number;
};

type BoundaryPaint = {
  color: string;
  dashed?: true;
  dotted?: true;
  lineWidth: number;
  lineOpacity: number;
  parallelOffsets?: number[];
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

function projectLine(coords: LngLat[]): ProjectedLine {
  const avgLat = coords.reduce((sum, [, lat]) => sum + lat, 0) / Math.max(coords.length, 1);
  const cosLat = Math.cos(avgLat * Math.PI / 180);
  const points = coords.map(([lng, lat]) => [lng * cosLat * DEG_TO_M, lat * DEG_TO_M] as Vec2);
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    cumulative.push(cumulative[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  return { points, cumulative, total: cumulative[cumulative.length - 1] ?? 0, cosLat };
}

function unprojectPoint(point: Vec2, cosLat: number): LngLat {
  return [point[0] / (cosLat * DEG_TO_M), point[1] / DEG_TO_M];
}

function interpolateProjected(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function sliceLineByS(coords: LngLat[], startS: number, endS: number): LngLat[] | null {
  if (coords.length < 2 || endS <= startS) return null;

  const projected = projectLine(coords);
  const clampedStart = Math.max(0, Math.min(projected.total, startS));
  const clampedEnd = Math.max(clampedStart, Math.min(projected.total, endS));
  if (clampedEnd - clampedStart <= 1e-4) return null;

  const out: Vec2[] = [];
  for (let i = 0; i < projected.points.length - 1; i++) {
    const segStart = projected.cumulative[i];
    const segEnd = projected.cumulative[i + 1];
    if (segEnd <= clampedStart || segStart >= clampedEnd) continue;

    const a = projected.points[i];
    const b = projected.points[i + 1];

    if (out.length === 0) {
      const t0 = segEnd === segStart ? 0 : (clampedStart - segStart) / (segEnd - segStart);
      out.push(interpolateProjected(a, b, Math.max(0, Math.min(1, t0))));
    }

    if (segEnd < clampedEnd - 1e-6) {
      out.push(b);
    } else {
      const t1 = segEnd === segStart ? 1 : (clampedEnd - segStart) / (segEnd - segStart);
      out.push(interpolateProjected(a, b, Math.max(0, Math.min(1, t1))));
      break;
    }
  }

  if (out.length < 2) return null;
  return out.map((point) => unprojectPoint(point, projected.cosLat));
}

function normalizeBoundaryType(types: BoundaryLineType[] | undefined): BoundaryLineType {
  const unique = [...new Set(types ?? [])];
  if (unique.includes('DOUBLE_YELLOW')) return 'DOUBLE_YELLOW';
  if (unique.includes('CURB')) return 'CURB';
  const firstKnown = unique.find((type) => type !== 'UNKNOWN');
  return firstKnown ?? 'UNKNOWN';
}

function boundarySegments(boundary: LaneBoundary | undefined, totalLength: number): BoundarySegment[] {
  const entries = [...(boundary?.boundaryType ?? [])]
    .map((entry) => ({
      s: Math.max(0, Math.min(totalLength, entry.s)),
      type: normalizeBoundaryType(entry.types),
    }))
    .sort((a, b) => a.s - b.s);

  if (entries.length === 0) {
    return [{ startS: 0, endS: totalLength, type: 'UNKNOWN' }];
  }

  const normalized: Array<{ s: number; type: BoundaryLineType }> = [];
  if (entries[0].s > 1e-4) normalized.push({ s: 0, type: 'UNKNOWN' });
  for (const entry of entries) {
    const prev = normalized[normalized.length - 1];
    if (prev && Math.abs(prev.s - entry.s) < 1e-4) {
      prev.type = entry.type;
    } else {
      normalized.push(entry);
    }
  }

  const segments: BoundarySegment[] = [];
  for (let i = 0; i < normalized.length; i++) {
    const startS = normalized[i].s;
    const endS = i + 1 < normalized.length ? normalized[i + 1].s : totalLength;
    if (endS - startS <= 1e-4) continue;
    segments.push({ startS, endS, type: normalized[i].type });
  }

  return segments;
}

function toGeoPoints(coords: LngLat[]): GeoPoint[] {
  return coords.map(([x, y]) => ({ x, y }));
}

function offsetCoords(coords: LngLat[], meters: number, side: 'left' | 'right'): LngLat[] {
  return offsetPolylineDeg(toGeoPoints(coords), meters, side).map((point) => [point.x, point.y]);
}

function boundaryPaint(type: BoundaryLineType, fallbackColor: string): BoundaryPaint {
  switch (type) {
    case 'DOTTED_YELLOW':
      return { color: '#f3d046', dashed: true, dotted: true, lineWidth: LANE_EDGE_LINE_WIDTH, lineOpacity: 1 };
    case 'DOTTED_WHITE':
      return { color: '#ffffff', dashed: true, dotted: true, lineWidth: LANE_EDGE_LINE_WIDTH, lineOpacity: 1 };
    case 'SOLID_YELLOW':
      return { color: '#f3d046', lineWidth: LANE_EDGE_LINE_WIDTH, lineOpacity: 1 };
    case 'SOLID_WHITE':
      return { color: '#ffffff', lineWidth: LANE_EDGE_LINE_WIDTH, lineOpacity: 1 };
    case 'DOUBLE_YELLOW':
      return {
        color: '#f3d046',
        lineWidth: Math.max(1, LANE_EDGE_LINE_WIDTH - 0.25),
        lineOpacity: 1,
        parallelOffsets: [-DOUBLE_YELLOW_GAP_METERS, DOUBLE_YELLOW_GAP_METERS],
      };
    case 'CURB':
      return { color: '#9aa6b2', lineWidth: LANE_EDGE_LINE_WIDTH + 1, lineOpacity: 1 };
    default:
      return { color: fallbackColor, lineWidth: LANE_EDGE_LINE_WIDTH, lineOpacity: LANE_EDGE_LINE_OPACITY };
  }
}

function lineFeature(
  coords: LngLat[],
  props: Record<string, unknown>,
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: props,
    geometry: { type: 'LineString', coordinates: coords },
  };
}

function decorateBoundary(
  lane: LaneEntity,
  side: 'left' | 'right',
  boundaryFeature: GeoJSON.Feature<GeoJSON.LineString> | undefined,
): GeoJSON.Feature<GeoJSON.LineString>[] {
  if (!boundaryFeature) return [];

  const coords = boundaryFeature.geometry.coordinates;
  if (coords.length < 2) return [];

  const projected = projectLine(coords);
  if (projected.total <= 1e-4) return [];

  const boundary = side === 'left' ? lane.leftBoundary : lane.rightBoundary;
  const baseColor = String(boundaryFeature.properties?.color ?? '#4a9eff');
  const segments = boundarySegments(boundary, projected.total);
  const out: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (const segment of segments) {
    const segCoords = sliceLineByS(coords, segment.startS, segment.endS);
    if (!segCoords || segCoords.length < 2) continue;

    const paint = boundaryPaint(segment.type, baseColor);
    const variants = paint.parallelOffsets?.length
      ? paint.parallelOffsets.map((offset) => {
          if (offset < 0) return offsetCoords(segCoords, Math.abs(offset), 'left');
          if (offset > 0) return offsetCoords(segCoords, offset, 'right');
          return segCoords;
        })
      : [segCoords];

    variants.forEach((variant, index) => {
      out.push(lineFeature(variant, {
        id: lane.id,
        entityType: 'lane',
        role: 'laneBoundaryDecor',
        boundarySide: side,
        boundaryType: segment.type,
        boundarySegmentIndex: index,
        color: paint.color,
        lineWidth: paint.lineWidth,
        lineOpacity: paint.lineOpacity,
        ...(paint.dashed ? { dashed: true } : {}),
        ...(paint.dotted ? { dotted: true } : {}),
      }));
    });
  }

  return out;
}

function endpointDirection(ep: LaneEndpoint, cosLat: number): Vec2 {
  const pts = ep.pts;
  const [p0, p1] = ep.isStart
    ? [pts[0], pts[1]]
    : [pts[pts.length - 2], pts[pts.length - 1]];

  return normalize2(
    (p1.x - p0.x) * cosLat * DEG_TO_M,
    (p1.y - p0.y) * DEG_TO_M,
  );
}

function clampVector(vec: Vec2, maxLen: number): Vec2 {
  const len = Math.hypot(vec[0], vec[1]);
  if (len < 1e-10 || len <= maxLen) return vec;
  return [vec[0] / len * maxLen, vec[1] / len * maxLen];
}

function sideJoinOffset(
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
  const exact = intersectLines(anchorA, dirA, anchorB, dirB) ?? midpoint(anchorA, anchorB);

  if (a.isStart === b.isStart) {
    return exact;
  }

  const turnInDir = a.isStart ? dirB : dirA;
  const turnOutDir = a.isStart ? dirA : dirB;
  const sign = side === 'left' ? 1 : -1;
  const isInner = cross2(turnInDir, turnOutDir) * sign < 0;
  if (isInner) {
    return exact;
  }

  const cap = MAX_OUTER_MITER * Math.max(widthA, widthB);
  return clampVector(exact, cap);
}

function cloneFeature(feature: GeoJSON.Feature): GeoJSON.Feature {
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

function buildLaneFeatureMap(features: GeoJSON.Feature[]): Map<string, LaneFeatureRefs> {
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

function updateLineEndpoint(
  feature: GeoJSON.Feature<GeoJSON.LineString> | undefined,
  isStart: boolean,
  joinPt: LngLat,
) {
  if (!feature) return;
  const coords = feature.geometry.coordinates;
  if (coords.length === 0) return;
  coords[isStart ? 0 : coords.length - 1] = joinPt;
}

function updatePolygonEndpoint(
  refs: LaneFeatureRefs | undefined,
  side: 'left' | 'right',
  isStart: boolean,
  joinPt: LngLat,
) {
  if (!refs?.polygon || !refs.left || !refs.right) return;

  const ring = refs.polygon.geometry.coordinates[0];
  if (!ring || ring.length === 0) return;

  const leftLen = refs.left.geometry.coordinates.length;
  const rightLen = refs.right.geometry.coordinates.length;
  const isClosed = ring.length > 1
    && ring[0][0] === ring[ring.length - 1][0]
    && ring[0][1] === ring[ring.length - 1][1];
  const logicalLen = isClosed ? ring.length - 1 : ring.length;
  if (logicalLen < leftLen + rightLen) return;

  const index = side === 'left'
    ? (isStart ? 0 : leftLen - 1)
    : (isStart ? leftLen + rightLen - 1 : leftLen);

  ring[index] = joinPt;
  if (isClosed && index === 0) {
    ring[ring.length - 1] = joinPt;
  }
}

export function applyLaneJunctions(
  features: GeoJSON.Feature[],
  entities: Iterable<MapEntity>,
  excludeId?: string | null,
): GeoJSON.Feature[] {
  const result = features.map(cloneFeature);
  const featureMap = buildLaneFeatureMap(result);
  const laneEndpoints: LaneEndpoint[] = [];
  const laneMap = new Map<string, LaneEntity>();

  for (const entity of entities) {
    if (entity.entityType !== 'lane' || entity.id === excludeId) continue;

    const lane = entity as LaneEntity;
    if (!featureMap.has(lane.id)) continue;

    laneMap.set(lane.id, lane);
    const pts = lane.centralCurve.segments[0]?.lineSegment.points ?? [];
    if (pts.length < 2) continue;

    const leftWidth = lane.leftSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
    const rightWidth = lane.rightSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;

    laneEndpoints.push({
      id: lane.id,
      isStart: true,
      pts,
      leftWidth,
      rightWidth,
    });
    laneEndpoints.push({
      id: lane.id,
      isStart: false,
      pts,
      leftWidth,
      rightWidth,
    });
  }

  if (laneEndpoints.length >= 4) {
    const endpointIndex = new Map<string, LaneEndpoint[]>();
    for (const endpoint of laneEndpoints) {
      const pt = endpoint.isStart ? endpoint.pts[0] : endpoint.pts[endpoint.pts.length - 1];
      const key = `${pt.x.toFixed(6)},${pt.y.toFixed(6)}`;
      if (!endpointIndex.has(key)) endpointIndex.set(key, []);
      endpointIndex.get(key)!.push(endpoint);
    }

    const junctions: Array<{ pt: GeoPoint; a: LaneEndpoint; b: LaneEndpoint }> = [];
    for (const endpoints of endpointIndex.values()) {
      const unique = endpoints.filter((endpoint, index, arr) => arr.findIndex((item) => item.id === endpoint.id) === index);
      if (unique.length !== 2) continue;
      const a = unique[0];
      const b = unique[1];
      junctions.push({
        pt: a.isStart ? a.pts[0] : a.pts[a.pts.length - 1],
        a,
        b,
      });
    }

    for (const { pt, a, b } of junctions) {
      const cosLat = Math.cos(pt.y * Math.PI / 180);
      const dirA = endpointDirection(a, cosLat);
      const dirB = endpointDirection(b, cosLat);

      const offsets = {
        left: sideJoinOffset('left', a, b, dirA, dirB),
        right: sideJoinOffset('right', a, b, dirA, dirB),
      };

      const toLngLat = (offset: Vec2): LngLat => [
        pt.x + offset[0] / (cosLat * DEG_TO_M),
        pt.y + offset[1] / DEG_TO_M,
      ];

      const leftJoin = toLngLat(offsets.left);
      const rightJoin = toLngLat(offsets.right);
      const refsA = featureMap.get(a.id);
      const refsB = featureMap.get(b.id);

      updateLineEndpoint(refsA?.left, a.isStart, leftJoin);
      updateLineEndpoint(refsB?.left, b.isStart, leftJoin);
      updateLineEndpoint(refsA?.right, a.isStart, rightJoin);
      updateLineEndpoint(refsB?.right, b.isStart, rightJoin);

      updatePolygonEndpoint(refsA, 'left', a.isStart, leftJoin);
      updatePolygonEndpoint(refsB, 'left', b.isStart, leftJoin);
      updatePolygonEndpoint(refsA, 'right', a.isStart, rightJoin);
      updatePolygonEndpoint(refsB, 'right', b.isStart, rightJoin);
    }
  }

  for (const [id, refs] of featureMap) {
    const lane = laneMap.get(id);
    if (!lane) continue;
    result.push(...decorateBoundary(lane, 'left', refs.left));
    result.push(...decorateBoundary(lane, 'right', refs.right));
  }

  return result;
}
