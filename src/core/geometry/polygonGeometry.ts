import RBush from 'rbush';
import polygonClipping, {
  type MultiPolygon as PCMultiPolygon,
  type Polygon as PCPolygon,
  type Ring,
} from 'polygon-clipping';
import type { LngLat } from './interpolate';

interface SegmentItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  index: number;
}

const EPSILON = 1e-12;
const INDEXED_SEGMENT_THRESHOLD = 64;

function samePoint(a: LngLat, b: LngLat): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function dedupeClosingPoint(coords: readonly LngLat[]): LngLat[] {
  if (coords.length < 2) return [...coords];
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  return samePoint(first, last) ? coords.slice(0, -1) : [...coords];
}

function closeRing(coords: readonly LngLat[]): LngLat[] {
  if (coords.length === 0) return [];
  const ring = [...coords];
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (!samePoint(first, last)) ring.push([first[0], first[1]]);
  return ring;
}

function cross(a: LngLat, b: LngLat, c: LngLat): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function nearlyZero(value: number): boolean {
  return Math.abs(value) <= EPSILON;
}

function within(value: number, a: number, b: number): boolean {
  return value >= Math.min(a, b) - EPSILON && value <= Math.max(a, b) + EPSILON;
}

function onSegment(a: LngLat, b: LngLat, p: LngLat): boolean {
  return nearlyZero(cross(a, b, p)) && within(p[0], a[0], b[0]) && within(p[1], a[1], b[1]);
}

function segmentsTouchOrCross(a1: LngLat, a2: LngLat, b1: LngLat, b2: LngLat): boolean {
  const d1 = cross(a1, a2, b1);
  const d2 = cross(a1, a2, b2);
  const d3 = cross(b1, b2, a1);
  const d4 = cross(b1, b2, a2);

  if (
    ((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) &&
    ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))
  ) {
    return true;
  }
  return (
    onSegment(a1, a2, b1) || onSegment(a1, a2, b2) || onSegment(b1, b2, a1) || onSegment(b1, b2, a2)
  );
}

function segmentItem(coords: readonly LngLat[], index: number): SegmentItem | null {
  const a = coords[index]!;
  const b = coords[(index + 1) % coords.length]!;
  if (samePoint(a, b)) return null;
  return {
    minX: Math.min(a[0], b[0]),
    minY: Math.min(a[1], b[1]),
    maxX: Math.max(a[0], b[0]),
    maxY: Math.max(a[1], b[1]),
    index,
  };
}

function adjacentSegments(a: number, b: number, segmentCount: number): boolean {
  const diff = Math.abs(a - b);
  return diff === 1 || diff === segmentCount - 1;
}

function segmentBoundsOverlap(a: SegmentItem, b: SegmentItem): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function buildSegmentItems(coords: readonly LngLat[]): SegmentItem[] {
  const items: SegmentItem[] = [];
  for (let i = 0; i < coords.length; i++) {
    const item = segmentItem(coords, i);
    if (item) items.push(item);
  }
  return items;
}

function nonAdjacentSegmentsTouchOrCross(
  coords: readonly LngLat[],
  a: SegmentItem,
  b: SegmentItem,
): boolean {
  if (adjacentSegments(a.index, b.index, coords.length)) return false;
  const a1 = coords[a.index]!;
  const a2 = coords[(a.index + 1) % coords.length]!;
  const b1 = coords[b.index]!;
  const b2 = coords[(b.index + 1) % coords.length]!;
  return segmentsTouchOrCross(a1, a2, b1, b2);
}

function needsPolygonNormalizationBruteForce(
  coords: readonly LngLat[],
  items: readonly SegmentItem[],
): boolean {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    for (let j = i + 1; j < items.length; j++) {
      const other = items[j]!;
      if (!segmentBoundsOverlap(item, other)) continue;
      if (nonAdjacentSegmentsTouchOrCross(coords, item, other)) return true;
    }
  }
  return false;
}

function needsPolygonNormalizationIndexed(
  coords: readonly LngLat[],
  items: readonly SegmentItem[],
): boolean {
  const tree = new RBush<SegmentItem>();
  if (items.length < 4) return false;
  tree.load([...items]);

  for (const item of items) {
    for (const other of tree.search(item)) {
      if (other.index <= item.index) continue;
      if (nonAdjacentSegmentsTouchOrCross(coords, item, other)) return true;
    }
  }
  return false;
}

function needsPolygonNormalization(coords: readonly LngLat[]): boolean {
  if (coords.length < 4) return false;
  const items = buildSegmentItems(coords);
  if (items.length < 4) return false;
  if (items.length < INDEXED_SEGMENT_THRESHOLD) {
    return needsPolygonNormalizationBruteForce(coords, items);
  }
  return needsPolygonNormalizationIndexed(coords, items);
}

function toClippingPolygon(coords: readonly LngLat[]): PCPolygon {
  const ring = closeRing(coords).map(([x, y]) => [x, y] as [number, number]) as Ring;
  return ring.length >= 4 ? [ring] : [];
}

function closeClippingRing(ring: Ring): GeoJSON.Position[] | null {
  if (ring.length < 4) return null;
  const out = ring.map(([x, y]) => [x, y] as GeoJSON.Position);
  const first = out[0]!;
  const last = out[out.length - 1]!;
  const firstX = first[0]!;
  const firstY = first[1]!;
  if (firstX !== last[0] || firstY !== last[1]) out.push([firstX, firstY]);
  return out.length >= 4 ? out : null;
}

function clippingToGeoJson(result: PCMultiPolygon): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const coordinates: GeoJSON.Position[][][] = [];
  for (const polygon of result) {
    const rings: GeoJSON.Position[][] = [];
    for (const ring of polygon) {
      const closed = closeClippingRing(ring);
      if (closed) rings.push(closed);
    }
    if (rings.length > 0) coordinates.push(rings);
  }
  if (coordinates.length === 0) return null;
  if (coordinates.length === 1) return { type: 'Polygon', coordinates: coordinates[0]! };
  return { type: 'MultiPolygon', coordinates };
}

function normalizeSelfIntersectingPolygon(
  coords: readonly LngLat[],
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const polygon = toClippingPolygon(coords);
  if (polygon.length === 0) return null;
  try {
    return clippingToGeoJson(polygonClipping.union(polygon));
  } catch {
    return null;
  }
}

export function polygonGeometry(coords: readonly LngLat[]): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  const openRing = dedupeClosingPoint(coords);
  const ring = closeRing(openRing);
  const fallback: GeoJSON.Polygon = { type: 'Polygon', coordinates: [ring] };
  if (ring.length < 4 || !needsPolygonNormalization(openRing)) return fallback;
  return normalizeSelfIntersectingPolygon(openRing) ?? fallback;
}
