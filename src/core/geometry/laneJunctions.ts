import { DEFAULT_LANE_HALF_WIDTH } from '@/config/mapConstants';
import type { LngLat } from '@/core/geometry/interpolate';
import type { MapEntity, GeoPoint } from '@/types/entities';
import type { LaneEntity } from '@/types/apollo';

const DEG_TO_M = 111320;
const MAX_OUTER_MITER = 3;

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
  const laneEndpoints: LaneEndpoint[] = [];

  for (const entity of entities) {
    if (entity.entityType !== 'lane' || entity.id === excludeId) continue;

    const lane = entity as LaneEntity;
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

  if (laneEndpoints.length < 4) {
    return features;
  }

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

  if (junctions.length === 0) {
    return features;
  }

  const result = features.map(cloneFeature);
  const featureMap = buildLaneFeatureMap(result);

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

  return result;
}
