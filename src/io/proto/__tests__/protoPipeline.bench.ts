import { bench, describe } from 'vitest';
import { apolloMapFromLonLat, apolloMapToLonLat } from '../adapter';
import { computeApolloMapBounds } from '../apolloGeoJson';
import { decodeMapBin, encodeMapBin } from '../binCodec';
import { apolloMapToEntities, entitiesToApolloMap, type RawApolloMap } from '../entityBridge';
import { decodeMapText, encodeMapText } from '../textCodec';
import { utmProjString } from '../projection';
import type { RawLane } from '../entityBridge/laneRoad';

const PROJ = utmProjString(50, 'N');

function point(x: number, y: number) {
  return { x, y };
}

function rawLane(id: string, index: number, pointCount: number): RawLane {
  const row = Math.floor(index / 250);
  const col = index % 250;
  const x0 = 440_000 + col * 35;
  const y0 = 4_420_000 + row * 14;
  const points = Array.from({ length: pointCount }, (_, i) =>
    point(x0 + i * 12, y0 + Math.sin((index + i) * 0.17) * 0.35),
  );
  const curve = {
    segment: [
      {
        s: 0,
        start_position: points[0],
        heading: 0,
        length: Math.max(0, pointCount - 1) * 12,
        line_segment: { point: points },
      },
    ],
  };
  return {
    id: { id },
    central_curve: curve,
    left_boundary: { curve, length: 0, boundary_type: [] },
    right_boundary: { curve, length: 0, boundary_type: [] },
    length: Math.max(0, pointCount - 1) * 12,
    speed_limit: 13.89,
    type: 2,
    turn: 1,
    direction: 1,
    overlap_id: [],
    predecessor_id: [],
    successor_id: [],
    left_neighbor_forward_lane_id: [],
    right_neighbor_forward_lane_id: [],
    left_neighbor_reverse_lane_id: [],
    right_neighbor_reverse_lane_id: [],
    self_reverse_lane_id: [],
    left_sample: [],
    right_sample: [],
    left_road_sample: [],
    right_road_sample: [],
  };
}

function rawCrosswalk(id: string, index: number) {
  const cx = 440_000 + (index % 100) * 70;
  const cy = 4_420_000 + Math.floor(index / 100) * 28;
  return {
    id: { id },
    polygon: {
      point: [
        point(cx - 5, cy - 5),
        point(cx + 5, cy - 5),
        point(cx + 5, cy + 5),
        point(cx - 5, cy + 5),
      ],
    },
    overlap_id: [],
  };
}

function rawMap(laneCount: number, pointCount: number): RawApolloMap & Record<string, unknown> {
  return {
    header: {
      version: new Uint8Array([49]),
      projection: { proj: PROJ },
    },
    lane: Array.from({ length: laneCount }, (_, i) => rawLane(`lane_${i}`, i, pointCount)),
    crosswalk: Array.from({ length: Math.max(1, Math.floor(laneCount / 25)) }, (_, i) =>
      rawCrosswalk(`crosswalk_${i}`, i),
    ),
    junction: [],
    stop_sign: [],
    signal: [],
    yield: [],
    overlap: [],
    clear_area: [],
    speed_bump: [],
    road: [],
    parking_space: [],
    pnc_junction: [],
    rsu: [],
    ad_area: [],
    barrier_gate: [],
  };
}

describe('proto entity bridge and projection', () => {
  for (const scale of [
    { label: '1k', count: 1_000 },
    { label: '5k', count: 5_000 },
  ]) {
    const map = rawMap(scale.count, 8);
    const entities = apolloMapToEntities(map);

    bench(`proto bridge ${scale.label} — apolloMapToEntities`, () => {
      apolloMapToEntities(map);
    });

    bench(`proto bridge ${scale.label} — entitiesToApolloMap`, () => {
      entitiesToApolloMap(map, entities);
    });

    bench(`proto bounds ${scale.label} — computeApolloMapBounds`, () => {
      computeApolloMapBounds(map as Parameters<typeof computeApolloMapBounds>[0]);
    });

    bench(`proto projection ${scale.label} — to lonlat`, async () => {
      await apolloMapToLonLat(map, PROJ);
    });

    bench(`proto projection ${scale.label} — from lonlat`, async () => {
      await apolloMapFromLonLat(map, PROJ);
    });
  }
});

describe('proto codecs', async () => {
  const map = rawMap(1_000, 8);
  const bytes = await encodeMapBin(map);
  const textMap = rawMap(100, 8);
  const text = await encodeMapText(textMap);
  const roundtripEntities = apolloMapToEntities(map);

  bench(`proto bin 1k lanes — encode`, async () => {
    await encodeMapBin(map);
  });

  bench(`proto bin 1k lanes — decode`, async () => {
    await decodeMapBin(bytes);
  });

  bench(`proto text 100 lanes — encode`, async () => {
    await encodeMapText(textMap);
  });

  bench(`proto text 100 lanes — decode`, async () => {
    await decodeMapText(text);
  });

  bench(`proto roundtrip 1k lanes — bridge project encode`, async () => {
    const merged = entitiesToApolloMap(map, roundtripEntities);
    const { map: projected } = await apolloMapFromLonLat(merged, PROJ);
    await encodeMapBin(projected);
  });
});
