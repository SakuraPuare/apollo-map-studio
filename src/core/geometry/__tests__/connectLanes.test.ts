/**
 * Tests for `planConnection` + `applyLaneConnection`.
 *
 * Fixtures use round meters → close-to-round lng/lat at the equator
 * (cosLat = 1) for simple distance arithmetic.
 */
import { describe, it, expect } from 'vitest';
import { planConnection } from '../connectLanes';
import type { LaneEntity } from '@/types/apollo';

function laneAt(id: string, start: [number, number], end: [number, number]): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: {
      segments: [
        {
          lineSegment: {
            points: [
              { x: start[0], y: start[1] },
              { x: end[0], y: end[1] },
            ],
          },
          s: 0,
          startPosition: { x: start[0], y: start[1] },
          heading: 0,
          length: 0,
        },
      ],
    },
    leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    length: 0,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 0,
    predecessorIds: [],
    successorIds: [],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId: null,
    overlapIds: [],
    leftSamples: [{ s: 0, width: 1.75 }],
    rightSamples: [{ s: 0, width: 1.75 }],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

describe('planConnection', () => {
  it('A.end → B.start when A points toward B (continuous A→B)', () => {
    const a = laneAt('a', [0, 0], [0.001, 0]); // east
    const b = laneAt('b', [0.001, 0.0001], [0.002, 0.0001]); // east, north of A.end
    const plan = planConnection(a, b);
    expect(plan!.mode).toBe('AendToBstart');
    expect(plan!.isContinuous).toBe(true);
  });

  it('A.start → B.end when B feeds into A (continuous B→A)', () => {
    const a = laneAt('a', [0.001, 0], [0.002, 0]);
    const b = laneAt('b', [0, 0.0001], [0.001, 0.0001]); // ends near A.start
    const plan = planConnection(a, b);
    expect(plan!.mode).toBe('AstartToBend');
    expect(plan!.isContinuous).toBe(true);
  });

  it('flags fork (A.start ↔ B.start) as non-continuous', () => {
    const a = laneAt('a', [0, 0], [0.001, 0]);
    const b = laneAt('b', [0.0001, 0.0001], [-0.001, 0.0001]); // both start near (0,0)
    const plan = planConnection(a, b);
    expect(plan!.mode).toBe('AstartToBstart');
    expect(plan!.isContinuous).toBe(false);
  });

  it('flags merge (A.end ↔ B.end) as non-continuous', () => {
    const a = laneAt('a', [0, 0], [0.001, 0]);
    const b = laneAt('b', [0.002, 0.0001], [0.001, 0.0001]); // both end near (0.001, 0)
    const plan = planConnection(a, b);
    expect(plan!.mode).toBe('AendToBend');
    expect(plan!.isContinuous).toBe(false);
  });

  it('reports distance in meters (≈ 11m for 0.0001° at equator)', () => {
    const a = laneAt('a', [0, 0], [0.001, 0]);
    const b = laneAt('b', [0.001, 0.0001], [0.002, 0.0001]);
    const plan = planConnection(a, b);
    // 0.0001° lat ≈ 11.13m
    expect(plan!.distanceMeters).toBeCloseTo(11.13, 1);
  });
});

describe('planConnection — indexToMove / target details', () => {
  // The plan tells the caller WHICH endpoint of A to move and WHERE.
  // Applying the move is delegated to `applyDrag` so curve sources
  // (bezier anchors / arc tri-points) are kept in sync — verifying the
  // index/target alone is enough at this layer.

  it('AendToBstart picks A.last + B.start as target', () => {
    const a = laneAt('a', [0, 0], [0.001, 0]);
    const b = laneAt('b', [0.0011, 0.00005], [0.002, 0]);
    const plan = planConnection(a, b)!;
    expect(plan.mode).toBe('AendToBstart');
    expect(plan.indexToMove).toBe(1); // last point in 2-point polyline
    expect(plan.target.x).toBe(0.0011);
    expect(plan.target.y).toBe(0.00005);
  });

  it('AstartToBend picks A.0 + B.end as target', () => {
    const a = laneAt('a', [0.001, 0], [0.002, 0]);
    const b = laneAt('b', [0, 0], [0.0009, 0.00005]);
    const plan = planConnection(a, b)!;
    expect(plan.mode).toBe('AstartToBend');
    expect(plan.indexToMove).toBe(0);
    expect(plan.target.x).toBe(0.0009);
    expect(plan.target.y).toBe(0.00005);
  });
});
