import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { decodeMapBin } from '../binCodec';
import { apolloMapToLonLat, readHeaderProjString } from '../adapter';
import {
  rawCrosswalkToEntity,
  entityToRawCrosswalk,
  apolloMapToEntities,
  entitiesToApolloMap,
  unwrapId,
  unwrapIdArray,
} from '../entityBridge';
import type { CrosswalkEntity } from '@/types/apollo';

const APOLLO_BIN = path.resolve(
  import.meta.dirname,
  '../../__fixtures__/apollo/borregas_ave/base_map.bin',
);

describe('entityBridge — generic helpers', () => {
  it('unwrapId returns null for missing or malformed input', () => {
    expect(unwrapId(undefined)).toBeNull();
    expect(unwrapId({})).toBeNull();
    expect(unwrapId({ id: 'L1' })).toBe('L1');
  });

  it('unwrapIdArray flattens an Id[] array', () => {
    expect(unwrapIdArray(undefined)).toEqual([]);
    expect(unwrapIdArray([{ id: 'a' }, { id: 'b' }])).toEqual(['a', 'b']);
    expect(unwrapIdArray([{ id: 'a' }, {}, { id: 'b' }])).toEqual(['a', 'b']);
  });
});

describe('entityBridge — Crosswalk round-trip', () => {
  const sampleRaw = {
    id: { id: 'Crosswalk_1' },
    polygon: {
      point: [
        { x: 1, y: 2, z: 0 },
        { x: 3, y: 4, z: 0 },
        { x: 5, y: 6, z: 0 },
      ],
    },
    overlap_id: [{ id: 'ov_1' }, { id: 'ov_2' }],
  };

  it('proto → entity', () => {
    const entity = rawCrosswalkToEntity(sampleRaw);
    expect(entity).not.toBeNull();
    expect(entity!.id).toBe('Crosswalk_1');
    expect(entity!.entityType).toBe('crosswalk');
    expect(entity!.polygon.points).toHaveLength(3);
    expect(entity!.polygon.points[0]).toEqual({ x: 1, y: 2, z: 0 });
    expect(entity!.overlapIds).toEqual(['ov_1', 'ov_2']);
  });

  it('entity → proto', () => {
    const entity: CrosswalkEntity = {
      id: 'Crosswalk_2',
      entityType: 'crosswalk',
      polygon: {
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
        ],
      },
      overlapIds: ['ov_x'],
    };
    const raw = entityToRawCrosswalk(entity);
    expect(raw.id).toEqual({ id: 'Crosswalk_2' });
    expect(raw.polygon!.point).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(raw.overlap_id).toEqual([{ id: 'ov_x' }]);
  });

  it('round-trips raw → entity → raw without loss', () => {
    const entity = rawCrosswalkToEntity(sampleRaw)!;
    const back = entityToRawCrosswalk(entity);
    expect(back).toEqual(sampleRaw);
  });

  it('skips entries with missing id', () => {
    expect(rawCrosswalkToEntity({})).toBeNull();
    expect(rawCrosswalkToEntity({ id: {} })).toBeNull();
  });
});

