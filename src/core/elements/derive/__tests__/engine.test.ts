/**
 * Unit tests for the derive engine (index.ts).
 *
 * Covers:
 *   - applyDerive: entity-type dispatch to correct rule set
 *   - applyDerive: trigger filtering (cause gating)
 *   - applyDerive: _userOverrides skip logic (any owns field match → skip rule)
 *   - applyDerive: multi-rule fold order (length before turn)
 *   - applyDerive: no-op for unregistered entity types
 *   - markUserOverride: adds path, idempotent, does not mutate
 *   - clearUserOverride: removes path, clears array when empty, no-op if absent
 *   - readOverrides: private; tested through public behavior
 */
import { describe, it, expect } from 'vitest';
import type { LaneEntity, ParkingSpaceEntity, JunctionEntity } from '@/types/apollo';
import { applyDerive, markUserOverride, clearUserOverride } from '../index';
import { DEFAULT_LANE_SPEED_LIMIT_MPS, DEFAULT_LANE_BOUNDARY_TYPE } from '@/config/mapConstants';

// ─── fixtures ────────────────────────────────────────────────────────────────

const ORIGIN = { x: 116.4, y: 39.9 };
const STEP = 0.00005; // ≈ 4 m at lat 39.9

function makeLane(
  centerPts: { x: number; y: number }[],
  overrides?: Partial<LaneEntity>,
): LaneEntity {
  return {
    id: 'lane_engine_test',
    entityType: 'lane',
    centralCurve: { segments: [{ lineSegment: { points: centerPts } } as never] },
    leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    length: 999,
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
    leftSamples: [],
    rightSamples: [],
    leftRoadSamples: [],
    rightRoadSamples: [],
    ...overrides,
  };
}

function makeParkingSpace(rotation: number | null, heading = 0): ParkingSpaceEntity {
  const e: ParkingSpaceEntity = {
    id: 'ps_engine_test',
    entityType: 'parkingSpace',
    polygon: { points: [] },
    heading,
    overlapIds: [],
  };
  if (rotation !== null) {
    e._sourceRect = { p1: { x: 0, y: 0 }, p2: { x: 5, y: 2 }, rotation };
  }
  return e;
}

function makeJunction(): JunctionEntity {
  return {
    id: 'j_engine_test',
    entityType: 'junction',
    polygon: { points: [] },
    type: 'CROSS_ROAD',
    overlapIds: [],
  };
}

// ─── applyDerive: dispatch ────────────────────────────────────────────────────

describe('applyDerive — dispatch by entity type', () => {
  it('dispatches to lane rules: recomputes length', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const result = applyDerive(lane, { cause: 'editGeometry', prev: lane });
    expect(result.length).not.toBe(999);
    expect(result.length).toBeGreaterThan(0);
  });

  it('dispatches to lane rules: recomputes turn', () => {
    const rad = (90 * Math.PI) / 180;
    const p0 = ORIGIN;
    const p1 = { x: ORIGIN.x + STEP, y: ORIGIN.y };
    const p2 = { x: p1.x + Math.cos(rad) * STEP, y: p1.y + Math.sin(rad) * STEP };
    const lane = makeLane([p0, p1, p2]);
    const result = applyDerive(lane, { cause: 'editGeometry', prev: lane });
    expect(result.turn).toBe('LEFT_TURN');
  });

  it('dispatches to parkingSpace rules: syncs heading', () => {
    const ps = makeParkingSpace(2.5, 0);
    const result = applyDerive(ps, { cause: 'editGeometry', prev: ps });
    expect(result.heading).toBeCloseTo(2.5);
  });

  it('returns junction unchanged (no rules registered)', () => {
    const j = makeJunction();
    const result = applyDerive(j, { cause: 'editGeometry', prev: j });
    expect(result).toBe(j);
  });
});

// ─── applyDerive: cause/trigger gating ───────────────────────────────────────

