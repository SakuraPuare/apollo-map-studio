import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { decodeMapBin, encodeMapBin } from '../binCodec';
import {
  apolloMapToLonLat,
  apolloMapFromLonLat,
  readHeaderProjString,
  entityCounts,
} from '../adapter';
import { EDITOR_META_VERSION, entityKey, readEditorMeta, writeEditorMeta } from '../editorMeta';
import { UTM_PRESETS } from '../projection';

const APOLLO_BORREGAS_BIN = path.resolve(
  import.meta.dirname,
  '../../__fixtures__/apollo/borregas_ave/base_map.bin',
);

type DecodedLaneMap = {
  lane: Array<{
    id: { id: string };
    central_curve: {
      segment: Array<{ line_segment: { point: Array<{ x: number; y: number }> } }>;
    };
  }>;
};

describe('adapter — apolloMapToLonLat / fromLonLat', () => {
  it.runIf(existsSync(APOLLO_BORREGAS_BIN))(
    'projects every PointENU through the header PROJ string and round-trips',
    async () => {
      const bytes = new Uint8Array(readFileSync(APOLLO_BORREGAS_BIN));
      const map = await decodeMapBin(bytes);
      const projString = readHeaderProjString(map);
      expect(projString).toContain('+proj=utm');
      expect(projString).toContain('+zone=10');

      const { map: lonLatMap, projection } = await apolloMapToLonLat(map, projString!);

      // Sanity: pick the first lane's first central_curve segment's first point and
      // expect lon/lat near Sunnyvale (~-122, 37.4).
      const lane0 = (lonLatMap.lane as Array<Record<string, unknown>>)[0]!;
      const seg0 = (lane0.central_curve as { segment: Array<Record<string, unknown>> }).segment[0]!;
      const pt0 = (seg0.line_segment as { point: Array<{ x: number; y: number }> }).point[0]!;
      expect(pt0.x).toBeGreaterThan(-122.5);
      expect(pt0.x).toBeLessThan(-121.5);
      expect(pt0.y).toBeGreaterThan(37);
      expect(pt0.y).toBeLessThan(38);

      // Round-trip back to ENU and re-encode; lane ids must match.
      const { map: backMap } = await apolloMapFromLonLat(lonLatMap, projection.projString);
      const reBytes = await encodeMapBin(backMap);
      const reDecoded = (await decodeMapBin(reBytes)) as DecodedLaneMap;
      const original = map as DecodedLaneMap;
      expect(reDecoded.lane.map((l) => l.id.id)).toEqual(original.lane.map((l) => l.id.id));

      // Coordinate values must round-trip within a tight tolerance (cm-scale).
      const seg0Back = reDecoded.lane[0]!.central_curve.segment[0]!.line_segment.point[0]!;
      const seg0Original = original.lane[0]!.central_curve.segment[0]!.line_segment.point[0]!;
      expect(seg0Back.x).toBeCloseTo(seg0Original.x, 2);
      expect(seg0Back.y).toBeCloseTo(seg0Original.y, 2);
    },
  );

  it.runIf(existsSync(APOLLO_BORREGAS_BIN))(
    'entityCounts surfaces lane/road/crosswalk counts',
    async () => {
      const bytes = new Uint8Array(readFileSync(APOLLO_BORREGAS_BIN));
      const map = await decodeMapBin(bytes);
      const counts = entityCounts(map);
      expect(counts.lane).toBe(60);
      expect(counts.road).toBe(37);
      expect(counts.crosswalk).toBe(6);
      expect(counts.overlap).toBe(143);
    },
  );

  it('readHeaderProjString returns null when header has no projection', () => {
    expect(readHeaderProjString({})).toBeNull();
    expect(readHeaderProjString({ header: {} })).toBeNull();
    expect(readHeaderProjString({ header: { projection: {} } })).toBeNull();
  });

  it('readHeaderProjString decodes a Uint8Array PROJ string (bytes field)', () => {
    const proj = new TextEncoder().encode('+proj=utm +zone=10 +ellps=WGS84 +no_defs');
    expect(readHeaderProjString({ header: { projection: { proj } } })).toContain('+zone=10');
  });

  it('projects editor_meta geometry_source points through lon/lat and back', async () => {
    const rawMap: Record<string, unknown> = {
      header: {
        projection: { proj: UTM_PRESETS.sunnyvale },
      },
    };
    writeEditorMeta(rawMap, {
      version: EDITOR_META_VERSION,
      entity: {
        [entityKey('lane', 'lane_1')]: {
          geometrySource: {
            drawTool: 'drawBezier',
            anchors: [
              {
                point: { x: -122.025, y: 37.37 },
                handleIn: null,
                handleOut: { x: -122.0249, y: 37.3701 },
              },
              {
                point: { x: -122.024, y: 37.371 },
                handleIn: { x: -122.0242, y: 37.3709 },
                handleOut: null,
              },
            ],
          },
        },
      },
    });

    const { map: enuMap } = await apolloMapFromLonLat(rawMap, UTM_PRESETS.sunnyvale);
    const enuMeta = readEditorMeta(enuMap);
    const enuSource = enuMeta.entity[entityKey('lane', 'lane_1')]?.geometrySource;
    expect(enuSource?.drawTool).toBe('drawBezier');
    if (enuSource?.drawTool === 'drawBezier') {
      expect(enuSource.anchors[0]!.point.x).not.toBeCloseTo(-122.025, 3);
    }

    const { map: lonLatMap } = await apolloMapToLonLat(enuMap, UTM_PRESETS.sunnyvale);
    const lonLatMeta = readEditorMeta(lonLatMap);
    const lonLatSource = lonLatMeta.entity[entityKey('lane', 'lane_1')]?.geometrySource;
    expect(lonLatSource?.drawTool).toBe('drawBezier');
    if (lonLatSource?.drawTool === 'drawBezier') {
      expect(lonLatSource.anchors[0]!.point.x).toBeCloseTo(-122.025, 6);
      expect(lonLatSource.anchors[1]!.handleIn!.y).toBeCloseTo(37.3709, 6);
    }
  });
});
