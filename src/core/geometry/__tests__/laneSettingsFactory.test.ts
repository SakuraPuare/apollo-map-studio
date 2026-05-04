import { describe, expect, it } from 'vitest';
import { createApolloEntity } from '../apolloCompile';
import type { LngLat } from '../interpolate';
import type { LaneEntity } from '@/types/apollo';

const points: LngLat[] = [
  [116.4, 39.9],
  [116.401, 39.9],
];

describe('lane factory settings', () => {
  it('uses configurable lane creation defaults', () => {
    const lane = createApolloEntity('lane', 'drawPolyline', points, [], {
      laneHalfWidth: 2.5,
      laneSpeedLimit: 12,
      laneBoundaryType: 'CURB',
    }) as LaneEntity;

    expect(lane.leftSamples[0]?.width).toBe(2.5);
    expect(lane.rightSamples[0]?.width).toBe(2.5);
    expect(lane.speedLimit).toBe(12);
    expect(lane.leftBoundary.boundaryType[0]?.types).toEqual(['CURB']);
    expect(lane.rightBoundary.boundaryType[0]?.types).toEqual(['CURB']);
  });
});
