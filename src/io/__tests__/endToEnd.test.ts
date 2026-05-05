import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { decodeMapBin, encodeMapBin } from '../proto/binCodec';
import { encodeMapText, decodeMapText } from '../proto/textCodec';
import { computeApolloMapBounds } from '../proto/apolloGeoJson';
import { createBlankApolloMap, setApolloMapBounds } from '../proto/blankApolloMap';
import { entitiesToApolloMap } from '../proto/entityBridge';
import { UTM_PRESETS } from '../proto/projection';
import {
  apolloMapToLonLat,
  apolloMapFromLonLat,
  readHeaderProjString,
  entityCounts,
} from '../proto/adapter';
import type { CrosswalkEntity } from '@/types/entities';

const APOLLO_BIN = path.resolve(
  import.meta.dirname,
  '../__fixtures__/apollo/borregas_ave/base_map.bin',
);

// Mirrors what `pickAndImportApollo` + `exportApolloBin`/`exportApolloText` do, minus DOM file IO,
// so we can exercise the full pipeline end-to-end in a pure-Node test.
async function runFullRoundTrip(bytes: Uint8Array, format: 'bin' | 'txt') {
  const decoded = await decodeMapBin(bytes);
  const projString = readHeaderProjString(decoded);
  expect(projString).toBeTruthy();
  const { map: lonLatMap, projString: usedProj } = await apolloMapToLonLat(decoded, projString!);
  const counts = entityCounts(lonLatMap);

  // ─── (Editor would normally mutate lonLatMap here) ───

  // Export pipeline
  const { map: enuBack } = await apolloMapFromLonLat(lonLatMap, usedProj);
  if (format === 'bin') {
    const out = await encodeMapBin(enuBack);
    return { counts, output: out, decoded };
  } else {
    const out = await encodeMapText(enuBack);
    return { counts, output: out, decoded };
  }
}

describe('end-to-end Apollo map IO pipeline', () => {
  it('exports a new drawn map without an imported raw cache', async () => {
    const crosswalk: CrosswalkEntity = {
      id: 'cw_drawn_1',
      entityType: 'crosswalk',
      polygon: {
        points: [
          { x: -122.025, y: 37.37 },
          { x: -122.024, y: 37.37 },
          { x: -122.024, y: 37.371 },
          { x: -122.025, y: 37.371 },
        ],
      },
      overlapIds: [],
    };

    const merged = entitiesToApolloMap(createBlankApolloMap(UTM_PRESETS.sunnyvale), [crosswalk]);
    const { map: enuMap } = await apolloMapFromLonLat(merged, UTM_PRESETS.sunnyvale);
    const bounds = computeApolloMapBounds(enuMap as Parameters<typeof computeApolloMapBounds>[0]);
    setApolloMapBounds(merged, bounds);
    setApolloMapBounds(enuMap, bounds);

    const output = await encodeMapBin(enuMap);
    const decoded = (await decodeMapBin(output)) as {
      header: {
        projection: { proj: string };
        left: number;
        right: number;
        top: number;
        bottom: number;
      };
      crosswalk: Array<{ id: { id: string } }>;
    };

    expect(decoded.header.projection.proj).toBe(UTM_PRESETS.sunnyvale);
    expect(Number.isFinite(decoded.header.left)).toBe(true);
    expect(Number.isFinite(decoded.header.right)).toBe(true);
    expect(Number.isFinite(decoded.header.top)).toBe(true);
    expect(Number.isFinite(decoded.header.bottom)).toBe(true);
    expect(decoded.crosswalk.map((item) => item.id.id)).toEqual(['cw_drawn_1']);
  });

  it.runIf(existsSync(APOLLO_BIN))(
    'borregas .bin import → lon/lat → UTM → re-encode preserves all entities',
    async () => {
      const original = new Uint8Array(readFileSync(APOLLO_BIN));
      const { counts, output, decoded } = (await runFullRoundTrip(original, 'bin')) as {
        counts: Record<string, number>;
        output: Uint8Array;
        decoded: { lane: Array<{ id: { id: string } }> };
      };

      // Sanity: counts surfaced for the StatusBar are correct
      expect(counts.lane).toBe(60);
      expect(counts.road).toBe(37);
      expect(counts.crosswalk).toBe(6);
      expect(counts.overlap).toBe(143);

      // The re-encoded bytes must decode to a structurally-equivalent map
      const reDecoded = (await decodeMapBin(output)) as {
        lane: Array<{ id: { id: string } }>;
      };
      expect(reDecoded.lane.length).toBe(decoded.lane.length);
      expect(reDecoded.lane.map((l) => l.id.id)).toEqual(decoded.lane.map((l) => l.id.id));
    },
  );

  it.runIf(existsSync(APOLLO_BIN))(
    'borregas .bin import → re-encoded as Apollo .txt → can be parsed back',
    async () => {
      const original = new Uint8Array(readFileSync(APOLLO_BIN));
      const { output } = (await runFullRoundTrip(original, 'txt')) as {
        output: string;
      };
      // .txt output must be valid Google text format that we can parse.
      const reParsed = (await decodeMapText(output)) as {
        lane: Array<{ id: { id: string } }>;
        header: { version: Uint8Array };
      };
      expect(reParsed.lane.length).toBe(60);
      expect(reParsed.header).toBeDefined();
      // Output must look like Apollo text format.
      expect(output.slice(0, 200)).toContain('header {');
      expect(output).toMatch(/\nlane\s*\{/);
      expect(output).toMatch(/\nroad\s*\{/);
    },
  );
});
