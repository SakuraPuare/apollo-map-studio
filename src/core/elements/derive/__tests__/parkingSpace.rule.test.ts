/**
 * Unit tests for the parking-space derive rules (parkingSpace.ts).
 *
 * Covers:
 *   - parkingSpace.headingFromRect rule: heading synced from _sourceRect.rotation
 *   - No-op (same reference) when heading already matches rotation
 *   - No-op when _sourceRect is absent
 *   - Zero rotation, negative rotation, full-circle rotation
 *   - parkingSpaceRules export shape
 */
import { describe, it, expect } from 'vitest';
import type { ParkingSpaceEntity } from '@/types/apollo';
import { parkingSpaceRules } from '../rules/parkingSpace';
import type { DeriveContext } from '../types';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeParking(rotation: number | null, heading = 0): ParkingSpaceEntity {
  const e: ParkingSpaceEntity = {
    id: 'ps_rule_test',
    entityType: 'parkingSpace',
    polygon: { points: [] },
    heading,
    overlapIds: [],
  };
  if (rotation !== null) {
    e._sourceRect = { p1: { x: 0, y: 0 }, p2: { x: 1, y: 1 }, rotation };
  }
  return e;
}

function ruleById(id: string) {
  const rule = parkingSpaceRules.find((r) => r.id === id);
  if (!rule) throw new Error(`Rule not found: ${id}`);
  return rule;
}

const editCtx: DeriveContext<ParkingSpaceEntity> = { cause: 'editGeometry', prev: undefined };
const createCtx: DeriveContext<ParkingSpaceEntity> = { cause: 'create' };

// ─── parkingSpace.headingFromRect rule ────────────────────────────────────────

describe('parkingSpace.headingFromRect rule', () => {
  const rule = ruleById('parkingSpace.headingFromRect');

  it('owns only "heading"', () => {
    expect(rule.owns).toEqual(['heading']);
  });

  it('default triggers include create and editGeometry (no explicit on)', () => {
    expect(rule.on).toBeUndefined();
  });

  it('syncs heading from _sourceRect.rotation', () => {
    const ps = makeParking(1.234);
    const result = rule.apply(ps, editCtx);
    expect(result.heading).toBeCloseTo(1.234);
  });

  it('syncs heading with zero rotation', () => {
    const ps = makeParking(0, 0.5); // heading ≠ rotation
    const result = rule.apply(ps, editCtx);
    expect(result.heading).toBe(0);
  });

  it('syncs heading with negative rotation', () => {
    const ps = makeParking(-Math.PI / 4, 0);
    const result = rule.apply(ps, editCtx);
    expect(result.heading).toBeCloseTo(-Math.PI / 4);
  });

  it('syncs heading with full rotation (2π)', () => {
    const ps = makeParking(2 * Math.PI, 0);
    const result = rule.apply(ps, editCtx);
    expect(result.heading).toBeCloseTo(2 * Math.PI);
  });

  it('returns same reference (no-op) when heading already matches rotation', () => {
    const ps = makeParking(1.5, 1.5); // heading === rotation
    const result = rule.apply(ps, editCtx);
    expect(result).toBe(ps);
  });

  it('returns same reference (no-op) when _sourceRect is absent', () => {
    const ps = makeParking(null);
    const result = rule.apply(ps, editCtx);
    expect(result).toBe(ps);
  });

  it('does not mutate the original entity', () => {
    const ps = makeParking(0.9, 0.0);
    const originalHeading = ps.heading;
    rule.apply(ps, editCtx);
    expect(ps.heading).toBe(originalHeading); // original unchanged
  });

  it('produces a new object reference when update is needed', () => {
    const ps = makeParking(0.9, 0.0);
    const result = rule.apply(ps, editCtx);
    expect(result).not.toBe(ps);
    expect(result.heading).toBeCloseTo(0.9);
  });

  it('works in create context too (no explicit on filter)', () => {
    const ps = makeParking(2.0, 0.0);
    const result = rule.apply(ps, createCtx);
    expect(result.heading).toBeCloseTo(2.0);
  });

  it('preserves all other entity fields', () => {
    const ps = makeParking(1.0, 0.0);
    ps.overlapIds = ['overlap1'];
    ps.polygon = { points: [{ x: 1, y: 2 }] };
    const result = rule.apply(ps, editCtx);
    expect(result.id).toBe(ps.id);
    expect(result.entityType).toBe(ps.entityType);
    expect(result.overlapIds).toBe(ps.overlapIds);
    expect(result.polygon).toBe(ps.polygon);
    expect(result._sourceRect).toBe(ps._sourceRect);
  });

  it('heading sync works with very small floating-point rotations', () => {
    const tiny = 1e-10;
    const ps = makeParking(tiny, 0);
    const result = rule.apply(ps, editCtx);
    expect(result.heading).toBe(tiny);
  });
});

// ─── parkingSpaceRules export shape ─────────────────────────────────────────

describe('parkingSpaceRules export', () => {
  it('exports an array with exactly one rule', () => {
    expect(parkingSpaceRules).toHaveLength(1);
  });

  it('the single rule has id, owns array, and apply function', () => {
    const rule = parkingSpaceRules[0]!;
    expect(typeof rule.id).toBe('string');
    expect(Array.isArray(rule.owns)).toBe(true);
    expect(typeof rule.apply).toBe('function');
  });

  it('rule id is "parkingSpace.headingFromRect"', () => {
    expect(parkingSpaceRules[0]!.id).toBe('parkingSpace.headingFromRect');
  });
});
