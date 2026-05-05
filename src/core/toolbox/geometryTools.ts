import { applyDerive } from '@/core/elements/derive';
import { projectPoint } from '@/core/geometry/apolloCompile/projection';
import { polylineLengthMeters } from '@/lib/geo';
import type { BoundaryPolygon, Curve, CurveSegment, LaneEntity, RoadEntity } from '@/types/apollo';
import type { GeoPoint, MapEntity } from '@/types/entities';

export interface SimplifyGeometryOptions {
  toleranceMeters: number;
}

export interface GeometryToolStats {
  entityCount: number;
  curveCount: number;
  pointCount: number;
}

export interface GeometryToolResult {
  changes: Map<string, MapEntity>;
  before: GeometryToolStats;
  after: GeometryToolStats;
}

interface CurveSimplifyResult {
  curve: Curve;
  beforePoints: number;
  afterPoints: number;
  changed: boolean;
}

interface SegmentSimplifyResult {
  segment: CurveSegment;
  pointCount: number;
  lengthMeters: number;
  changed: boolean;
}

export function simplifyRoadGeometry(
  entities: ReadonlyMap<string, MapEntity>,
  options: SimplifyGeometryOptions,
): GeometryToolResult {
  const toleranceMeters = Math.max(0, options.toleranceMeters);
  const before = collectGeometryStats(entities);
  const changes = new Map<string, MapEntity>();

  if (toleranceMeters <= 0) {
    return { changes, before, after: before };
  }

  for (const entity of entities.values()) {
    const next = simplifyEntityGeometry(entity, toleranceMeters);
    if (next !== entity) changes.set(entity.id, next);
  }

  const after = collectGeometryStatsFromEntities(entities, changes);
  return { changes, before, after };
}

export function rederiveEditableGeometry(
  entities: ReadonlyMap<string, MapEntity>,
): GeometryToolResult {
  const before = collectGeometryStats(entities);
  const changes = new Map<string, MapEntity>();

  for (const entity of entities.values()) {
    const next = rederiveEntity(entity);
    if (next !== entity) changes.set(entity.id, next);
  }

  const after = collectGeometryStatsFromEntities(entities, changes);
  return { changes, before, after };
}

export function collectGeometryStats(entities: ReadonlyMap<string, MapEntity>): GeometryToolStats {
  const stats: GeometryToolStats = { entityCount: 0, curveCount: 0, pointCount: 0 };
  for (const entity of entities.values()) {
    addEntityStats(stats, entity);
  }
  return stats;
}

function collectGeometryStatsFromEntities(
  entities: ReadonlyMap<string, MapEntity>,
  changes: ReadonlyMap<string, MapEntity>,
): GeometryToolStats {
  const merged = new Map(entities);
  for (const [id, entity] of changes) merged.set(id, entity);
  return collectGeometryStats(merged);
}

function addEntityStats(stats: GeometryToolStats, entity: MapEntity): void {
  if (entity.entityType === 'lane') {
    stats.entityCount += 1;
    stats.curveCount += 3;
    stats.pointCount +=
      countCurvePoints(entity.centralCurve) +
      countCurvePoints(entity.leftBoundary.curve) +
      countCurvePoints(entity.rightBoundary.curve);
    return;
  }

  if (entity.entityType === 'road') {
    stats.entityCount += 1;
    stats.curveCount += countRoadCurves(entity);
    stats.pointCount += countRoadPoints(entity);
    return;
  }
}

function countRoadCurves(road: RoadEntity): number {
  let count = 0;
  for (const section of road.sections) {
    if (!section.boundary) continue;
    count += section.boundary.outerPolygon.edges.length;
    for (const hole of section.boundary.holes) count += hole.edges.length;
  }
  return count;
}

function countRoadPoints(road: RoadEntity): number {
  let count = 0;
  for (const section of road.sections) {
    if (!section.boundary) continue;
    count += countBoundaryPolygonPoints(section.boundary.outerPolygon);
    for (const hole of section.boundary.holes) count += countBoundaryPolygonPoints(hole);
  }
  return count;
}

