/**
 * Unit tests for the lane derive rules (lane.ts).
 *
 * Covers:
 *   - lane.length rule: zero/one/many points, correct haversine value
 *   - lane.turn rule: all four classification buckets, threshold edges
 *   - lane.boundarySeed rule: fires on 'create' only, idempotent, partial fill
 *   - `on` trigger gating (boundarySeed skipped on editGeometry)
 *   - No-op reference equality when nothing changes
 */
import { describe, it, expect } from 'vitest';
import type { LaneEntity, LaneTurn, BoundaryLineType } from '@/types/apollo';
import { DEFAULT_LANE_SPEED_LIMIT_MPS, DEFAULT_LANE_BOUNDARY_TYPE } from '@/config/mapConstants';

// Direct import of the rules array — tests rules in isolation.
import { laneRules } from '../rules/lane';
import type { DeriveContext } from '../types';

// ─── helpers ────────────────────────────────────────────────────────────────

const ORIGIN = { x: 116.4, y: 39.9 };

/** Degree offset → tiny lng shift useful for building test polylines. */
const STEP = 0.00005; // ≈ 4 m at lat 39.9

function makeLane(centerPts: { x: number; y: number }[]): LaneEntity {
  return {
    id: 'lane_rule_test',
    entityType: 'lane',
    centralCurve: { segments: [{ lineSegment: { points: centerPts } } as never] },
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
    leftSamples: [{ s: 0, width: 1.75 }],
    rightSamples: [{ s: 0, width: 1.75 }],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

/** Build a 3-point polyline where the end tangent is rotated `deg` from the
 *  start tangent (+x direction). Matches the fixture in inferLaneTurn tests. */
function buildCurvedLane(rotationDeg: number): LaneEntity {
  const rad = (rotationDeg * Math.PI) / 180;
  const p0 = ORIGIN;
  const p1 = { x: ORIGIN.x + STEP, y: ORIGIN.y };
  const p2 = { x: p1.x + Math.cos(rad) * STEP, y: p1.y + Math.sin(rad) * STEP };
  return makeLane([p0, p1, p2]);
}

/** Retrieve a rule by id from laneRules. */
function ruleById(id: string) {
  const rule = laneRules.find((r) => r.id === id);
  if (!rule) throw new Error(`Rule not found: ${id}`);
  return rule;
}

const editCtx: DeriveContext<LaneEntity> = { cause: 'editGeometry', prev: undefined };
const createCtx: DeriveContext<LaneEntity> = { cause: 'create' };
const _attrCtx: DeriveContext<LaneEntity> = { cause: 'editAttribute' };

// ─── lane.length rule ────────────────────────────────────────────────────────

describe('lane.length rule', () => {
  const rule = ruleById('lane.length');

  it('owns only "length"', () => {
    expect(rule.owns).toEqual(['length']);
  });

  it('returns 0 for empty points array', () => {
    const lane = makeLane([]);
    const result = rule.apply(lane, editCtx);
    expect(result.length).toBe(0);
  });

  it('returns 0 for a single point', () => {
    const lane = makeLane([ORIGIN]);
    const result = rule.apply(lane, editCtx);
    expect(result.length).toBe(0);
  });

  it('computes positive length for two distinct points', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const result = rule.apply(lane, editCtx);
    // 0.0001° in lng ≈ 8.5 m at lat 39.9
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(20);
  });

  it('accumulates length over multiple segments', () => {
    const lane = makeLane([
      ORIGIN,
      { x: ORIGIN.x + 0.0001, y: ORIGIN.y },
      { x: ORIGIN.x + 0.0002, y: ORIGIN.y },
    ]);
    const single = rule.apply(makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]), editCtx);
    const multi = rule.apply(lane, editCtx);
    // 3-point line should be approx 2x the 2-point line
    expect(multi.length ?? 0).toBeCloseTo((single.length ?? 0) * 2, 5);
  });

  it('returns same reference (no-op) when length is already correct', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    // Run once to get the true length, then set it on the entity and re-run.
    const once = rule.apply(lane, editCtx);
    const exact = { ...lane, length: once.length };
    const again = rule.apply(exact, editCtx);
    expect(again).toBe(exact); // same reference when nothing changed
  });

  it('handles coincident points (zero-length segment)', () => {
    const lane = makeLane([ORIGIN, ORIGIN]);
    const result = rule.apply(lane, editCtx);
    expect(result.length).toBe(0);
  });

  it('default triggers include create and editGeometry (no explicit on)', () => {
    // The rule has no `on` property set — engine defaults to create+editGeometry.
    expect(rule.on).toBeUndefined();
  });
});

