/**
 * Snap (吸附) — pure geometry module.
 *
 * 底层逻辑：
 *   1. 从所有可见实体中收集顶点 + 边段两类吸附候选。
 *   2. 对输入点投影到本地 ENU 平面（米），按欧氏距离查找最近候选。
 *   3. 顶点优先于边段（同距离条件下顶点更"贴心"）。
 *   4. 全部纯函数，调用方负责传入 entities / cosLat / radiusMeters。
 *
 * 不做的事情：
 *   - 不直接读 store / 不依赖 maplibre / 不接 worker；调用方自己拉数据。
 *   - 不区分 entityType 的优先级；如有需要由调用方过滤后传入。
 *   - 不维护空间索引；每次扫描全部实体（地图实体量级 10^3 内可接受，
 *     mousemove 60 fps 下耗时 < 1ms）。
 */
import type { ArcEntity, GeoPoint, PolygonEntity, RectEntity } from '@/types/entities';
import type { MapEntity } from '@/types/entities';
import type {
  AreaEntity,
  ClearAreaEntity,
  CrosswalkEntity,
  LaneEntity,
  JunctionEntity,
  PNCJunctionEntity,
  ParkingLotEntity,
  ParkingSpaceEntity,
  SignalEntity,
  SpeedControlEntity,
} from '@/types/apollo';
import { getSourceRect } from '@/types/apollo';
import { curvePoints } from './apolloCompile/laneBoundaryGeometry';
import { rectCorners } from './interpolate';

const DEG_TO_M = 111320;

// ─── Types ─────────────────────────────────────────────────────────────────

type SnapKind = 'vertex' | 'edge';

/**
 * For lane vertex hits, role within the centerline polyline. This is
 * what `reconcileLaneTopology` keys off when deriving predecessor /
 * successor — only START / END snaps establish topology; INTERIOR
 * snaps would create coincident geometry without a topological link.
 */
type LaneEndpointRole = 'start' | 'end';

export interface SnapTarget {
  kind: SnapKind;
  /** Snapped position (lng/lat) */
  point: GeoPoint;
  /** Entity that supplied the snap candidate */
  entityId: string;
  entityType: string;
  /** For vertex hits: index within the source list (debug / future use) */
  vertexIndex?: number;
  /**
   * For lane vertex hits, which centerline endpoint this is. Drives the
   * pred/succ decision: snapping the new lane's start to an existing
   * lane's end means "existing → new" (existing.successor += new),
   * snapping to an existing lane's start means "fork" (no pred/succ).
   */
  endpointRole?: LaneEndpointRole;
}

interface VertexCandidate {
  point: GeoPoint;
  entityId: string;
  entityType: string;
  vertexIndex: number;
  endpointRole?: LaneEndpointRole;
}

interface EdgeCandidate {
  /** Two endpoints of a single polyline segment */
  a: GeoPoint;
  b: GeoPoint;
  entityId: string;
  entityType: string;
}

export interface SnapCandidates {
  vertices: VertexCandidate[];
  edges: EdgeCandidate[];
}

export interface SnapMatch {
  target: SnapTarget;
  distanceMeters: number;
}

// ─── Pixel ↔ meters at current zoom ────────────────────────────────────────

/**
 * Web-Mercator pixel-to-meter at given latitude / zoom.
 *
 * Uses MapLibre's 512-px tile sizing convention. At zoom z and latitude φ,
 * meters per pixel ≈ (cosφ · earth_circumference) / (512 · 2^z). Derive
 * once per mousemove — cheap, but exposed as a helper so callers can also
 * pre-compute when handling drags.
 */
export function pixelsToMeters(pixels: number, lat: number, zoom: number): number {
  const EARTH_CIRC = 40_075_016.686; // meters
  const metersPerPixel = (Math.cos((lat * Math.PI) / 180) * EARTH_CIRC) / (512 * Math.pow(2, zoom));
  return pixels * metersPerPixel;
}

// ─── Candidate extraction per entity kind ──────────────────────────────────