function countBoundaryPolygonPoints(polygon: BoundaryPolygon): number {
  let count = 0;
  for (const edge of polygon.edges) count += countCurvePoints(edge.curve);
  return count;
}

function countCurvePoints(curve: Curve): number {
  return curve.segments.reduce((sum, segment) => sum + segment.lineSegment.points.length, 0);
}

function simplifyEntityGeometry(entity: MapEntity, toleranceMeters: number): MapEntity {
  if (entity.entityType === 'lane') {
    return simplifyLane(entity, toleranceMeters);
  }
  if (entity.entityType === 'road') {
    return simplifyRoad(entity, toleranceMeters);
  }
  return entity;
}

function simplifyLane(lane: LaneEntity, toleranceMeters: number): LaneEntity {
  const central = simplifyCurve(lane.centralCurve, toleranceMeters);
  const left = simplifyCurve(lane.leftBoundary.curve, toleranceMeters);
  const right = simplifyCurve(lane.rightBoundary.curve, toleranceMeters);
  if (!central.changed && !left.changed && !right.changed) return lane;

  const next: LaneEntity = {
    ...lane,
    centralCurve: central.curve,
    leftBoundary: left.changed ? { ...lane.leftBoundary, curve: left.curve } : lane.leftBoundary,
    rightBoundary: right.changed
      ? { ...lane.rightBoundary, curve: right.curve }
      : lane.rightBoundary,
  };
  return applyDerive(next, { cause: 'editGeometry', prev: lane });
}

function simplifyRoad(road: RoadEntity, toleranceMeters: number): RoadEntity {
  let changed = false;
  const sections = road.sections.map((section) => {
    if (!section.boundary) return section;
    const outer = simplifyBoundaryPolygon(section.boundary.outerPolygon, toleranceMeters);
    const holes = section.boundary.holes.map((hole) =>
      simplifyBoundaryPolygon(hole, toleranceMeters),
    );
    const sectionChanged = outer.changed || holes.some((hole) => hole.changed);
    if (!sectionChanged) return section;
    changed = true;
    return {
      ...section,
      boundary: {
        ...section.boundary,
        outerPolygon: outer.polygon,
        holes: holes.map((hole) => hole.polygon),
      },
    };
  });

  return changed ? { ...road, sections } : road;
}

function simplifyBoundaryPolygon(
  polygon: BoundaryPolygon,
  toleranceMeters: number,
): { polygon: BoundaryPolygon; changed: boolean } {
  let changed = false;
  const edges = polygon.edges.map((edge) => {
    const simplified = simplifyCurve(edge.curve, toleranceMeters);
    if (!simplified.changed) return edge;
    changed = true;
    return { ...edge, curve: simplified.curve };
  });
  return changed ? { polygon: { edges }, changed: true } : { polygon, changed: false };
}

function simplifyCurve(curve: Curve, toleranceMeters: number): CurveSimplifyResult {
  let curveChanged = false;
  let beforePoints = 0;
  let afterPoints = 0;
  let cumulativeS = 0;

  const segments = curve.segments.map((segment) => {
    const result = simplifySegment(segment, toleranceMeters, cumulativeS, curveChanged);
    beforePoints += segment.lineSegment.points.length;
    afterPoints += result.pointCount;
    curveChanged ||= result.changed;
    cumulativeS += result.lengthMeters;
    return result.segment;
  });

  return {
    curve: curveChanged ? { segments } : curve,
    beforePoints,
    afterPoints,
    changed: curveChanged,
  };
}

