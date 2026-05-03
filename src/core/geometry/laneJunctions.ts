import type { LngLat } from '@/core/geometry/interpolate';
import type { MapEntity, GeoPoint } from '@/types/entities';
import type { LaneEntity } from '@/types/apollo';
import {
  DEG_TO_M,
  buildLaneFeatureMap,
  cloneFeature,
  endpointDirection,
  laneEndpointsFromEntity,
  sideJoinOffset,
  syncPolygonFromEdges,
  updateLineEndpoint,
  type LaneEndpoint,
  type LaneFeatureRefs,
  type Vec2,
} from './laneJunctions/internal';
import { decorateBoundary } from './laneJunctions/boundaryDecor';

type EndpointJunction = { pt: GeoPoint; a: LaneEndpoint; b: LaneEndpoint };

type LaneCollection = {
  endpoints: LaneEndpoint[];
  laneMap: Map<string, LaneEntity>;
};

function collectLaneEndpoints(
  entities: Iterable<MapEntity>,
  featureMap: Map<string, LaneFeatureRefs>,
  excludeId: string | null | undefined,
): LaneCollection {
  const endpoints: LaneEndpoint[] = [];
  const laneMap = new Map<string, LaneEntity>();

  for (const entity of entities) {
    if (entity.entityType !== 'lane' || entity.id === excludeId) continue;

    const lane = entity as LaneEntity;
    if (!featureMap.has(lane.id)) continue;

    laneMap.set(lane.id, lane);
    endpoints.push(...laneEndpointsFromEntity(lane));
  }

  return { endpoints, laneMap };
}

function findEndpointJunctions(endpoints: LaneEndpoint[]): EndpointJunction[] {
  if (endpoints.length < 4) return [];

  const endpointIndex = new Map<string, LaneEndpoint[]>();
  for (const endpoint of endpoints) {
    const pt = endpoint.isStart ? endpoint.pts[0]! : endpoint.pts[endpoint.pts.length - 1]!;
    const key = `${pt.x.toFixed(6)},${pt.y.toFixed(6)}`;
    if (!endpointIndex.has(key)) endpointIndex.set(key, []);
    endpointIndex.get(key)!.push(endpoint);
  }

  const junctions: EndpointJunction[] = [];
  for (const grouped of endpointIndex.values()) {
    const pair = uniquePair(grouped);
    if (!pair) continue;
    const [a, b] = pair;
    junctions.push({
      pt: a.isStart ? a.pts[0]! : a.pts[a.pts.length - 1]!,
      a,
      b,
    });
  }

  return junctions;
}

function uniquePair(endpoints: LaneEndpoint[]): [LaneEndpoint, LaneEndpoint] | null {
  // Single-pass dedup: O(K) instead of O(K²) filter+findIndex.
  // Defensive against pathological junctions where many endpoints share
  // a key (would have made the original filter quadratic per group).
  const seen = new Set<string>();
  const unique: LaneEndpoint[] = [];
  for (const endpoint of endpoints) {
    if (seen.has(endpoint.id)) continue;
    seen.add(endpoint.id);
    unique.push(endpoint);
  }
  if (unique.length !== 2) return null;
  return [unique[0]!, unique[1]!];
}

function isContinuousJunction(a: LaneEndpoint, b: LaneEndpoint): boolean {
  return a.isStart !== b.isStart;
}

function stitchLaneJunctions(
  junctions: EndpointJunction[],
  featureMap: Map<string, LaneFeatureRefs>,
): void {
  for (const { pt, a, b } of junctions) {
    // Start-start forks and end-end merges are semantic lane junctions, but
    // they are not a continuous lane-to-lane edge. Pulling left-left and
    // right-right boundaries to one shared miter point corrupts the visible
    // split/merge geometry; topology/overlap logic handles those cases.
    if (!isContinuousJunction(a, b)) continue;

    const cosLat = Math.cos((pt.y * Math.PI) / 180);
    const dirA = endpointDirection(a, cosLat);
    const dirB = endpointDirection(b, cosLat);

    const leftOffset = sideJoinOffset('left', a, b, dirA, dirB);
    const rightOffset = sideJoinOffset('right', a, b, dirA, dirB);

    const leftJoin = offsetToLngLat(pt, leftOffset, cosLat);
    const rightJoin = offsetToLngLat(pt, rightOffset, cosLat);

    const refsA = featureMap.get(a.id);
    const refsB = featureMap.get(b.id);

    updateLineEndpoint({
      feature: refsA?.left,
      isStart: a.isStart,
      joinPt: leftJoin,
      dir: dirA,
      cosLat,
      trimFolded: a.trimBoundaryOnStitch,
    });
    updateLineEndpoint({
      feature: refsB?.left,
      isStart: b.isStart,
      joinPt: leftJoin,
      dir: dirB,
      cosLat,
      trimFolded: b.trimBoundaryOnStitch,
    });
    updateLineEndpoint({
      feature: refsA?.right,
      isStart: a.isStart,
      joinPt: rightJoin,
      dir: dirA,
      cosLat,
      trimFolded: a.trimBoundaryOnStitch,
    });
    updateLineEndpoint({
      feature: refsB?.right,
      isStart: b.isStart,
      joinPt: rightJoin,
      dir: dirB,
      cosLat,
      trimFolded: b.trimBoundaryOnStitch,
    });

    syncPolygonFromEdges(refsA);
    syncPolygonFromEdges(refsB);
  }
}

function offsetToLngLat(pt: GeoPoint, offset: Vec2, cosLat: number): LngLat {
  return [pt.x + offset[0] / (cosLat * DEG_TO_M), pt.y + offset[1] / DEG_TO_M];
}

function decorateLaneBoundaries(
  featureMap: Map<string, LaneFeatureRefs>,
  laneMap: Map<string, LaneEntity>,
  decorateOnly: Set<string> | null | undefined,
): GeoJSON.Feature[] {
  const out: GeoJSON.Feature[] = [];
  for (const [id, refs] of featureMap) {
    // Incremental cache support: when the worker passes a `decorateOnly` set,
    // we only re-decorate those lanes. Unaffected lanes' decoration is
    // preserved in the worker's per-lane decorationCache and merged back into
    // the response. See spatial.worker.ts.
    if (decorateOnly && !decorateOnly.has(id)) continue;
    const lane = laneMap.get(id);
    if (!lane) continue;
    out.push(...decorateBoundary(lane, 'left', refs.left));
    out.push(...decorateBoundary(lane, 'right', refs.right));
  }
  return out;
}

export function applyLaneJunctions(
  features: GeoJSON.Feature[],
  entities: Iterable<MapEntity>,
  excludeId?: string | null,
  decorateOnly?: Set<string> | null,
): GeoJSON.Feature[] {
  const result = features.map(cloneFeature);
  const featureMap = buildLaneFeatureMap(result);
  const { endpoints, laneMap } = collectLaneEndpoints(entities, featureMap, excludeId);

  const junctions = findEndpointJunctions(endpoints);
  stitchLaneJunctions(junctions, featureMap);

  result.push(...decorateLaneBoundaries(featureMap, laneMap, decorateOnly));
  return result;
}