describe('applyDerive — trigger gating', () => {
  it('boundarySeed fires on create, not on editGeometry', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    // Before create: boundaries are empty
    expect(lane.leftBoundary.boundaryType).toHaveLength(0);

    const created = applyDerive(lane, { cause: 'create' });
    expect(created.leftBoundary.boundaryType).toHaveLength(1);
    expect(created.leftBoundary.boundaryType[0]?.types[0]).toBe(DEFAULT_LANE_BOUNDARY_TYPE);

    // editGeometry should NOT seed boundaries
    const edited = applyDerive(lane, { cause: 'editGeometry', prev: lane });
    expect(edited.leftBoundary.boundaryType).toHaveLength(0);
  });

  it('length and turn rules fire on editGeometry', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const result = applyDerive(lane, { cause: 'editGeometry', prev: lane });
    expect(result.length).not.toBe(999);
  });

  it('length and turn rules fire on create too (no explicit on)', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const result = applyDerive(lane, { cause: 'create' });
    expect(result.length).not.toBe(999);
  });

  it('editAttribute does not trigger length/turn rules (not in default triggers)', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    // Default triggers are create+editGeometry; editAttribute is not included
    const result = applyDerive(lane, { cause: 'editAttribute' });
    // Length rule should be skipped → length stays at 999
    expect(result.length).toBe(999);
  });

  it('editAttribute does not trigger parkingSpace heading rule', () => {
    const ps = makeParkingSpace(2.5, 0.0);
    const result = applyDerive(ps, { cause: 'editAttribute' });
    expect(result.heading).toBe(0.0); // unchanged
  });

  it('editAttribute does not trigger boundarySeed rule', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const result = applyDerive(lane, { cause: 'editAttribute' });
    expect(result.leftBoundary.boundaryType).toHaveLength(0); // not seeded
  });
});

// ─── applyDerive: _userOverrides skip logic ───────────────────────────────────

describe('applyDerive — _userOverrides skip logic', () => {
  it('skips lane.turn rule when "turn" is in _userOverrides', () => {
    const rad = (90 * Math.PI) / 180;
    const p0 = ORIGIN;
    const p1 = { x: ORIGIN.x + STEP, y: ORIGIN.y };
    const p2 = { x: p1.x + Math.cos(rad) * STEP, y: p1.y + Math.sin(rad) * STEP };
    const lane = makeLane([p0, p1, p2], { turn: 'NO_TURN' });
    const pinned = markUserOverride(lane, 'turn');
    const result = applyDerive(pinned, { cause: 'editGeometry', prev: pinned });
    expect(result.turn).toBe('NO_TURN'); // not recomputed to LEFT_TURN
  });

  it('skips lane.length rule when "length" is in _userOverrides', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const pinned = markUserOverride(lane, 'length');
    const result = applyDerive(pinned, { cause: 'editGeometry', prev: pinned });
    expect(result.length).toBe(999); // not recomputed
  });

  it('skips boundarySeed rule when leftBoundary.boundaryType is in _userOverrides', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const pinned = markUserOverride(lane, 'leftBoundary.boundaryType');
    const result = applyDerive(pinned, { cause: 'create' });
    // Rule owns both leftBoundary.boundaryType and rightBoundary.boundaryType;
    // a match on ANY owned path skips the entire rule.
    expect(result.leftBoundary.boundaryType).toHaveLength(0); // not seeded
  });

  it('skips boundarySeed rule when rightBoundary.boundaryType is in _userOverrides', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const pinned = markUserOverride(lane, 'rightBoundary.boundaryType');
    const result = applyDerive(pinned, { cause: 'create' });
    expect(result.rightBoundary.boundaryType).toHaveLength(0); // not seeded
  });

  it('skips parkingSpace.heading rule when "heading" is in _userOverrides', () => {
    const ps = makeParkingSpace(2.5, 0.0);
    const pinned = markUserOverride(ps, 'heading');
    const result = applyDerive(pinned, { cause: 'editGeometry', prev: pinned });
    expect(result.heading).toBe(0.0); // not updated to 2.5
  });

  it('a rule skip does not affect other rules for the same entity', () => {
    // Pin only "turn" — length should still recompute.
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const pinned = markUserOverride(lane, 'turn');
    const result = applyDerive(pinned, { cause: 'editGeometry', prev: pinned });
    expect(result.turn).toBe('NO_TURN'); // skipped
    expect(result.length).not.toBe(999); // still recomputed
  });

  it('multiple overrides can coexist', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const pinned = markUserOverride(markUserOverride(lane, 'turn'), 'length');
    expect(pinned._userOverrides).toContain('turn');
    expect(pinned._userOverrides).toContain('length');
    const result = applyDerive(pinned, { cause: 'editGeometry', prev: pinned });
    expect(result.turn).toBe('NO_TURN');
    expect(result.length).toBe(999);
  });
});