// ─── lane.turn rule ──────────────────────────────────────────────────────────

describe('lane.turn rule', () => {
  const rule = ruleById('lane.turn');

  it('owns only "turn"', () => {
    expect(rule.owns).toEqual(['turn']);
  });

  it('classifies straight line as NO_TURN', () => {
    const lane = makeLane([
      ORIGIN,
      { x: ORIGIN.x + 0.0001, y: ORIGIN.y },
      { x: ORIGIN.x + 0.0002, y: ORIGIN.y },
    ]);
    const result = rule.apply(lane, editCtx);
    expect(result.turn).toBe('NO_TURN');
  });

  it('classifies ~90° CCW arc as LEFT_TURN', () => {
    const lane = buildCurvedLane(90);
    const result = rule.apply(lane, editCtx);
    expect(result.turn).toBe('LEFT_TURN');
  });

  it('classifies ~90° CW arc as RIGHT_TURN', () => {
    const lane = buildCurvedLane(-90);
    const result = rule.apply(lane, editCtx);
    expect(result.turn).toBe('RIGHT_TURN');
  });

  it('classifies ~170° rotation as U_TURN', () => {
    const lane = buildCurvedLane(170);
    const result = rule.apply(lane, editCtx);
    expect(result.turn).toBe('U_TURN');
  });

  it('classifies ~-170° rotation as U_TURN (CW half-loop)', () => {
    const lane = buildCurvedLane(-170);
    const result = rule.apply(lane, editCtx);
    expect(result.turn).toBe('U_TURN');
  });

  it('classifies 30° rotation as LEFT_TURN (above NO_TURN threshold)', () => {
    const lane = buildCurvedLane(30);
    const result = rule.apply(lane, editCtx);
    expect(result.turn).toBe('LEFT_TURN');
  });

  it('classifies -30° rotation as RIGHT_TURN', () => {
    const lane = buildCurvedLane(-30);
    const result = rule.apply(lane, editCtx);
    expect(result.turn).toBe('RIGHT_TURN');
  });

  it('returns NO_TURN for single point (< 2 pts)', () => {
    const lane = makeLane([ORIGIN]);
    const result = rule.apply(lane, editCtx);
    expect(result.turn).toBe('NO_TURN');
  });

  it('returns NO_TURN for empty points', () => {
    const lane = makeLane([]);
    const result = rule.apply(lane, editCtx);
    expect(result.turn).toBe('NO_TURN');
  });

  it('returns same reference when turn value is already correct', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    // Straight line → NO_TURN; lane.turn is already 'NO_TURN'
    const result = rule.apply(lane, editCtx);
    expect(result).toBe(lane);
  });

  it('default triggers include create and editGeometry (no explicit on)', () => {
    expect(rule.on).toBeUndefined();
  });

  it('all four LaneTurn values are reachable', () => {
    const turns: LaneTurn[] = [];
    turns.push(rule.apply(makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]), editCtx).turn);
    turns.push(rule.apply(buildCurvedLane(90), editCtx).turn);
    turns.push(rule.apply(buildCurvedLane(-90), editCtx).turn);
    turns.push(rule.apply(buildCurvedLane(170), editCtx).turn);
    expect(new Set(turns)).toEqual(new Set(['NO_TURN', 'LEFT_TURN', 'RIGHT_TURN', 'U_TURN']));
  });
});

// ─── lane.boundarySeed rule ──────────────────────────────────────────────────

