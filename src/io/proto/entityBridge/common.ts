import type { ApolloPolygon, Curve, CurveSegment, LineSegment, PointENU } from '@/types/apollo';

export interface RawId {
  id?: string;
}
export interface RawPoint {
  x?: number;
  y?: number;
  z?: number;
}
export interface RawPolygon {
  point?: RawPoint[];
}
export interface RawLineSegment {
  point?: RawPoint[];
}
export interface RawCurveSegment {
  line_segment?: RawLineSegment;
  s?: number;
  start_position?: RawPoint;
  heading?: number;
  length?: number;
}
export interface RawCurve {
  segment?: RawCurveSegment[];
}

export function unwrapId(idMsg: RawId | undefined): string | null {
  if (!idMsg || typeof idMsg.id !== 'string') return null;
  return idMsg.id;
}

export function wrapId(id: string): RawId {
  return { id };
}

export function unwrapIdArray(arr: RawId[] | undefined): string[] {
  if (!arr) return [];
  const out: string[] = [];
  for (const item of arr) {
    const id = unwrapId(item);
    if (id !== null) out.push(id);
  }
  return out;
}

export function wrapIdArray(ids: string[]): RawId[] {
  return ids.map(wrapId);
}

export function pointFromProto(p: RawPoint): PointENU {
  return p.z === undefined ? { x: p.x ?? 0, y: p.y ?? 0 } : { x: p.x ?? 0, y: p.y ?? 0, z: p.z };
}

export function pointToProto(p: PointENU): RawPoint {
  return p.z === undefined ? { x: p.x, y: p.y } : { x: p.x, y: p.y, z: p.z };
}

export function convertPolygonFromProto(p: RawPolygon | undefined): ApolloPolygon {
  return { points: (p?.point ?? []).map(pointFromProto) };
}

export function convertPolygonToProto(p: ApolloPolygon): RawPolygon {
  return { point: p.points.map(pointToProto) };
}

function lineSegmentFromProto(ls: RawLineSegment | undefined): LineSegment {
  return { points: (ls?.point ?? []).map(pointFromProto) };
}

function lineSegmentToProto(ls: LineSegment): RawLineSegment {
  return { point: ls.points.map(pointToProto) };
}

function curveSegmentFromProto(seg: RawCurveSegment): CurveSegment {
  // Proto2 `start_position` is optional; many real Apollo maps omit it on
  // `stop_line` and `road.section.boundary` segments. Preserve absence — do
  // NOT inject `{0,0}` here, otherwise re-encoding produces spurious wire
  // bytes that diverge from the source map.
  const out: CurveSegment = {
    lineSegment: lineSegmentFromProto(seg.line_segment),
    s: seg.s ?? 0,
    heading: seg.heading ?? 0,
    length: seg.length ?? 0,
  };
  if (seg.start_position !== undefined) {
    out.startPosition = pointFromProto(seg.start_position);
  }
  return out;
}

function curveSegmentToProto(seg: CurveSegment): RawCurveSegment {
  // Only emit `start_position` when the source had one. Synthesis paths
  // (e.g. user-drawn curves via apolloCompile/conversions.ts) supply a real
  // value; round-tripped real-Apollo segments without `start_position` stay
  // absent on the wire.
  const out: RawCurveSegment = {
    line_segment: lineSegmentToProto(seg.lineSegment),
    s: seg.s,
    heading: seg.heading,
    length: seg.length,
  };
  if (seg.startPosition !== undefined) {
    out.start_position = pointToProto(seg.startPosition);
  }
  return out;
}

export function curveFromProto(c: RawCurve | undefined): Curve {
  return { segments: (c?.segment ?? []).map(curveSegmentFromProto) };
}

export function curveToProto(c: Curve): RawCurve {
  return { segment: c.segments.map(curveSegmentToProto) };
}

export function curveArrayFromProto(arr: RawCurve[] | undefined): Curve[] {
  return (arr ?? []).map(curveFromProto);
}

export function curveArrayToProto(arr: Curve[]): RawCurve[] {
  return arr.map(curveToProto);
}