function pushPolylineVertices(
  out: VertexCandidate[],
  edges: EdgeCandidate[],
  pts: GeoPoint[],
  entityId: string,
  entityType: string,
): void {
  if (pts.length === 0) return;
  // For non-lane polylines, expose every interior vertex (mid-curve
  // insertion is useful for things like rough trace alignment).
  for (let i = 0; i < pts.length; i++) {
    out.push({ point: pts[i]!, entityId, entityType, vertexIndex: i });
  }
  for (let i = 0; i < pts.length - 1; i++) {
    edges.push({ a: pts[i]!, b: pts[i + 1]!, entityId, entityType });
  }
}

function pushPolygonVertices(
  out: VertexCandidate[],
  edges: EdgeCandidate[],
  pts: GeoPoint[],
  entityId: string,
  entityType: string,
): void {
  if (pts.length === 0) return;
  for (let i = 0; i < pts.length; i++) {
    out.push({ point: pts[i]!, entityId, entityType, vertexIndex: i });
  }
  for (let i = 0; i < pts.length; i++) {
    const next = (i + 1) % pts.length;
    edges.push({ a: pts[i]!, b: pts[next]!, entityId, entityType });
  }
}

function rectPoints(rect: Pick<RectEntity, 'p1' | 'p2' | 'rotation'>): GeoPoint[] {
  return rectCorners([rect.p1.x, rect.p1.y], [rect.p2.x, rect.p2.y], rect.rotation)
    .slice(0, 4)
    .map(([x, y]) => ({ x, y }));
}

function polygonControlPoints(entity: MapEntity, fallback: GeoPoint[]): GeoPoint[] {
  const sourceRect = getSourceRect(entity);
  return sourceRect ? rectPoints(sourceRect) : fallback;
}

function laneCenterPoints(lane: LaneEntity): GeoPoint[] {
  return curvePoints(lane.centralCurve);
}

type CandidateCollector = (
  entity: MapEntity,
  vertices: VertexCandidate[],
  edges: EdgeCandidate[],
) => void;

const SNAP_COLLECTORS: Partial<Record<MapEntity['entityType'], CandidateCollector>> = {
  lane: (entity, vertices, edges) => {
    pushLaneEndpointVertices(vertices, edges, laneCenterPoints(entity as LaneEntity), entity.id);
  },
  junction: (entity, vertices, edges) => {
    pushPolygonVertices(
      vertices,
      edges,
      polygonControlPoints(entity, (entity as JunctionEntity).polygon.points),
      entity.id,
      entity.entityType,
    );
  },
  pncJunction: (entity, vertices, edges) => {
    pushPolygonVertices(
      vertices,
      edges,
      polygonControlPoints(entity, (entity as PNCJunctionEntity).polygon.points),
      entity.id,
      entity.entityType,
    );
  },
  parkingSpace: (entity, vertices, edges) => {
    pushPolygonVertices(
      vertices,
      edges,
      polygonControlPoints(entity, (entity as ParkingSpaceEntity).polygon.points),
      entity.id,
      entity.entityType,
    );
  },
  parkingLot: (entity, vertices, edges) => {
    pushPolygonVertices(
      vertices,
      edges,
      (entity as ParkingLotEntity).polygon.points,
      entity.id,
      entity.entityType,
    );
  },
  crosswalk: (entity, vertices, edges) => {
    pushPolygonVertices(
      vertices,
      edges,
      polygonControlPoints(entity, (entity as CrosswalkEntity).polygon.points),
      entity.id,
      entity.entityType,
    );
  },
  clearArea: (entity, vertices, edges) => {
    pushPolygonVertices(
      vertices,
      edges,
      polygonControlPoints(entity, (entity as ClearAreaEntity).polygon.points),
      entity.id,
      entity.entityType,
    );
  },
  area: (entity, vertices, edges) => {
    pushPolygonVertices(
      vertices,
      edges,
      polygonControlPoints(entity, (entity as AreaEntity).polygon.points),
      entity.id,
      entity.entityType,
    );
  },
  speedControl: (entity, vertices, edges) => {
    pushPolygonVertices(
      vertices,
      edges,
      (entity as SpeedControlEntity).polygon.points,
      entity.id,
      entity.entityType,
    );
  },
  signal: (entity, vertices, edges) => {
    pushPolygonVertices(
      vertices,
      edges,
      (entity as SignalEntity).boundary.points,
      entity.id,
      entity.entityType,
    );
  },
  polygon: (entity, vertices, edges) => {
    pushPolygonVertices(
      vertices,
      edges,
      (entity as PolygonEntity).points,
      entity.id,
      entity.entityType,
    );
  },
  rect: (entity, vertices, edges) => {
    pushPolygonVertices(
      vertices,
      edges,
      rectPoints(entity as RectEntity),
      entity.id,
      entity.entityType,
    );
  },
  arc: (entity, vertices, edges) => {
    const arc = entity as ArcEntity;
    pushPolylineVertices(
      vertices,
      edges,
      [arc.start, arc.mid, arc.end],
      entity.id,
      entity.entityType,
    );
  },
};