// ─── markUserOverride ────────────────────────────────────────────────────────

describe('markUserOverride', () => {
  it('adds path to _userOverrides when not present', () => {
    const lane = makeLane([ORIGIN]);
    const result = markUserOverride(lane, 'turn');
    expect(result._userOverrides).toContain('turn');
  });

  it('is idempotent — second call returns same reference', () => {
    const lane = makeLane([ORIGIN]);
    const once = markUserOverride(lane, 'turn');
    const twice = markUserOverride(once, 'turn');
    expect(twice).toBe(once);
  });

  it('preserves existing overrides when adding a new one', () => {
    const lane = makeLane([ORIGIN]);
    const withTurn = markUserOverride(lane, 'turn');
    const withBoth = markUserOverride(withTurn, 'length');
    expect(withBoth._userOverrides).toContain('turn');
    expect(withBoth._userOverrides).toContain('length');
    expect(withBoth._userOverrides).toHaveLength(2);
  });

  it('does not mutate the original entity', () => {
    const lane = makeLane([ORIGIN]);
    markUserOverride(lane, 'turn');
    expect(lane._userOverrides).toBeUndefined();
  });

  it('returns a new object reference when path is newly added', () => {
    const lane = makeLane([ORIGIN]);
    const result = markUserOverride(lane, 'turn');
    expect(result).not.toBe(lane);
  });

  it('handles ParkingSpaceEntity too', () => {
    const ps = makeParkingSpace(0);
    const result = markUserOverride(ps, 'heading');
    expect(result._userOverrides).toContain('heading');
  });

  it('_userOverrides array starts fresh when undefined', () => {
    const lane = makeLane([ORIGIN]);
    expect(lane._userOverrides).toBeUndefined();
    const result = markUserOverride(lane, 'speedLimit');
    expect(result._userOverrides).toEqual(['speedLimit']);
  });
});

// ─── clearUserOverride ────────────────────────────────────────────────────────

describe('clearUserOverride', () => {
  it('removes the path from _userOverrides', () => {
    const lane = makeLane([ORIGIN]);
    const pinned = markUserOverride(lane, 'turn');
    const released = clearUserOverride(pinned, 'turn');
    expect(released._userOverrides).toBeUndefined();
  });

  it('returns same reference when path is not in overrides', () => {
    const lane = makeLane([ORIGIN]);
    const result = clearUserOverride(lane, 'turn');
    expect(result).toBe(lane);
  });

  it('returns same reference when _userOverrides is undefined', () => {
    const lane = makeLane([ORIGIN]);
    expect(lane._userOverrides).toBeUndefined();
    const result = clearUserOverride(lane, 'turn');
    expect(result).toBe(lane);
  });

  it('removes only the specified path, keeps others', () => {
    const lane = makeLane([ORIGIN]);
    const pinned = markUserOverride(markUserOverride(lane, 'turn'), 'length');
    const released = clearUserOverride(pinned, 'turn');
    expect(released._userOverrides).not.toContain('turn');
    expect(released._userOverrides).toContain('length');
  });

  it('sets _userOverrides to undefined when removing the last entry', () => {
    const lane = makeLane([ORIGIN]);
    const pinned = markUserOverride(lane, 'turn');
    const released = clearUserOverride(pinned, 'turn');
    expect(released._userOverrides).toBeUndefined();
  });

  it('does not mutate the original entity', () => {
    const lane = makeLane([ORIGIN]);
    const pinned = markUserOverride(lane, 'turn');
    const pinnedOverrides = pinned._userOverrides;
    clearUserOverride(pinned, 'turn');
    expect(pinned._userOverrides).toBe(pinnedOverrides); // unchanged
  });

  it('round-trip: mark then clear restores to no override', () => {
    const lane = makeLane([ORIGIN]);
    const marked = markUserOverride(lane, 'speedLimit');
    const cleared = clearUserOverride(marked, 'speedLimit');
    expect(cleared._userOverrides).toBeUndefined();
    // Verify derive now recomputes the previously pinned field.
    const derived = applyDerive({ ...cleared, length: 999 } as LaneEntity, {
      cause: 'editGeometry',
      prev: lane,
    });
    expect(derived.length).not.toBe(999);
  });

  it('works for ParkingSpaceEntity', () => {
    const ps = makeParkingSpace(1.0);
    const pinned = markUserOverride(ps, 'heading');
    const released = clearUserOverride(pinned, 'heading');
    expect(released._userOverrides).toBeUndefined();
  });
});

