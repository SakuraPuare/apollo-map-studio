import * as protobuf from 'protobufjs';
import { getMapType } from './loader';
import { makeProjection, type Projection, type PointXY } from './projection';

const POINT_ENU_NAME = '.apollo.common.PointENU';

/**
 * Recursively walk a decoded protobufjs message tree and apply `transform`
 * to every nested `apollo.common.PointENU` sub-message. Returns a new tree;
 * the input is not mutated.
 */
function transformPointsInMessage(
  type: protobuf.Type,
  msg: unknown,
  transform: (p: PointXY) => PointXY,
): unknown {
  if (msg === null || typeof msg !== 'object') return msg;
  if (type.fullName === POINT_ENU_NAME) {
    return transform(msg as PointXY);
  }
  const src = msg as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of type.fieldsArray) {
    field.resolve();
    const v = src[field.name];
    if (v === undefined || v === null) continue;
    if (field.map) {
      out[field.name] = transformMapField(field, v, transform);
      continue;
    }
    if (field.resolvedType instanceof protobuf.Type) {
      const sub = field.resolvedType;
      if (field.repeated && Array.isArray(v)) {
        out[field.name] = v.map((item) => transformPointsInMessage(sub, item, transform));
      } else {
        out[field.name] = transformPointsInMessage(sub, v, transform);
      }
    } else {
      out[field.name] = v;
    }
  }
  return out;
}

function transformMapField(
  field: protobuf.Field,
  value: unknown,
  transform: (p: PointXY) => PointXY,
): unknown {
  if (!(field.resolvedType instanceof protobuf.Type)) return value;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = transformPointsInMessage(field.resolvedType, item, transform);
  }
  return out;
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
  const transformed = transformPointsInMessage(Map, map, (p) => projection.toLonLat(p));
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
  const transformed = transformPointsInMessage(Map, map, (p) => projection.fromLonLat(p));
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