function collectGenericCandidates(
  entity: MapEntity,
  vertices: VertexCandidate[],
  edges: EdgeCandidate[],
): void {
  if ('points' in entity && Array.isArray(entity.points)) {
    pushPolylineVertices(vertices, edges, entity.points, entity.id, entity.entityType);
    return;
  }
  if ('anchors' in entity && Array.isArray(entity.anchors)) {
    const anchorPts = entity.anchors.map((a) => a.point);
    pushPolylineVertices(vertices, edges, anchorPts, entity.id, entity.entityType);
  }
}

/**
 * Lane snap candidates — endpoints only, tagged with role.
 *
 * Why endpoints-only:
 *   Lanes have direction. Topology (predecessor / successor) is only
 *   meaningful at the centerline endpoints. If we let the cursor snap
 *   to an interior vertex of an existing lane, the resulting coincident
 *   geometry would not produce any pred/succ link (reconcile only keys
 *   off start/end), leaving the user with what looks like a connection
 *   but acts like a stray point. Restricting candidates to endpoints
 *   prevents that footgun.
 *
 * Mid-lane edge snap is still available via the edge pass (rendering
 * the cursor onto the lane's shape without claiming a connection).
 */
function pushLaneEndpointVertices(
  out: VertexCandidate[],
  edges: EdgeCandidate[],
  pts: GeoPoint[],
  entityId: string,
): void {
  if (pts.length === 0) return;
  out.push({
    point: pts[0]!,
    entityId,
    entityType: 'lane',
    vertexIndex: 0,
    endpointRole: 'start',
  });
  if (pts.length > 1) {
    out.push({
      point: pts[pts.length - 1]!,
      entityId,
      entityType: 'lane',
      vertexIndex: pts.length - 1,
      endpointRole: 'end',
    });
  }
  // Edge segments still cover the whole polyline so mid-lane proximity
  // can produce an 'edge' snap (not an endpoint snap).
  for (let i = 0; i < pts.length - 1; i++) {
    edges.push({ a: pts[i]!, b: pts[i + 1]!, entityId, entityType: 'lane' });
  }
}

/**
 * Collect snap candidates from every entity.
 *
 * `excludeId` is the actively-edited entity (we don't want to snap onto
 * ourselves while dragging). Pass null when drawing a fresh entity.
 */
export function collectCandidates(
  entities: Iterable<MapEntity>,
  excludeId: string | null,
): SnapCandidates {
  const vertices: VertexCandidate[] = [];
  const edges: EdgeCandidate[] = [];

  for (const e of entities) {
    if (excludeId && e.id === excludeId) continue;
    const collector = SNAP_COLLECTORS[e.entityType as keyof typeof SNAP_COLLECTORS];
    if (collector) {
      collector(e, vertices, edges);
      continue;
    }
    collectGenericCandidates(e, vertices, edges);
  }

  return { vertices, edges };
}

export function collectSnapGuidePoints(entity: MapEntity): GeoPoint[] {
  // Move snapping should only use editable control points, not edge midpoints.
  // Edge projections stay available in the generic draw snap path.
  const { vertices } = collectCandidates([entity], null);
  return vertices.map((candidate) => candidate.point);
}

// ─── Distance / projection in local ENU ────────────────────────────────────

interface Projected {
  x: number;
  y: number;
}

