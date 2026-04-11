/**
 * Benchmark for `applyLaneJunctions` — the lane junction stitching + boundary
 * decoration pass that runs on every worker SYNC/INCREMENTAL message.
 *
 * Two scenarios:
 *  1. Full rebuild (decorateOnly=null): the SYNC path. Cost is dominated by
 *     boundary decoration — ~3ms per lane locally. Total = O(L).
 *  2. Incremental (decorateOnly={…}): the INCREMENTAL path. Should scale with
 *     |affected| (typically 1–4 for a single edit) instead of L.
 *
 * The 100-lane chain approximates a small HD-map road segment. The isolated
 * 50-junction set approximates a junction-heavy intersection cluster.
 */
import { bench, describe } from 'vitest';
import { createApolloEntity, compileApolloFeatures } from '@/core/geometry/apolloCompile';
import { applyLaneJunctions } from '@/core/geometry/laneJunctions';
import type { LaneEntity } from '@/types/apollo';
import type { LngLat } from '@/core/geometry/interpolate';

const LAT = 30;
const DEG_TO_M = 111320;
const cosLat = Math.cos((LAT * Math.PI) / 180);
const mPerLng = cosLat * DEG_TO_M;
const mPerLat = DEG_TO_M;

function makeLane(id: string, coords: LngLat[]): LaneEntity {
  const lane = createApolloEntity('lane', 'drawPolyline', coords, [], {
    laneHalfWidth: 3.5,
  }) as LaneEntity;
  return { ...lane, id };
}

function buildLinearChain(count: number): LaneEntity[] {
  // count lanes connected end-to-end into a single chain along an east-west axis.
  const lanes: LaneEntity[] = [];
  for (let i = 0; i < count; i++) {
    const xStart = 116 + (i * 100) / mPerLng;
    const xEnd = 116 + ((i + 1) * 100) / mPerLng;
    lanes.push(
      makeLane(`lane_${i}`, [
        [xStart, LAT],
        [xEnd, LAT],
      ]),
    );
  }
  return lanes;
}

function buildIsolatedJunctions(count: number): LaneEntity[] {
  // count/2 isolated 2-lane junctions, each forming a 90° turn.
  const lanes: LaneEntity[] = [];
  for (let i = 0; i < count; i += 2) {
    const cx = 116 + i * 0.005;
    const junction: LngLat = [cx, LAT];
    lanes.push(makeLane(`lane_${i}_a`, [[cx - 100 / mPerLng, LAT], junction]));
    lanes.push(makeLane(`lane_${i}_b`, [junction, [cx, LAT - 100 / mPerLat]]));
  }
  return lanes;
}

function compileAll(lanes: LaneEntity[]): GeoJSON.Feature[] {
  return lanes.flatMap((lane) => compileApolloFeatures(lane));
}

describe('applyLaneJunctions — full rebuild (SYNC path)', () => {
  const chain10 = buildLinearChain(10);
  const chain10Features = compileAll(chain10);
  const chain100 = buildLinearChain(100);
  const chain100Features = compileAll(chain100);
  const isolated100 = buildIsolatedJunctions(100);
  const isolated100Features = compileAll(isolated100);

  bench('full stitch — 10-lane linear chain', () => {
    applyLaneJunctions(chain10Features, chain10);
  });

  bench('full stitch — 100-lane linear chain', () => {
    applyLaneJunctions(chain100Features, chain100);
  });

  bench('full stitch — 100 lanes / 50 isolated junctions', () => {
    applyLaneJunctions(isolated100Features, isolated100);
  });
});

describe('applyLaneJunctions — incremental (INCREMENTAL path)', () => {
  const chain100 = buildLinearChain(100);
  const chain100Features = compileAll(chain100);
  const single = new Set(['lane_50']);
  const triple = new Set(['lane_49', 'lane_50', 'lane_51']);

  bench('incremental — 100-lane chain, 1 lane decorated', () => {
    applyLaneJunctions(chain100Features, chain100, null, single);
  });

  bench('incremental — 100-lane chain, 3 lanes decorated', () => {
    applyLaneJunctions(chain100Features, chain100, null, triple);
  });
});
