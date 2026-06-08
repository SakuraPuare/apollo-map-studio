import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearLaneArcLengthCache,
  invalidateLaneArcLength,
  laneArcLength,
  projectSegmentParam,
} from '../computeLaneS';
import { makeLane, pt } from './testHelpers';

describe('computeLaneS', () => {
  beforeEach(() => {
    clearLaneArcLengthCache();
  });

  it('returns zero length and projection for lanes without a usable centerline', () => {
    const empty = makeLane('empty', []);
    const singlePoint = makeLane('single', [pt(116, 39.9)]);

    expect(laneArcLength(empty)).toBe(0);
    expect(laneArcLength(singlePoint)).toBe(0);
    expect(projectSegmentParam(empty, 0, 0.5)).toBe(0);
    expect(projectSegmentParam(singlePoint, 0, 0.5)).toBe(0);
  });

  it('projects segment parameters with segment index and t clamping', () => {
    const lane = makeLane('lane', [pt(116, 39.9), pt(116.001, 39.9), pt(116.002, 39.9)]);
    const total = laneArcLength(lane);

    expect(total).toBeGreaterThan(0);
    expect(projectSegmentParam(lane, -1, 0.5)).toBe(0);
    expect(projectSegmentParam(lane, 2, 0.5)).toBe(total);
    expect(projectSegmentParam(lane, 0, -1)).toBe(0);
    expect(projectSegmentParam(lane, 0, 2)).toBeCloseTo(total / 2, 6);
    expect(projectSegmentParam(lane, 1, 0.5)).toBeCloseTo(total * 0.75, 6);
  });

  it('recomputes after invalidation and centerline replacement', () => {
    const lane = makeLane('lane', [pt(116, 39.9), pt(116.001, 39.9)]);
    const initial = laneArcLength(lane);

    lane.centralCurve = makeLane('replacement', [
      pt(116, 39.9),
      pt(116.001, 39.9),
      pt(116.002, 39.9),
    ]).centralCurve;

    const replaced = laneArcLength(lane);
    expect(replaced).toBeGreaterThan(initial);

    invalidateLaneArcLength(lane.id);
    const afterInvalidate = laneArcLength(lane);
    expect(afterInvalidate).toBeCloseTo(replaced, 6);
  });

  it('builds cumulative length across multiple curve segments', () => {
    const lane = makeLane('multi', [], {
      centralSegments: [
        [pt(116, 39.9), pt(116.001, 39.9)],
        [pt(116.001, 39.9), pt(116.001, 39.901)],
      ],
    });

    const firstSegmentEnd = projectSegmentParam(lane, 0, 1);
    const total = laneArcLength(lane);

    expect(firstSegmentEnd).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(firstSegmentEnd);
    expect(projectSegmentParam(lane, 1, 1)).toBeCloseTo(total, 6);
  });
});