describe('entityBridge — apolloMapToEntities / entitiesToApolloMap', () => {
  it('extracts every supported entity type from a small map', () => {
    const map = {
      crosswalk: [
        {
          id: { id: 'CW1' },
          polygon: {
            point: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
          },
        },
        {
          id: { id: 'CW2' },
          polygon: {
            point: [
              { x: 2, y: 2 },
              { x: 3, y: 3 },
            ],
          },
        },
      ],
      lane: [{ id: { id: 'L1' } }],
      junction: [{ id: { id: 'J1' }, polygon: { point: [] } }],
    };
    const entities = apolloMapToEntities(map);
    expect(entities).toHaveLength(4);
    const ids = entities.map((e) => `${e.entityType}:${e.id}`).sort();
    expect(ids).toEqual(['crosswalk:CW1', 'crosswalk:CW2', 'junction:J1', 'lane:L1'].sort());
  });

  it('entitiesToApolloMap replaces every bridged array with the editor snapshot', () => {
    const baseMap = {
      header: { version: new TextEncoder().encode('1.0') },
    };
    const entities: CrosswalkEntity[] = [
      {
        id: 'CW_NEW',
        entityType: 'crosswalk',
        polygon: {
          points: [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
        },
        overlapIds: [],
      },
    ];
    const merged = entitiesToApolloMap(baseMap, entities);
    // Header (and any non-bridged top-level field) passes through verbatim.
    expect(merged.header).toBe(baseMap.header);
    // Crosswalk array replaced by editor snapshot.
    expect((merged.crosswalk as Array<{ id: { id: string } }>)[0]!.id.id).toBe('CW_NEW');
    // Empty buckets are also written (so an old `lane` array would be cleared
    // if it was in baseMap and no Lane entities are present in editor).
    expect(merged.lane).toEqual([]);
  });
});

describe('entityBridge — borregas integration (full coverage)', () => {
  it.runIf(existsSync(APOLLO_BIN))(
    'imports every Apollo entity type from borregas with the right counts',
    async () => {
      const bytes = new Uint8Array(readFileSync(APOLLO_BIN));
      const decoded = await decodeMapBin(bytes);
      const projString = readHeaderProjString(decoded);
      const { map: lonLatMap } = await apolloMapToLonLat(decoded, projString!);
      const entities = apolloMapToEntities(lonLatMap as Parameters<typeof apolloMapToEntities>[0]);
      const counts: Record<string, number> = {};
      for (const e of entities) counts[e.entityType] = (counts[e.entityType] ?? 0) + 1;
      // Reference numbers come from borregas_ave/base_map.bin (verified earlier
      // via decodeMapBin direct probe in binRoundtrip tests).
      expect(counts.lane).toBe(60);
      expect(counts.road).toBe(37);
      expect(counts.crosswalk).toBe(6);
      expect(counts.junction).toBe(2);
      expect(counts.signal).toBe(15);
      expect(counts.stopSign).toBe(2);
      expect(counts.overlap).toBe(143);
    },
  );

  it.runIf(existsSync(APOLLO_BIN))(
    'borregas raw → entities → raw → re-encode bytes preserves lane/road/overlap ids',
    async () => {
      const { encodeMapBin } = await import('../binCodec');
      const { apolloMapFromLonLat } = await import('../adapter');

      const bytes = new Uint8Array(readFileSync(APOLLO_BIN));
      const decoded = await decodeMapBin(bytes);
      const projString = readHeaderProjString(decoded)!;
      const { map: lonLatMap } = await apolloMapToLonLat(decoded, projString);

      const entities = apolloMapToEntities(lonLatMap as Parameters<typeof apolloMapToEntities>[0]);
      const merged = entitiesToApolloMap(lonLatMap, entities);
      const { map: enuBack } = await apolloMapFromLonLat(merged, projString);
      const reBytes = await encodeMapBin(enuBack);
      const reDecoded = (await decodeMapBin(reBytes)) as {
        lane: Array<{ id: { id: string } }>;
        road: Array<{ id: { id: string } }>;
        overlap: Array<{ id: { id: string } }>;
      };
      const original = decoded as {
        lane: Array<{ id: { id: string } }>;
        road: Array<{ id: { id: string } }>;
        overlap: Array<{ id: { id: string } }>;
      };
      expect(reDecoded.lane.map((l) => l.id.id).sort()).toEqual(
        original.lane.map((l) => l.id.id).sort(),
      );
      expect(reDecoded.road.map((l) => l.id.id).sort()).toEqual(
        original.road.map((l) => l.id.id).sort(),
      );
      expect(reDecoded.overlap.map((l) => l.id.id).sort()).toEqual(
        original.overlap.map((l) => l.id.id).sort(),
      );
    },
  );

  it.runIf(existsSync(APOLLO_BIN))(
    'imports all 6 borregas crosswalks as CrosswalkEntity records',
    async () => {
      const bytes = new Uint8Array(readFileSync(APOLLO_BIN));
      const decoded = await decodeMapBin(bytes);
      const projString = readHeaderProjString(decoded);
      const { map: lonLatMap } = await apolloMapToLonLat(decoded, projString!);
      const entities = apolloMapToEntities(lonLatMap as Parameters<typeof apolloMapToEntities>[0]);
      const crosswalks = entities.filter((e) => e.entityType === 'crosswalk');
      expect(crosswalks).toHaveLength(6);
      // Each borregas crosswalk has overlap_id references
      for (const cw of crosswalks as CrosswalkEntity[]) {
        expect(cw.id).toBeTruthy();
        expect(cw.overlapIds.length).toBeGreaterThan(0);
        expect(cw.polygon.points.length).toBeGreaterThanOrEqual(3);
        // Coordinates are lon/lat (Sunnyvale)
        expect(cw.polygon.points[0]!.x).toBeGreaterThan(-122.5);
        expect(cw.polygon.points[0]!.x).toBeLessThan(-121.5);
        expect(cw.polygon.points[0]!.y).toBeGreaterThan(37);
        expect(cw.polygon.points[0]!.y).toBeLessThan(38);
      }
    },
  );

  it.runIf(existsSync(APOLLO_BIN))(
    'round-trips edited crosswalks back into the raw map',
    async () => {
      const bytes = new Uint8Array(readFileSync(APOLLO_BIN));
      const decoded = await decodeMapBin(bytes);
      const projString = readHeaderProjString(decoded);
      const { map: lonLatMap } = await apolloMapToLonLat(decoded, projString!);
      const entities = apolloMapToEntities(lonLatMap as Parameters<typeof apolloMapToEntities>[0]);

      // Edit one crosswalk: change its first point's longitude
      const cw0 = entities[0] as CrosswalkEntity;
      const originalLon = cw0.polygon.points[0]!.x;
      cw0.polygon.points[0]!.x = originalLon + 0.001;

      const merged = entitiesToApolloMap(lonLatMap, entities);
      const editedCw = (
        merged.crosswalk as Array<{ id: { id: string }; polygon: { point: Array<{ x: number }> } }>
      )[0]!;
      expect(editedCw.id.id).toBe(cw0.id);
      expect(editedCw.polygon.point[0]!.x).toBeCloseTo(originalLon + 0.001, 6);
    },
  );
});
