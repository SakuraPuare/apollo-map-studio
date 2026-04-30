import { describe, it, expect } from 'vitest';
import {
  sanitizeProjString,
  makeProjection,
  utmProjString,
  utmZoneFromLon,
  UTM_PRESETS,
} from '../projection';

describe('sanitizeProjString', () => {
  it('strips Apollo template braces around numeric values', () => {
    const dirty =
      '+proj=tmerc +lat_0={37.413082} +lon_0={-122.013332} +k={0.9999999996} +ellps=WGS84 +no_defs';
    const clean = sanitizeProjString(dirty);
    expect(clean).toBe(
      '+proj=tmerc +lat_0=37.413082 +lon_0=-122.013332 +k=0.9999999996 +ellps=WGS84 +no_defs',
    );
  });

  it('passes through clean PROJ strings unchanged', () => {
    const s = '+proj=utm +zone=10 +ellps=WGS84 +datum=WGS84 +units=m +no_defs';
    expect(sanitizeProjString(s)).toBe(s);
  });

  it('trims whitespace', () => {
    expect(sanitizeProjString('  +proj=utm +zone=50 +ellps=WGS84 +no_defs  ')).toBe(
      '+proj=utm +zone=50 +ellps=WGS84 +no_defs',
    );
  });
});

describe('utmZoneFromLon', () => {
  it('Sunnyvale CA (lon=-122) → zone 10', () => {
    expect(utmZoneFromLon(-122.013332)).toBe(10);
  });
  it('Beijing (lon=116) → zone 50', () => {
    expect(utmZoneFromLon(116.4)).toBe(50);
  });
  it('Shanghai (lon=121) → zone 51', () => {
    expect(utmZoneFromLon(121.5)).toBe(51);
  });
  it('Greenwich (lon=0) → zone 31', () => {
    expect(utmZoneFromLon(0)).toBe(31);
  });
});

describe('makeProjection (Apollo borregas — UTM 10N)', () => {
  const projString = '+proj=utm +zone=10 +ellps=WGS84 +datum=WGS84 +units=m +no_defs';

  it('round-trips an ENU point through lon/lat', () => {
    const proj = makeProjection(projString);
    const enu = { x: 586392.84003, y: 4140673.01232, z: 0 };
    const ll = proj.toLonLat(enu);
    // Borregas is in Sunnyvale, CA: ~lon=-122, lat=37.41
    expect(ll.x).toBeGreaterThan(-122.5);
    expect(ll.x).toBeLessThan(-121.5);
    expect(ll.y).toBeGreaterThan(37);
    expect(ll.y).toBeLessThan(38);

    const back = proj.fromLonLat(ll);
    expect(back.x).toBeCloseTo(enu.x, 4);
    expect(back.y).toBeCloseTo(enu.y, 4);
  });

  it('preserves z when provided', () => {
    const proj = makeProjection(projString);
    const ll = proj.toLonLat({ x: 586392.84003, y: 4140673.01232, z: 12.5 });
    expect(ll.z).toBe(12.5);
  });
});

describe('makeProjection (sanitizes Apollo demo PROJ string with braces)', () => {
  it('decodes the demo/base_map.txt PROJ string', () => {
    const dirty =
      '+proj=tmerc +lat_0={37.413082} +lon_0={-122.013332} +k={0.9999999996} +ellps=WGS84 +no_defs';
    const proj = makeProjection(dirty);
    // Origin (0,0) in this projection should be near the lat_0/lon_0 anchor.
    const ll = proj.toLonLat({ x: 0, y: 0 });
    expect(ll.x).toBeCloseTo(-122.013332, 3);
    expect(ll.y).toBeCloseTo(37.413082, 3);
  });
});

describe('UTM_PRESETS', () => {
  it('exposes ready-to-use PROJ strings for common Apollo regions', () => {
    expect(UTM_PRESETS.sunnyvale).toContain('+zone=10');
    expect(UTM_PRESETS.beijing).toContain('+zone=50');
    expect(UTM_PRESETS.shanghai).toContain('+zone=51');
  });

  it('Sunnyvale preset round-trips a known borregas ENU point', () => {
    const proj = makeProjection(UTM_PRESETS.sunnyvale);
    const ll = proj.toLonLat({ x: 586392.84003, y: 4140673.01232 });
    expect(ll.x).toBeCloseTo(-122.013, 1);
    expect(ll.y).toBeCloseTo(37.41, 1);
  });

  it('Beijing preset round-trips the user-sample ENU point', () => {
    const proj = makeProjection(UTM_PRESETS.beijing);
    const ll = proj.toLonLat({ x: 423529.538, y: 4438473.0332 });
    expect(ll.x).toBeCloseTo(116.103, 1);
    expect(ll.y).toBeCloseTo(40.093, 1);
  });
});

describe('utmProjString', () => {
  it('builds a valid PROJ string for zone 10N', () => {
    expect(utmProjString(10, 'N')).toContain('+zone=10');
    expect(utmProjString(10, 'N')).not.toContain('+south');
  });
  it('adds +south for southern hemisphere', () => {
    expect(utmProjString(50, 'S')).toContain('+south');
  });
  it('rejects out-of-range zones', () => {
    expect(() => utmProjString(0)).toThrow();
    expect(() => utmProjString(61)).toThrow();
  });
});