function project(p: GeoPoint, cosLat: number): Projected {
  return { x: p.x * cosLat * DEG_TO_M, y: p.y * DEG_TO_M };
}

function unproject(p: Projected, cosLat: number): GeoPoint {
  return { x: p.x / (cosLat * DEG_TO_M), y: p.y / DEG_TO_M };
}

/**
 * Closest point on segment ab to p, all in local meters.
 * Returns the projected point and its squared distance to p.
 */
function closestOnSegment(
  p: Projected,
  a: Projected,
  b: Projected,
): { x: number; y: number; distSq: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const segLenSq = dx * dx + dy * dy;
  if (segLenSq < 1e-12) {
    const ddx = p.x - a.x;
    const ddy = p.y - a.y;
    return { x: a.x, y: a.y, distSq: ddx * ddx + ddy * ddy };
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / segLenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  const ddx = p.x - x;
  const ddy = p.y - y;
  return { x, y, distSq: ddx * ddx + ddy * ddy };
}

// ─── Public entry ──────────────────────────────────────────────────────────

/**
 * Find the best snap target for `point` against `entities`.
 *
 * @param point          Cursor / drag position (lng/lat).
 * @param entities       All map entities to consider as snap sources.
 * @param radiusMeters   Search radius in meters (caller derives from pixel
 *                       threshold + current zoom + cursor latitude).
 * @param excludeId      Entity being edited; its own geometry is skipped.
 * @returns SnapTarget or null if nothing is within range.
 *
 * Resolution order: vertices first, edges second. A vertex within range
 * wins over a closer edge — this matches user intent ("connect to that
 * endpoint" beats "snap to the line near it").
 */
export function findSnapTarget(
  point: GeoPoint,
  entities: Iterable<MapEntity>,
  radiusMeters: number,
  excludeId: string | null = null,
): SnapTarget | null {
  return (
    findSnapMatchFromCandidates(point, collectCandidates(entities, excludeId), radiusMeters)
      ?.target ?? null
  );
}

export function findSnapMatchFromCandidates(
  point: GeoPoint,
  candidates: SnapCandidates,
  radiusMeters: number,
): SnapMatch | null {
  if (radiusMeters <= 0) return null;
  const cosLat = Math.cos((point.y * Math.PI) / 180);
  const pp = project(point, cosLat);
  const radiusSq = radiusMeters * radiusMeters;

  // Pass 1 — vertices.
  let bestVertex: { cand: VertexCandidate; distSq: number } | null = null;
  for (const cand of candidates.vertices) {
    const cp = project(cand.point, cosLat);
    const dx = pp.x - cp.x;
    const dy = pp.y - cp.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= radiusSq && (!bestVertex || distSq < bestVertex.distSq)) {
      bestVertex = { cand, distSq };
    }
  }
  if (bestVertex) {
    return {
      target: {
        kind: 'vertex',
        point: bestVertex.cand.point,
        entityId: bestVertex.cand.entityId,
        entityType: bestVertex.cand.entityType,
        vertexIndex: bestVertex.cand.vertexIndex,
        ...(bestVertex.cand.endpointRole ? { endpointRole: bestVertex.cand.endpointRole } : {}),
      },
      distanceMeters: Math.sqrt(bestVertex.distSq),
    };
  }

  // Pass 2 — edges.
  let bestEdge: {
    cand: EdgeCandidate;
    projected: { x: number; y: number };
    distSq: number;
  } | null = null;
  for (const cand of candidates.edges) {
    const a = project(cand.a, cosLat);
    const b = project(cand.b, cosLat);
    const projection = closestOnSegment(pp, a, b);
    if (projection.distSq <= radiusSq && (!bestEdge || projection.distSq < bestEdge.distSq)) {
      bestEdge = { cand, projected: projection, distSq: projection.distSq };
    }
  }
  if (bestEdge) {
    return {
      target: {
        kind: 'edge',
        point: unproject(bestEdge.projected, cosLat),
        entityId: bestEdge.cand.entityId,
        entityType: bestEdge.cand.entityType,
      },
      distanceMeters: Math.sqrt(bestEdge.distSq),
    };
  }

  return null;
}
