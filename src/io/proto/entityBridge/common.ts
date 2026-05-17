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
interface RawLineSegment {
  point?: RawPoint[];
}
interface RawCurveSegment {
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
  // All four scalar fields (`s`, `start_position`, `heading`, `length`) are
  // optional in proto2 and many real Apollo maps omit them — preserve
  // absence end-to-end. Synthesising `0` on import causes the bridge to
  // emit spurious wire bytes on export, which diverges from the source.
  const out: CurveSegment = {
    lineSegment: lineSegmentFromProto(seg.line_segment),
  };
  if (seg.s !== undefined) out.s = seg.s;
  if (seg.start_position !== undefined) {
    out.startPosition = pointFromProto(seg.start_position);
  }
  if (seg.heading !== undefined) out.heading = seg.heading;
  if (seg.length !== undefined) out.length = seg.length;
  return out;
}

function curveSegmentToProto(seg: CurveSegment): RawCurveSegment {
  // Only emit fields that were set on import. Synthesis paths (e.g.
  // user-drawn curves via apolloCompile/conversions.ts) supply real values;
  // round-tripped segments that lacked these fields on the wire stay
  // absent on re-encode.
  const out: RawCurveSegment = {
    line_segment: lineSegmentToProto(seg.lineSegment),
  };
  if (seg.s !== undefined) out.s = seg.s;
  if (seg.startPosition !== undefined) {
    out.start_position = pointToProto(seg.startPosition);
  }
  if (seg.heading !== undefined) out.heading = seg.heading;
  if (seg.length !== undefined) out.length = seg.length;
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