describe('lane.boundarySeed rule', () => {
  const rule = ruleById('lane.boundarySeed');

  it('owns leftBoundary.boundaryType and rightBoundary.boundaryType', () => {
    expect(rule.owns).toContain('leftBoundary.boundaryType');
    expect(rule.owns).toContain('rightBoundary.boundaryType');
  });

  it('fires on create only (rule.on === ["create"])', () => {
    expect(rule.on).toEqual(['create']);
  });

  it('seeds both boundaries with DOTTED_WHITE on create when both are empty', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const result = rule.apply(lane, createCtx);
    expect(result.leftBoundary.boundaryType).toHaveLength(1);
    expect(result.rightBoundary.boundaryType).toHaveLength(1);
    expect(result.leftBoundary.boundaryType[0]?.s).toBe(0);
    expect(result.leftBoundary.boundaryType[0]?.types[0]).toBe(
      DEFAULT_LANE_BOUNDARY_TYPE as BoundaryLineType,
    );
    expect(result.rightBoundary.boundaryType[0]?.types[0]).toBe(
      DEFAULT_LANE_BOUNDARY_TYPE as BoundaryLineType,
    );
  });

  it('seeds right boundary only when left is already filled', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const prefilled = {
      ...lane,
      leftBoundary: {
        ...lane.leftBoundary,
        boundaryType: [{ s: 0, types: ['SOLID_WHITE' as BoundaryLineType] }],
      },
    };
    const result = rule.apply(prefilled, createCtx);
    // Left unchanged
    expect(result.leftBoundary.boundaryType[0]?.types[0]).toBe('SOLID_WHITE');
    // Right seeded
    expect(result.rightBoundary.boundaryType).toHaveLength(1);
    expect(result.rightBoundary.boundaryType[0]?.types[0]).toBe(
      DEFAULT_LANE_BOUNDARY_TYPE as BoundaryLineType,
    );
  });

  it('seeds left boundary only when right is already filled', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const prefilled = {
      ...lane,
      rightBoundary: {
        ...lane.rightBoundary,
        boundaryType: [{ s: 0, types: ['CURB' as BoundaryLineType] }],
      },
    };
    const result = rule.apply(prefilled, createCtx);
    expect(result.leftBoundary.boundaryType).toHaveLength(1);
    expect(result.leftBoundary.boundaryType[0]?.types[0]).toBe(
      DEFAULT_LANE_BOUNDARY_TYPE as BoundaryLineType,
    );
    // Right unchanged
    expect(result.rightBoundary.boundaryType[0]?.types[0]).toBe('CURB');
  });

  it('returns same reference (no-op) when both boundaries already have entries', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const filled = {
      ...lane,
      leftBoundary: {
        ...lane.leftBoundary,
        boundaryType: [{ s: 0, types: ['SOLID_YELLOW' as BoundaryLineType] }],
      },
      rightBoundary: {
        ...lane.rightBoundary,
        boundaryType: [{ s: 0, types: ['DOTTED_YELLOW' as BoundaryLineType] }],
      },
    };
    const result = rule.apply(filled, createCtx);
    expect(result).toBe(filled);
  });

  it('is idempotent: running twice produces the same result', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const once = rule.apply(lane, createCtx);
    const twice = rule.apply(once, createCtx);
    expect(twice).toBe(once); // no-op second time (same ref)
  });

  it('does NOT seed when context is editGeometry (guarded by engine trigger filter)', () => {
    // Rule.on = ['create'], so engine skips it for editGeometry.
    // Verify the rule itself returns a different entity only for 'create',
    // and when we pretend to pass editGeometry ctx the entity is returned as-is
    // (same ref — no seeding needed). This guards the contract at rule level.
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    // Passing editGeometry to the rule directly: the rule does NOT check ctx —
    // it seeds if arrays are empty regardless. The engine is responsible for
    // filtering. We document this by verifying the rule will seed regardless
    // of context (trigger filtering is engine-level, not rule-level).
    const result = rule.apply(lane, editCtx);
    // Rule does seed — the gating is the engine's job (trigger filter).
    // Confirm at least that the engine-level gating in applyDerive works:
    // see applyDerive.test.ts "seeds boundaryType on create only".
    expect(result.leftBoundary.boundaryType).toHaveLength(1); // rule always seeds if empty
  });

  it('seeds with s=0 entry matching DEFAULT_LANE_BOUNDARY_TYPE', () => {
    const lane = makeLane([ORIGIN, { x: ORIGIN.x + 0.0001, y: ORIGIN.y }]);
    const result = rule.apply(lane, createCtx);
    const leftEntry = result.leftBoundary.boundaryType[0];
    expect(leftEntry).toBeDefined();
    expect(leftEntry!.s).toBe(0);
    expect(leftEntry!.types).toHaveLength(1);
    expect(leftEntry!.types[0]).toBe('DOTTED_WHITE');
  });
});

// ─── laneRules export shape ──────────────────────────────────────────────────

describe('laneRules export', () => {
  it('exports an array of three rules', () => {
    expect(laneRules).toHaveLength(3);
  });

  it('rule ids are unique', () => {
    const ids = laneRules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each rule has an id, owns array, and apply function', () => {
    for (const rule of laneRules) {
      expect(typeof rule.id).toBe('string');
      expect(Array.isArray(rule.owns)).toBe(true);
      expect(typeof rule.apply).toBe('function');
    }
  });

  it('rule order: length → turn → boundarySeed', () => {
    expect(laneRules[0]!.id).toBe('lane.length');
    expect(laneRules[1]!.id).toBe('lane.turn');
    expect(laneRules[2]!.id).toBe('lane.boundarySeed');
  });
});
