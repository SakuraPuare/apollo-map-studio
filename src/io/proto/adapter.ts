import * as protobuf from 'protobufjs';
import { getMapType } from './loader';
import { makeProjection, type Projection, type PointXY } from './projection';

const POINT_ENU_NAME = '.apollo.common.PointENU';
const TYPE_FIELDS = new WeakMap<protobuf.Type, readonly protobuf.Field[]>();
const TYPE_CONTAINS_POINT = new WeakMap<protobuf.Type, boolean>();

interface TransformContext {
  transform: (p: PointXY) => PointXY;
  memo: WeakMap<object, unknown>;
  pointMemo: Map<string, PointXY>;
}

function cloneTransformedValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => cloneTransformedValue(item));
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = cloneTransformedValue(item);
  }
  return out;
}

function fieldsForType(type: protobuf.Type): readonly protobuf.Field[] {
  const cached = TYPE_FIELDS.get(type);
  if (cached) return cached;
  for (const field of type.fieldsArray) field.resolve();
  TYPE_FIELDS.set(type, type.fieldsArray);
  return type.fieldsArray;
}

function typeContainsPoint(type: protobuf.Type, visiting = new WeakSet<protobuf.Type>()): boolean {
  if (type.fullName === POINT_ENU_NAME) return true;
  const cached = TYPE_CONTAINS_POINT.get(type);
  if (cached !== undefined) return cached;
  if (visiting.has(type)) return false;

  visiting.add(type);
  for (const field of fieldsForType(type)) {
    const child = field.resolvedType;
    if (child instanceof protobuf.Type && typeContainsPoint(child, visiting)) {
      TYPE_CONTAINS_POINT.set(type, true);
      visiting.delete(type);
      return true;
    }
  }
  visiting.delete(type);
  TYPE_CONTAINS_POINT.set(type, false);
  return false;
}

/**
 * Recursively walk a decoded protobufjs message tree and apply `transform`
 * to every nested `apollo.common.PointENU` sub-message. Returns a new tree;
 * the input is not mutated.
 */
function transformPointsInMessage(
  type: protobuf.Type,
  msg: unknown,
  context: TransformContext,
): unknown {
  if (msg === null || typeof msg !== 'object') return msg;
  if (type.fullName === POINT_ENU_NAME) {
    return transformPointMemoized(msg as PointXY, context);
  }
  const memoized = context.memo.get(msg);
  if (memoized !== undefined) return cloneTransformedValue(memoized);

  const src = msg as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  context.memo.set(src, out);
  for (const field of fieldsForType(type)) {
    const v = src[field.name];
    if (v === undefined || v === null) continue;
    if (field.map) {
      out[field.name] = transformMapField(field, v, context);
      continue;
    }
    if (field.resolvedType instanceof protobuf.Type) {
      const sub = field.resolvedType;
      if (!typeContainsPoint(sub)) {
        out[field.name] = cloneTransformedValue(v);
        continue;
      }
      if (field.repeated && Array.isArray(v)) {
        const items = new Array<unknown>(v.length);
        context.memo.set(v, items);
        for (let i = 0; i < v.length; i++) items[i] = transformPointsInMessage(sub, v[i], context);
        out[field.name] = items;
      } else {
        out[field.name] = transformPointsInMessage(sub, v, context);
      }
    } else {
      out[field.name] = cloneTransformedValue(v);
    }
  }
  return out;
}

function transformMapField(
  field: protobuf.Field,
  value: unknown,
  context: TransformContext,
): unknown {
  if (!(field.resolvedType instanceof protobuf.Type)) return cloneTransformedValue(value);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return cloneTransformedValue(value);
  }
  if (!typeContainsPoint(field.resolvedType)) return cloneTransformedValue(value);
  const memoized = context.memo.get(value);
  if (memoized !== undefined) return cloneTransformedValue(memoized);

  const out: Record<string, unknown> = {};
  context.memo.set(value, out);
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = transformPointsInMessage(field.resolvedType, item, context);
  }
  return out;
}

function pointMemoKey(p: PointXY): string {
  return p.z === undefined ? `${p.x},${p.y}` : `${p.x},${p.y},${p.z}`;
}

function clonePoint(point: PointXY): PointXY {
  return point.z === undefined
    ? { x: point.x, y: point.y }
    : { x: point.x, y: point.y, z: point.z };
}

function transformPointMemoized(point: PointXY, context: TransformContext): PointXY {
  const key = pointMemoKey(point);
  const cached = context.pointMemo.get(key);
  if (cached) return clonePoint(cached);
  const transformed = context.transform(point);
  context.pointMemo.set(key, transformed);
  return clonePoint(transformed);
}

function transformMapPoints(
  type: protobuf.Type,
  map: Record<string, unknown>,
  transform: (p: PointXY) => PointXY,
): Record<string, unknown> {
  return transformPointsInMessage(type, map, {
    transform,
    memo: new WeakMap<object, unknown>(),
    pointMemo: new Map<string, PointXY>(),
  }) as Record<string, unknown>;
}

export interface ApolloMapInLonLat {
  /** Decoded Map message; every PointENU is in WGS84 lon/lat (x=lon, y=lat). */
  map: Record<string, unknown>;
  /** Sanitized PROJ string used for the conversion. */
  projString: string;
  /** Live projection helper for follow-up conversions. */
  projection: Projection;
}

/**
 * Convert a decoded Apollo Map (UTM ENU coordinates per Apollo proto convention)
 * into the editor-friendly form where every PointENU contains WGS84 lon/lat.
 */
export async function apolloMapToLonLat(
  map: Record<string, unknown>,
  projString: string,
): Promise<ApolloMapInLonLat> {
  const Map = await getMapType();
  const projection = makeProjection(projString);
  const transformed = transformMapPoints(Map, map, (p) => projection.toLonLat(p));
  return {
    map: transformed as Record<string, unknown>,
    projString: projection.projString,
    projection,
  };
}

/**
 * Convert a lon/lat-coded Map back to UTM ENU in preparation for binary
 * or text serialization that downstream Apollo tooling will read.
 */
export async function apolloMapFromLonLat(
  map: Record<string, unknown>,
  projString: string,
): Promise<{ map: Record<string, unknown>; projection: Projection }> {
  const Map = await getMapType();
  const projection = makeProjection(projString);
  const transformed = transformMapPoints(Map, map, (p) => projection.fromLonLat(p));
  return { map: transformed as Record<string, unknown>, projection };
}

/**
 * Read the projection string out of the Map.header, with sanitization so
 * Apollo's `{}` template placeholders don't break proj4. Returns null if
 * the header has no projection set.
 */
export function readHeaderProjString(map: Record<string, unknown>): string | null {
  const header = map.header as { projection?: { proj?: unknown } } | undefined;
  const proj = header?.projection?.proj;
  if (proj == null) return null;
  if (typeof proj === 'string') return proj;
  if (proj instanceof Uint8Array) return new TextDecoder().decode(proj);
  if (Array.isArray(proj)) {
    const s = proj.map((b) => String.fromCharCode(b as number)).join('');
    return s;
  }
  return null;
}

/** Shallow entity counts for diagnostics / UI summary lines. */
export function entityCounts(map: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(map)) {
    if (Array.isArray(value)) out[key] = value.length;
  }
  return out;
}
