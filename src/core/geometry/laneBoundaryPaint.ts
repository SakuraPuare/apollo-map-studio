import type { BoundaryLineType, LaneBoundaryTypeEntry, LaneEntity } from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';
import type { LngLat } from './interpolate';
import { offsetPolylineDeg } from './apolloCompile';
import { curvePoints, explicitLaneBoundaryEdges } from './apolloCompile/laneBoundaryGeometry';
import { DEG_TO_M } from './laneJunctions/internal';

export type LaneBoundarySide = 'left' | 'right';

export interface LaneBoundaryPaintHit {
  laneId: string;
  side: LaneBoundarySide;
  s: number;
  distanceMeters: number;
}

export interface LaneBoundaryPaintOptions {
  maxDistanceMeters?: number;
}

const DEFAULT_MAX_DISTANCE_METERS = 8;
const EPSILON_S = 1e-4;

type ProjectedPoint = { x: number; y: number };

function project(point: GeoPoint | LngLat, cosLat: number): ProjectedPoint {
  const x = Array.isArray(point) ? point[0] : point.x;
  const y = Array.isArray(point) ? point[1] : point.y;
  return { x: x * cosLat * DEG_TO_M, y: y * DEG_TO_M };
}

function boundaryPoints(lane: LaneEntity, side: LaneBoundarySide): GeoPoint[] {
  const explicit = explicitLaneBoundaryEdges(lane);
  if (explicit) return side === 'left' ? explicit.left : explicit.right;

  const centerPoints = curvePoints(lane.centralCurve);
  if (centerPoints.length < 2) return [];
  const samples = side === 'left' ? lane.leftSamples : lane.rightSamples;
  const width = samples[0]?.width ?? 0;
  if (Math.abs(width) <= 1e-9) return centerPoints;
  return offsetPolylineDeg(centerPoints, width, side);
}

function closestSOnPolyline(
  points: GeoPoint[],
  target: LngLat,
): { s: number; distanceMeters: number; lengthMeters: number } | null {
  if (points.length < 2) return null;
  let latSum = 0;
  for (const point of points) latSum += point.y;
  const avgLat = latSum / points.length;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);
  const targetProjected = project(target, cosLat);
  const targetX = targetProjected.x;
  const targetY = targetProjected.y;
  let accumulated = 0;
  let best: { s: number; distanceMeters: number } | null = null;
  let ax = points[0]!.x * cosLat * DEG_TO_M;
  let ay = points[0]!.y * DEG_TO_M;

  for (let i = 0; i < points.length - 1; i++) {
    const next = points[i + 1]!;
    const bx = next.x * cosLat * DEG_TO_M;
    const by = next.y * DEG_TO_M;
    const vx = bx - ax;
    const vy = by - ay;
    const lenSq = vx * vx + vy * vy;
    const len = Math.sqrt(lenSq);
    if (len <= 1e-9) {
      ax = bx;
      ay = by;
      continue;
    }

    const rawT = ((targetX - ax) * vx + (targetY - ay) * vy) / lenSq;
    const t = Math.max(0, Math.min(1, rawT));
    const closestX = ax + vx * t;
    const closestY = ay + vy * t;
    const distanceMeters = Math.hypot(targetX - closestX, targetY - closestY);
    const s = accumulated + len * t;
    if (!best || distanceMeters < best.distanceMeters) best = { s, distanceMeters };
    accumulated += len;
    ax = bx;
    ay = by;
  }

  if (!best) return null;
  return { ...best, lengthMeters: accumulated };
}

function normalizeBoundaryTypes(
  entries: LaneBoundaryTypeEntry[],
  lengthMeters: number,
): LaneBoundaryTypeEntry[] {
  if (entries.length === 0) return [];
  const sorted = entries
    .map((entry) => ({
      ...entry,
      s: Math.max(0, Math.min(lengthMeters, entry.s ?? 0)),
      types: [...entry.types],
    }))
    .sort((a, b) => (a.s ?? 0) - (b.s ?? 0));

  const merged: LaneBoundaryTypeEntry[] = [];
  for (const entry of sorted) {
    const last = merged[merged.length - 1];
    if (last && Math.abs((last.s ?? 0) - (entry.s ?? 0)) <= EPSILON_S) {
      merged[merged.length - 1] = entry;
    } else {
      merged.push(entry);
    }
  }
  return merged;
}

