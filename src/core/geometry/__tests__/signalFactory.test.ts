/**
 * Regression test: a freshly drawn signal must ship with Apollo-valid
 * boundary + subsignals so `signals_xml_parser.cc` accepts the round-tripped
 * .bin. Previously `createSignal` left both empty, which would cause Apollo
 * planning to reject the map with HDMAP_DATA_ERROR.
 */
import { describe, it, expect } from 'vitest';
import { createApolloEntity } from '../apolloCompile';
import type { LngLat } from '../interpolate';
import type { SignalEntity } from '@/types/apollo';

describe('createSignal factory: Apollo-valid boundary + subsignals', () => {
  // A short stop line, drawn east-west across an intersection.
  const stopLine: LngLat[] = [
    [116.407, 39.9042],
    [116.4078, 39.9042],
  ];

  it('produces a 4-point boundary, ≥3 subsignals (MIX_3_VERTICAL), and preserves the user-drawn stop line', () => {
    const entity = createApolloEntity('signal', 'drawPolyline', stopLine, []) as SignalEntity;

    // 1) Apollo requires exactly a 4-point boundary outlining the signal box.
    expect(entity.entityType).toBe('signal');
    expect(entity.boundary.points).toHaveLength(4);

    // 2) Default type MIX_3_VERTICAL → 3 bulbs, all with populated 3D location.
    expect(entity.type).toBe('MIX_3_VERTICAL');
    expect(entity.subsignals.length).toBeGreaterThanOrEqual(3);
    for (const sub of entity.subsignals) {
      expect(sub.location).toBeDefined();
      expect(typeof sub.location!.x).toBe('number');
      expect(typeof sub.location!.y).toBe('number');
      expect(typeof sub.location!.z).toBe('number');
      expect(sub.location!.z).toBeGreaterThan(0);
    }

    // 3) The user's drawn stop line must still be intact (no regression).
    expect(entity.stopLines).toHaveLength(1);
    const drawnPts = entity.stopLines[0]!.segments[0]!.lineSegment.points;
    expect(drawnPts.length).toBeGreaterThanOrEqual(2);
    expect(drawnPts[0]!.x).toBeCloseTo(stopLine[0]![0], 9);
    expect(drawnPts[0]!.y).toBeCloseTo(stopLine[0]![1], 9);
    expect(drawnPts[drawnPts.length - 1]!.x).toBeCloseTo(stopLine[1]![0], 9);
    expect(drawnPts[drawnPts.length - 1]!.y).toBeCloseTo(stopLine[1]![1], 9);
  });
});
