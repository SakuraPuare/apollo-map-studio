import { LANE_EDGE_LINE_OPACITY, LANE_EDGE_LINE_WIDTH } from '@/config/mapConstants';
import { offsetPolylineDeg } from '@/core/geometry/apolloCompile';
import type { LngLat } from '@/core/geometry/interpolate';
import type { BoundaryLineType, LaneBoundary, LaneEntity } from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';
import { DEG_TO_M, type Vec2 } from './internal';

const DOUBLE_YELLOW_GAP_METERS = 0.18;

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

function projectLine(coords: LngLat[]): ProjectedLine {
  const avgLat = coords.reduce((sum, [, lat]) => sum + lat, 0) / Math.max(coords.length, 1);
  const cosLat = Math.cos((avgLat * Math.PI) / 180);
  const points = coords.map(([lng, lat]) => [lng * cosLat * DEG_TO_M, lat * DEG_TO_M] as Vec2);
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(bx - ax, by - ay));
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
    const segStart = projected.cumulative[i]!;
    const segEnd = projected.cumulative[i + 1]!;
    if (segEnd <= clampedStart || segStart >= clampedEnd) continue;

    const a = projected.points[i]!;
    const b = projected.points[i + 1]!;

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

function boundarySegments(
  boundary: LaneBoundary | undefined,
  totalLength: number,
): BoundarySegment[] {
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
  if (entries[0]!.s > 1e-4) normalized.push({ s: 0, type: 'UNKNOWN' });
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
    const item = normalized[i]!;
    const startS = item.s;
    const endS = i + 1 < normalized.length ? normalized[i + 1]!.s : totalLength;
    if (endS - startS <= 1e-4) continue;
    segments.push({ startS, endS, type: item.type });
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
      return {
        color: '#f3d046',
        dashed: true,
        dotted: true,
        lineWidth: LANE_EDGE_LINE_WIDTH,
        lineOpacity: 1,
      };
    case 'DOTTED_WHITE':
      return {
        color: '#ffffff',
        dashed: true,
        dotted: true,
        lineWidth: LANE_EDGE_LINE_WIDTH,
        lineOpacity: 1,
      };
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
      return {
        color: fallbackColor,
        lineWidth: LANE_EDGE_LINE_WIDTH,
        lineOpacity: LANE_EDGE_LINE_OPACITY,
      };
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

export function decorateBoundary(
  lane: LaneEntity,
  side: 'left' | 'right',
  boundaryFeature: GeoJSON.Feature<GeoJSON.LineString> | undefined,
): GeoJSON.Feature<GeoJSON.LineString>[] {
  if (!boundaryFeature) return [];

  const coords = boundaryFeature.geometry.coordinates as LngLat[];
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
      out.push(
        lineFeature(variant, {
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
        }),
      );
    });
  }

  return out;
}
