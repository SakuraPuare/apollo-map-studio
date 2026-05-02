import proj4 from 'proj4';

const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';

/**
 * Strip Apollo template placeholders like `+lat_0={37.413082}` → `+lat_0=37.413082`.
 * Apollo's reference Sunnyvale/garage maps embed PROJ strings with literal `{}`
 * around the numeric arguments; proj4 rejects them, so we sanitize here.
 */
export function sanitizeProjString(s: string): string {
  return s.replace(/\{([^}]+)\}/g, '$1').trim();
}

export interface PointXY {
  x: number;
  y: number;
  z?: number;
}

export interface Projection {
  /** PROJ.4 string for the source CRS (after sanitization). */
  readonly projString: string;
  /** Convert source CRS (Apollo `PointENU` UTM meters) → WGS84 lon/lat degrees. */
  toLonLat(p: PointXY): PointXY;
  /** Convert WGS84 lon/lat degrees → source CRS (Apollo UTM meters). */
  fromLonLat(p: PointXY): PointXY;
}

/** Build a Projection from a PROJ.4 string (typically the value of Header.projection.proj). */
export function makeProjection(projString: string): Projection {
  const clean = sanitizeProjString(projString);
  const toWgs84 = proj4(clean, WGS84);
  const fromWgs84 = proj4(WGS84, clean);
  return {
    projString: clean,
    toLonLat: ({ x, y, z }) => {
      const [lon, lat] = toWgs84.forward([x, y]);
      return z === undefined ? { x: lon, y: lat } : { x: lon, y: lat, z };
    },
    fromLonLat: ({ x, y, z }) => {
      const [ex, ey] = fromWgs84.forward([x, y]);
      return z === undefined ? { x: ex, y: ey } : { x: ex, y: ey, z };
    },
  };
}

/**
 * Build a UTM PROJ string for a given zone and hemisphere.
 * Used as fallback when an imported map has no `header.projection` set.
 */
export function utmProjString(zone: number, hemisphere: 'N' | 'S' = 'N'): string {
  if (zone < 1 || zone > 60) throw new Error(`UTM zone out of range: ${zone}`);
  const south = hemisphere === 'S' ? ' +south' : '';
  return `+proj=utm +zone=${zone}${south} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
}

/**
 * Infer UTM zone from a known longitude in degrees.
 * Each UTM zone covers 6° of longitude, starting at -180°.
 */
export function utmZoneFromLon(lonDeg: number): number {
  let lon = lonDeg;
  while (lon < -180) lon += 360;
  while (lon > 180) lon -= 360;
  return Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
}

/**
 * Convenience presets for common UTM zones encountered with Apollo maps.
 * (The zone cannot be inferred from `(x, y)` alone — UTM is per-zone local
 * coordinates, so the same easting/northing exists in every zone. Callers
 * must supply zone information from an external source, such as the user
 * pointing at the map's region or reading an existing PROJ string.)
 */
export const UTM_PRESETS = {
  sunnyvale: utmProjString(10, 'N'),
  beijing: utmProjString(50, 'N'),
  shanghai: utmProjString(51, 'N'),
  shenzhen: utmProjString(50, 'N'),
} as const;
