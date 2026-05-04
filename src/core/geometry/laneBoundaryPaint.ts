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
  return offsetPolylineDeg(centerPoints, width, side);
}

function closestSOnPolyline(
  points: GeoPoint[],
  target: LngLat,
): { s: number; distanceMeters: number; lengthMeters: number } | null {
  if (points.length < 2) return null;
  const avgLat = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);
  const targetProjected = project(target, cosLat);
  let accumulated = 0;
  let best: { s: number; distanceMeters: number } | null = null;

  for (let i = 0; i < points.length - 1; i++) {
    const a = project(points[i]!, cosLat);
    const b = project(points[i + 1]!, cosLat);
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const lenSq = vx * vx + vy * vy;
    const len = Math.sqrt(lenSq);
    if (len <= 1e-9) continue;

    const rawT = ((targetProjected.x - a.x) * vx + (targetProjected.y - a.y) * vy) / lenSq;
    const t = Math.max(0, Math.min(1, rawT));
    const closest = { x: a.x + vx * t, y: a.y + vy * t };
    const distanceMeters = Math.hypot(targetProjected.x - closest.x, targetProjected.y - closest.y);
    const s = accumulated + len * t;
    if (!best || distanceMeters < best.distanceMeters) best = { s, distanceMeters };
    accumulated += len;
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

  const collapsed = nextEntries.filter((entry, index) => {
    const prev = nextEntries[index - 1];
    return !prev || !sameTypes(prev.types, entry.types);
  });

  const nextBoundary = { ...boundary, boundaryType: collapsed };
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
  return { lane: setLaneBoundaryTypeAtS(lane, hit.side, hit.s, type), hit };
}
