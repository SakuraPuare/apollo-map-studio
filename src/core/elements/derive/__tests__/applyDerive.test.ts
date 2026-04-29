/**
 * applyDerive engine tests.
 *
 * Covers:
 *   - lane.length recomputes on geometry edit
 *   - lane.turn recomputes on geometry edit
 *   - lane.boundarySeed only fires on `create`
 *   - `_userOverrides` skips matching rules
 *   - `markUserOverride` is idempotent
 *   - non-derive entity types pass through untouched
 */
import { describe, it, expect } from 'vitest';
import type { LaneEntity, ParkingSpaceEntity, JunctionEntity } from '@/types/apollo';
import { applyDerive, markUserOverride, clearUserOverride } from '../index';
import { DEFAULT_LANE_SPEED_LIMIT_MPS } from '@/config/mapConstants';

function makeLane(centerPts: { x: number; y: number }[]): LaneEntity {
  return {
    id: 'lane_test',
    entityType: 'lane',
    centralCurve: { segments: [{ lineSegment: { points: centerPts } } as never] },
    leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    length: 999, // intentionally wrong — derive should overwrite
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: DEFAULT_LANE_SPEED_LIMIT_MPS,
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

const ORIGIN = { x: 116.4, y: 39.9 };

describe('applyDerive — lane', () => {
  it('recomputes length on editGeometry', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const next = applyDerive(lane, { cause: 'editGeometry', prev: lane });
    expect(next.length).toBeGreaterThan(0);
    expect(next.length).toBeLessThan(20); // ~8.5m at this latitude
    expect(next.length).not.toBe(999);
  });

  it('recomputes turn on editGeometry (left arc)', () => {
    // Build a 90° CCW arc fixture (matches inferLaneTurn test pattern).
    const step = 0.00005;
    const p0 = ORIGIN;
    const p1 = { x: ORIGIN.x + step, y: ORIGIN.y };
    const rad = (90 * Math.PI) / 180;
    const p2 = {
      x: p1.x + Math.cos(rad) * step,
      y: p1.y + Math.sin(rad) * step,
    };
    const lane = makeLane([p0, p1, p2]);
    const next = applyDerive(lane, { cause: 'editGeometry', prev: lane });
    expect(next.turn).toBe('LEFT_TURN');
  });

  it('seeds boundaryType on create only', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    expect(lane.leftBoundary.boundaryType).toHaveLength(0);

    const created = applyDerive(lane, { cause: 'create' });
    expect(created.leftBoundary.boundaryType.length).toBeGreaterThan(0);
    expect(created.leftBoundary.boundaryType[0]?.types[0]).toBe('DOTTED_WHITE');

    // editGeometry must NOT seed empty boundaries — would clobber a
    // legitimately user-cleared boundaryType array.
    const edited = applyDerive(lane, { cause: 'editGeometry', prev: lane });
    expect(edited.leftBoundary.boundaryType).toHaveLength(0);
  });

  it('skips lane.turn rule when "turn" is in _userOverrides', () => {
    // 90° CCW arc but pinned to NO_TURN via override.
    const step = 0.00005;
    const p0 = ORIGIN;
    const p1 = { x: ORIGIN.x + step, y: ORIGIN.y };
    const p2 = { x: p1.x, y: p1.y + step };
    const lane = makeLane([p0, p1, p2]);
    const pinned = markUserOverride({ ...lane, turn: 'NO_TURN' as const }, 'turn');
    const next = applyDerive(pinned, { cause: 'editGeometry', prev: pinned });
    expect(next.turn).toBe('NO_TURN');
    // length is not overridden — still recomputes.
    expect(next.length).not.toBe(999);
  });

  it('clearUserOverride releases a pinned field', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const pinned = markUserOverride(lane, 'turn');
    expect(pinned._userOverrides).toContain('turn');
    const released = clearUserOverride(pinned, 'turn');
    expect(released._userOverrides).toBeUndefined();
  });

  it('markUserOverride is idempotent', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const once = markUserOverride(lane, 'turn');
    const twice = markUserOverride(once, 'turn');
    expect(twice).toBe(once);
    expect(twice._userOverrides).toEqual(['turn']);
  });
});

describe('applyDerive — parkingSpace', () => {
  function makeParking(rotation: number | null): ParkingSpaceEntity {
    const e: ParkingSpaceEntity = {
      id: 'ps_test',
      entityType: 'parkingSpace',
      polygon: { points: [] },
      heading: 0,
      overlapIds: [],
    };
    if (rotation !== null) {
      e._sourceRect = { p1: { x: 0, y: 0 }, p2: { x: 1, y: 1 }, rotation };
    }
    return e;
  }

  it('syncs heading from _sourceRect.rotation on editGeometry', () => {
    const ps = makeParking(1.234);
    const next = applyDerive(ps, { cause: 'editGeometry', prev: ps });
    expect(next.heading).toBeCloseTo(1.234);
  });

  it('skips heading rule when "heading" is overridden', () => {
    const ps = markUserOverride(makeParking(1.234), 'heading');
    const next = applyDerive(ps, { cause: 'editGeometry', prev: ps });
    expect(next.heading).toBe(0); // not overwritten
  });

  it('no-op when entity has no _sourceRect', () => {
    const ps = makeParking(null);
    const next = applyDerive(ps, { cause: 'editGeometry', prev: ps });
    expect(next).toBe(ps);
  });
});

describe('applyDerive — entities without registered rules', () => {
  it('returns junction unchanged', () => {
    const j: JunctionEntity = {
      id: 'j_test',
      entityType: 'junction',
      polygon: { points: [] },
      type: 'CROSS_ROAD',
      overlapIds: [],
    };
    const next = applyDerive(j, { cause: 'editGeometry', prev: j });
    expect(next).toBe(j);
  });
});
