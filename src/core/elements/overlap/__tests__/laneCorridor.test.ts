/**
 * Tests for laneCorridorPolygon.
 *
 * 覆盖：基本走廊形状 / 默认宽度 / 退化输入 / 走廊闭合性.
 */
import { describe, it, expect } from 'vitest';
import { laneCorridorPolygon } from '../laneCorridor';
import { pointsToCurve } from '@/core/geometry/apolloCompile';
import type { LaneEntity } from '@/types/apollo';

function makeLane(points: { x: number; y: number }[]): LaneEntity {
  return {
    id: 'L',
    entityType: 'lane',
    centralCurve: {
      segments: [
        {
          s: 0,
          startPosition: points[0]!,
          heading: 0,
          length: 0,
          lineSegment: { points },
        },
      ],
    },
    leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    length: 0,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 13.89,
    predecessorIds: [],
    successorIds: [],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId: null,
    overlapIds: [],
    leftSamples: [{ s: 0, width: 1.5 }],
    rightSamples: [{ s: 0, width: 1.5 }],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

describe('laneCorridorPolygon', () => {
  it('returns empty when centerline has fewer than 2 points', () => {
    const lane = makeLane([{ x: 0, y: 0 }]);
    expect(laneCorridorPolygon(lane)).toEqual([]);
  });

  it('builds a closed ring with at least 4 unique points for a 2-point centerline', () => {
    const lane = makeLane([
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    const ring = laneCorridorPolygon(lane);
    // 2-pt centerline → 2 left + 2 right reversed + 1 close = 5 points
    expect(ring.length).toBe(5);
    // closed: first === last
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // 4 unique corners (no duplicates among first 4)
    const unique = new Set(ring.slice(0, 4).map((p) => `${p.x},${p.y}`));
    expect(unique.size).toBe(4);
  });

  it('uses DEFAULT_LANE_HALF_WIDTH when no samples provided', () => {
    const lane = makeLane([
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    lane.leftSamples = [];
    lane.rightSamples = [];
    const ring = laneCorridorPolygon(lane);
    expect(ring.length).toBeGreaterThan(0);
  });

  it('returns empty when widths are non-positive', () => {
    const lane = makeLane([
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    lane.leftSamples = [{ s: 0, width: 0 }];
    expect(laneCorridorPolygon(lane)).toEqual([]);
  });

  it('the corridor straddles the centerline (left points above, right below for east-bound lane)', () => {
    // East-bound lane at y=39.9. Left = north (higher y), right = south.
    const lane = makeLane([
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    const ring = laneCorridorPolygon(lane);
    // first half (left edge) all above centerline, second half (right edge) all below
    // ring length = 5 = leftLen(2) + rightLen(2) + close(1)
    const leftEdge = ring.slice(0, 2);
    const rightEdgeReversed = ring.slice(2, 4);
    expect(leftEdge.every((p) => p.y > 39.9)).toBe(true);
    expect(rightEdgeReversed.every((p) => p.y < 39.9)).toBe(true);
  });

  it('uses imported left/right boundary polylines when present', () => {
    const lane = makeLane([
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9002 },
      { x: 116.001, y: 39.9 },
    ]);
    lane.leftBoundary.curve = pointsToCurve([
      { x: 116.0, y: 39.901 },
      { x: 116.001, y: 39.901 },
    ]);
    lane.rightBoundary.curve = pointsToCurve([
      { x: 116.0, y: 39.899 },
      { x: 116.0005, y: 39.8988 },
      { x: 116.001, y: 39.899 },
    ]);

    expect(laneCorridorPolygon(lane)).toEqual([
      { x: 116.0, y: 39.901 },
      { x: 116.001, y: 39.901 },
      { x: 116.001, y: 39.899 },
      { x: 116.0005, y: 39.8988 },
      { x: 116.0, y: 39.899 },
      { x: 116.0, y: 39.901 },
    ]);
  });
});
