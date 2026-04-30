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
  return {
    lineSegment: lineSegmentFromProto(seg.line_segment),
    s: seg.s ?? 0,
    startPosition: seg.start_position ? pointFromProto(seg.start_position) : { x: 0, y: 0 },
    heading: seg.heading ?? 0,
    length: seg.length ?? 0,
  };
}

function curveSegmentToProto(seg: CurveSegment): RawCurveSegment {
  return {
    line_segment: lineSegmentToProto(seg.lineSegment),
    s: seg.s,
    start_position: pointToProto(seg.startPosition),
    heading: seg.heading,
    length: seg.length,
  };
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
