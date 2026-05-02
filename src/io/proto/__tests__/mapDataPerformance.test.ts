import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeMapBin } from '../binCodec';
import { apolloMapToLonLat, readHeaderProjString } from '../adapter';
import { apolloMapToEntities } from '../entityBridge';
import { reconcileLaneTopology } from '@/core/geometry/laneTopology';
import { reconcileLaneTopologyIncremental } from '@/core/geometry/laneTopology';
import { reconcileOverlaps } from '@/core/elements/overlap';
import { UTM_PRESETS } from '../projection';
import { resolveMapBin } from './mapDataPaths';
import type { MapEntity } from '@/types/entities';

const SAMPLE = process.env.APOLLO_MAP_PERF_SAMPLE ?? 'sunnyvale';
const BIN = resolveMapBin(SAMPLE);
const TOPOLOGY_BUDGET_MS = Number(process.env.APOLLO_MAP_TOPOLOGY_BUDGET_MS ?? 5_000);

describe.skipIf(!existsSync(BIN))('map_data performance regression guard', () => {
  it(
    `keeps ${SAMPLE} topology reconcile within worker-grade budget`,
    { timeout: 10 * 60_000 },
    async () => {
      const marks: Array<[string, number]> = [];
      const mark = (label: string, start: number) => {
        marks.push([label, performance.now() - start]);
      };

      let t = performance.now();
      const bytes = new Uint8Array(readFileSync(BIN));
      mark('read bytes', t);

      t = performance.now();
      const decoded = await decodeMapBin(bytes);
      mark('decodeMapBin', t);

      t = performance.now();
      const proj = readHeaderProjString(decoded) ?? UTM_PRESETS.sunnyvale;
      const { map } = await apolloMapToLonLat(decoded, proj);
      mark('apolloMapToLonLat', t);

      t = performance.now();
      const entities = apolloMapToEntities(map as Parameters<typeof apolloMapToEntities>[0]);
      mark('apolloMapToEntities', t);

      t = performance.now();
      structuredClone(entities);
      mark('structuredClone entities', t);

      t = performance.now();
      const entityMap = new Map<string, MapEntity>();
      for (const e of entities) entityMap.set(e.id, e);
      mark('make entity Map', t);

      t = performance.now();
      const topo = reconcileLaneTopology(entityMap);
      mark('reconcileLaneTopology', t);

      for (const [id, e] of topo.changes) entityMap.set(id, e);

      const firstLane = entities.find((e) => e.entityType === 'lane');
      if (firstLane) {
        t = performance.now();
        reconcileLaneTopologyIncremental(entityMap, {
          dirtyIds: new Set([firstLane.id]),
          previousEntities: new Map([[firstLane.id, firstLane]]),
        });
        mark('reconcileLaneTopology incremental', t);
      }

      t = performance.now();
      const overlap = reconcileOverlaps(entityMap, { mode: 'full' });
      mark('reconcileOverlaps full', t);

      console.table(
        marks.map(([stage, ms]) => ({
          stage,
          ms: Math.round(ms),
        })),
      );
      console.log('entities', entities.length, 'topoChanges', topo.changes.size, overlap.stats);

      const topologyMs =
        marks.find(([stage]) => stage === 'reconcileLaneTopology')?.[1] ?? Infinity;
      expect(topologyMs).toBeLessThan(TOPOLOGY_BUDGET_MS);
    },
  );
});