function simplifySegment(
  segment: CurveSegment,
  toleranceMeters: number,
  cumulativeS: number,
  previousSegmentChanged: boolean,
): SegmentSimplifyResult {
  const originalPoints = segment.lineSegment.points;
  const simplifiedPoints = simplifyPoints(originalPoints, toleranceMeters);
  const lengthMeters = polylineLengthMeters(simplifiedPoints);
  const pointsChanged = simplifiedPoints !== originalPoints;

  if (!pointsChanged) {
    return segmentWithMaybeUpdatedS(segment, cumulativeS, previousSegmentChanged, lengthMeters);
  }

  return {
    segment: segmentWithSimplifiedPoints(segment, simplifiedPoints, cumulativeS),
    pointCount: simplifiedPoints.length,
    lengthMeters,
    changed: true,
  };
}

function segmentWithMaybeUpdatedS(
  segment: CurveSegment,
  cumulativeS: number,
  previousSegmentChanged: boolean,
  lengthMeters: number,
): SegmentSimplifyResult {
  const shouldUpdateS =
    previousSegmentChanged && segment.s !== undefined && segment.s !== cumulativeS;
  return {
    segment: shouldUpdateS ? { ...segment, s: cumulativeS } : segment,
    pointCount: segment.lineSegment.points.length,
    lengthMeters,
    changed: shouldUpdateS,
  };
}

function segmentWithSimplifiedPoints(
  segment: CurveSegment,
  points: GeoPoint[],
  cumulativeS: number,
): CurveSegment {
  const next: CurveSegment = { ...segment, lineSegment: { points } };
  if (segment.startPosition !== undefined) next.startPosition = points[0] ?? segment.startPosition;
  if (segment.length !== undefined) next.length = polylineLengthMeters(points);
  if (segment.heading !== undefined) next.heading = headingFromPoints(points, segment.heading);
  if (segment.s !== undefined) next.s = cumulativeS;
  return next;
}

function simplifyPoints(points: readonly GeoPoint[], toleranceMeters: number): GeoPoint[] {
  if (points.length <= 2 || toleranceMeters <= 0) return points as GeoPoint[];

  const cosLat = Math.cos((averageLat(points) * Math.PI) / 180);
  const projected = points.map((point) => projectPoint(point, cosLat));
  const keep = rdpKeep(projected, toleranceMeters);
  if (keep.every(Boolean)) return points as GeoPoint[];

  const simplified: GeoPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) simplified.push(points[i]!);
  }
  return simplified;
}

function rdpKeep(points: readonly { x: number; y: number }[], toleranceMeters: number): boolean[] {
  const keep = Array(points.length).fill(false);
  if (points.length === 0) return keep;
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const toleranceSq = toleranceMeters * toleranceMeters;

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end - start <= 1) continue;

    let furthestIndex = -1;
    let furthestDistSq = toleranceSq;

    const a = points[start]!;
    const b = points[end]!;
    for (let i = start + 1; i < end; i++) {
      const distSq = pointToSegmentDistSq(points[i]!, a, b);
      if (distSq > furthestDistSq) {
        furthestDistSq = distSq;
        furthestIndex = i;
      }
    }

    if (furthestIndex >= 0) {
      keep[furthestIndex] = true;
      stack.push([start, furthestIndex], [furthestIndex, end]);
    }
  }

  return keep;
}

function pointToSegmentDistSq(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    const px = p.x - a.x;
    const py = p.y - a.y;
    return px * px + py * py;
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  const ex = p.x - cx;
  const ey = p.y - cy;
  return ex * ex + ey * ey;
}

function averageLat(points: readonly GeoPoint[]): number {
  if (points.length === 0) return 0;
  return points.reduce((sum, point) => sum + point.y, 0) / points.length;
}

function headingFromPoints(points: readonly GeoPoint[], fallback: number): number {
  if (points.length < 2) return fallback;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first.x === last.x && first.y === last.y) return fallback;
  const cosLat = Math.cos(((first.y + last.y) / 2) * (Math.PI / 180));
  const start = projectPoint(first, cosLat);
  const end = projectPoint(last, cosLat);
  return Math.atan2(end.y - start.y, end.x - start.x);
}

function rederiveEntity(entity: MapEntity): MapEntity {
  return applyDerive(entity, { cause: 'editGeometry', prev: entity });
}
