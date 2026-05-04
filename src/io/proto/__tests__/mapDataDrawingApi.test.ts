import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createMapEditingSession } from '@/core/mapEditingApi';
import { APOLLO_MAP_ENTITY_FIELDS, type ApolloMapEntityField } from '../entityBridge';
import { decodeMapBin } from '../binCodec';
import { MAP_DATA_ROOT } from './mapDataPaths';

const BORREGAS_FIXTURE = path.resolve(
  import.meta.dirname,
  '../../__fixtures__/apollo/borregas_ave/base_map.bin',
);

interface MapSample {
  name: string;
  binPath: string;
}

function discoverMapDataSamples(): MapSample[] {
  const samples: MapSample[] = [];
  if (!existsSync(MAP_DATA_ROOT)) return samples;

  const visit = (dir: string, depth: number) => {
    if (depth > 3) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    if (entries.includes('base_map.bin')) {
      samples.push({
        name: path.relative(MAP_DATA_ROOT, dir) || path.basename(dir),
        binPath: path.join(dir, 'base_map.bin'),
      });
    }

    for (const entry of entries) {
      const child = path.join(dir, entry);
      try {
        if (statSync(child).isDirectory()) visit(child, depth + 1);
      } catch {
        // Ignore broken symlinks and unreadable folders in local corpora.
      }
    }
  };

  visit(MAP_DATA_ROOT, 0);

  const seen = new Set<string>();
  return samples.filter((sample) => {
    let stat;
    try {
      stat = statSync(sample.binPath);
    } catch {
      return false;
    }
    const key = `${path.basename(path.dirname(sample.binPath))}:${stat.size}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function decodeSample(sample: MapSample): Promise<Record<string, unknown>> {
  return (await decodeMapBin(new Uint8Array(readFileSync(sample.binPath)))) as Record<
    string,
    unknown
  >;
}

function rawItems(map: Record<string, unknown>, field: ApolloMapEntityField): unknown[] {
  const value = map[field];
  return Array.isArray(value) ? value : [];
}

function rebuildWithDrawingApi(map: Record<string, unknown>) {
  const session = createMapEditingSession();
  const counts = new Map<ApolloMapEntityField, number>();

  for (const field of APOLLO_MAP_ENTITY_FIELDS) {
    const items = rawItems(map, field);
    counts.set(field, items.length);
    for (const raw of items) {
      const entity = session.addApolloRawElement(field, raw);
      expect(entity, `${field} raw element should convert to a drawable entity`).not.toBeNull();
    }
  }

  return { exported: session.exportApolloMap(map), counts, entityCount: session.entities.size };
}

function expectExportedBucketsToMatch(
  original: Record<string, unknown>,
  exported: Record<string, unknown>,
) {
  for (const field of APOLLO_MAP_ENTITY_FIELDS) {
    expect(exported[field], `${field} bucket should round-trip through drawing API`).toEqual(
      rawItems(original, field),
    );
  }
}

describe('map drawing API fidelity', () => {
  it.runIf(existsSync(BORREGAS_FIXTURE))(
    'rebuilds the checked-in borregas fixture by adding every map element through the API',
    async () => {
      const original = await decodeSample({
        name: 'borregas_ave fixture',
        binPath: BORREGAS_FIXTURE,
      });

      const { exported, counts, entityCount } = rebuildWithDrawingApi(original);

      expect(counts.get('lane')).toBe(60);
      expect(counts.get('road')).toBe(37);
      expect(counts.get('crosswalk')).toBe(6);
      expect(counts.get('overlap')).toBe(143);
      expect(entityCount).toBe(Array.from(counts.values()).reduce((sum, count) => sum + count, 0));
      expectExportedBucketsToMatch(original, exported);
    },
  );

  describe.skipIf(!existsSync(MAP_DATA_ROOT))('map_data corpus', () => {
    const samples = discoverMapDataSamples();

    it('discovers at least one map_data/base_map.bin sample', () => {
      expect(samples.length).toBeGreaterThan(0);
    });

    it.each(samples)(
      'rebuilds $name by adding every map element through the API',
      { timeout: 10 * 60_000 },
      async (sample) => {
        const original = await decodeSample(sample);
        const { exported, counts, entityCount } = rebuildWithDrawingApi(original);

        expect(entityCount).toBe(
          Array.from(counts.values()).reduce((sum, count) => sum + count, 0),
        );
        expectExportedBucketsToMatch(original, exported);
      },
    );
  });
});