function sameTypes(a: BoundaryLineType[], b: BoundaryLineType[]): boolean {
  return a.length === b.length && a.every((type, index) => type === b[index]);
}

function collapseBoundaryTypes(entries: LaneBoundaryTypeEntry[]): LaneBoundaryTypeEntry[] {
  return entries.filter((entry, index) => {
    const prev = entries[index - 1];
    return !prev || !sameTypes(prev.types, entry.types);
  });
}

export function setLaneBoundaryTypeAtS(
  lane: LaneEntity,
  side: LaneBoundarySide,
  s: number,
  type: BoundaryLineType,
): LaneEntity {
  const boundary = side === 'left' ? lane.leftBoundary : lane.rightBoundary;
  const lengthMeters = Math.max(0, boundary.length ?? lane.length ?? s);
  const clampedS = Math.max(0, Math.min(lengthMeters, s));
  const entries = normalizeBoundaryTypes(boundary.boundaryType, Math.max(lengthMeters, clampedS));
  const nextType: BoundaryLineType[] = [type];

  let nextEntries: LaneBoundaryTypeEntry[];
  if (entries.length === 0) {
    nextEntries = [{ s: 0, types: nextType }];
  } else {
    nextEntries = [...entries];
    if (clampedS <= EPSILON_S) {
      nextEntries[0] = { s: 0, types: nextType };
    } else {
      const exactIndex = nextEntries.findIndex(
        (entry) => Math.abs((entry.s ?? 0) - clampedS) <= EPSILON_S,
      );
      if (exactIndex >= 0) {
        nextEntries[exactIndex] = { s: nextEntries[exactIndex]!.s, types: nextType };
      } else {
        nextEntries.push({ s: clampedS, types: nextType });
        nextEntries.sort((a, b) => (a.s ?? 0) - (b.s ?? 0));
      }
    }
  }

  const collapsed = collapseBoundaryTypes(nextEntries);

  const nextBoundary = { ...boundary, boundaryType: collapsed };
  return side === 'left'
    ? { ...lane, leftBoundary: nextBoundary }
    : { ...lane, rightBoundary: nextBoundary };
}

export function setLaneBoundaryType(
  lane: LaneEntity,
  side: LaneBoundarySide,
  type: BoundaryLineType,
): LaneEntity {
  const boundary = side === 'left' ? lane.leftBoundary : lane.rightBoundary;
  const nextBoundary = { ...boundary, boundaryType: [{ s: 0, types: [type] }] };
  return side === 'left'
    ? { ...lane, leftBoundary: nextBoundary }
    : { ...lane, rightBoundary: nextBoundary };
}

export function findLaneBoundaryPaintHit(
  lanes: Iterable<LaneEntity>,
  point: LngLat,
  options: LaneBoundaryPaintOptions = {},
): LaneBoundaryPaintHit | null {
  const maxDistanceMeters = options.maxDistanceMeters ?? DEFAULT_MAX_DISTANCE_METERS;
  let best: LaneBoundaryPaintHit | null = null;

  for (const lane of lanes) {
    for (const side of ['left', 'right'] as const) {
      const match = closestSOnPolyline(boundaryPoints(lane, side), point);
      if (!match || match.distanceMeters > maxDistanceMeters) continue;
      if (!best || match.distanceMeters < best.distanceMeters) {
        best = {
          laneId: lane.id,
          side,
          s: match.s,
          distanceMeters: match.distanceMeters,
        };
      }
    }
  }

  return best;
}

export function paintLaneBoundaryTypeAtPoint(
  lane: LaneEntity,
  point: LngLat,
  type: BoundaryLineType,
  options: LaneBoundaryPaintOptions = {},
): { lane: LaneEntity; hit: LaneBoundaryPaintHit } | null {
  const hit = findLaneBoundaryPaintHit([lane], point, options);
  if (!hit) return null;
  return { lane: setLaneBoundaryType(lane, hit.side, type), hit };
}
