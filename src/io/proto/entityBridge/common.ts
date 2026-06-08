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
  if (!arr || arr.length === 0) return [];
  const out: string[] = [];
  for (const item of arr) {
    const id = unwrapId(item);
    if (id !== null) out.push(id);
  }
  return out;
}

export function wrapIdArray(ids: string[]): RawId[] {
  if (ids.length === 0) return [];
  const out = new Array<RawId>(ids.length);
  for (let i = 0; i < ids.length; i++) out[i] = wrapId(ids[i]!);
  return out;
}

export function pointFromProto(p: RawPoint): PointENU {
  return p.z === undefined ? { x: p.x ?? 0, y: p.y ?? 0 } : { x: p.x ?? 0, y: p.y ?? 0, z: p.z };
}

export function pointToProto(p: PointENU): RawPoint {
  return p.z === undefined ? { x: p.x, y: p.y } : { x: p.x, y: p.y, z: p.z };
}

export function convertPolygonFromProto(p: RawPolygon | undefined): ApolloPolygon {
  const points = p?.point;
  if (!points || points.length === 0) return { points: [] };
  const out = new Array<PointENU>(points.length);
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    out[i] =
      point.z === undefined
        ? { x: point.x ?? 0, y: point.y ?? 0 }
        : { x: point.x ?? 0, y: point.y ?? 0, z: point.z };
  }
  return { points: out };
}

export function convertPolygonToProto(p: ApolloPolygon): RawPolygon {
  const points = p.points;
  if (points.length === 0) return { point: [] };
  const out = new Array<RawPoint>(points.length);
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    out[i] =
      point.z === undefined ? { x: point.x, y: point.y } : { x: point.x, y: point.y, z: point.z };
  }
  return { point: out };
}

function lineSegmentFromProto(ls: RawLineSegment | undefined): LineSegment {
  const points = ls?.point;
  if (!points || points.length === 0) return { points: [] };
  const out = new Array<PointENU>(points.length);
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    out[i] =
      point.z === undefined
        ? { x: point.x ?? 0, y: point.y ?? 0 }
        : { x: point.x ?? 0, y: point.y ?? 0, z: point.z };
  }
  return { points: out };
}

function lineSegmentToProto(ls: LineSegment): RawLineSegment {
  const points = ls.points;
  if (points.length === 0) return { point: [] };
  const out = new Array<RawPoint>(points.length);
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    out[i] =
      point.z === undefined ? { x: point.x, y: point.y } : { x: point.x, y: point.y, z: point.z };
  }
  return { point: out };
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
  const segments = c?.segment;
  if (!segments || segments.length === 0) return { segments: [] };
  const out = new Array<CurveSegment>(segments.length);
  for (let i = 0; i < segments.length; i++) out[i] = curveSegmentFromProto(segments[i]!);
  return { segments: out };
}

export function curveToProto(c: Curve): RawCurve {
  const segments = c.segments;
  if (segments.length === 0) return { segment: [] };
  const out = new Array<RawCurveSegment>(segments.length);
  for (let i = 0; i < segments.length; i++) out[i] = curveSegmentToProto(segments[i]!);
  return { segment: out };
}

export function curveArrayFromProto(arr: RawCurve[] | undefined): Curve[] {
  if (!arr || arr.length === 0) return [];
  const out = new Array<Curve>(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = curveFromProto(arr[i]!);
  return out;
}

export function curveArrayToProto(arr: Curve[]): RawCurve[] {
  if (arr.length === 0) return [];
  const out = new Array<RawCurve>(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = curveToProto(arr[i]!);
  return out;
}