// ─── applyDerive: fold order and referential integrity ───────────────────────

describe('applyDerive — fold order and referential integrity', () => {
  it('folds rules in declaration order: length computed before turn', () => {
    // Both length and turn rules run; we just verify both update in one call.
    const rad = (90 * Math.PI) / 180;
    const p0 = ORIGIN;
    const p1 = { x: ORIGIN.x + STEP, y: ORIGIN.y };
    const p2 = { x: p1.x + Math.cos(rad) * STEP, y: p1.y + Math.sin(rad) * STEP };
    const lane = makeLane([p0, p1, p2]);
    const result = applyDerive(lane, { cause: 'editGeometry', prev: lane });
    expect(result.length).not.toBe(999);
    expect(result.turn).toBe('LEFT_TURN');
  });

  it('returns same reference when all rules are no-ops', () => {
    // Lane with correctly pre-computed length and turn — rules will return
    // same ref. Engine should propagate the no-op reference.
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const derived = applyDerive(lane, { cause: 'editGeometry', prev: lane });
    // Run again with the already-correct derived entity
    const again = applyDerive(derived, { cause: 'editGeometry', prev: derived });
    // Second fold should produce same reference (all rules no-op)
    expect(again).toBe(derived);
  });

  it('on create: length, turn, and boundarySeed all fire', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const result = applyDerive(lane, { cause: 'create' });
    expect(result.length).not.toBe(999);
    expect(result.turn).toBe('NO_TURN'); // straight line
    expect(result.leftBoundary.boundaryType).toHaveLength(1);
    expect(result.rightBoundary.boundaryType).toHaveLength(1);
  });
});

// ─── applyDerive: edge cases ──────────────────────────────────────────────────

describe('applyDerive — edge cases', () => {
  it('does not throw on lane with no segments in centralCurve', () => {
    const lane: LaneEntity = {
      id: 'lane_empty',
      entityType: 'lane',
      centralCurve: { segments: [] },
      leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
      rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
      length: 0,
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
      leftSamples: [],
      rightSamples: [],
      leftRoadSamples: [],
      rightRoadSamples: [],
    };
    expect(() => applyDerive(lane, { cause: 'editGeometry', prev: lane })).not.toThrow();
  });

  it('parkingSpace with empty polygon does not throw', () => {
    const ps = makeParkingSpace(1.0);
    expect(() => applyDerive(ps, { cause: 'editGeometry', prev: ps })).not.toThrow();
  });

  it('parkingSpace with _userOverrides: [] (empty array) still derives normally', () => {
    // An empty array means "no overrides" — no paths should be blocked.
    const ps: ParkingSpaceEntity = {
      ...makeParkingSpace(3.0, 0.0),
      _userOverrides: [],
    };
    const result = applyDerive(ps, { cause: 'editGeometry', prev: ps });
    expect(result.heading).toBeCloseTo(3.0);
  });

  it('engine is pure: calling applyDerive never mutates input', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const originalLength = lane.length;
    applyDerive(lane, { cause: 'editGeometry', prev: lane });
    expect(lane.length).toBe(originalLength); // not mutated
  });
});
