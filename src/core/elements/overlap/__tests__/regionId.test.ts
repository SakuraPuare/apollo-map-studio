/**
 * Tests for makeRegionId / isDerivedRegionId — Apollo-aligned semantic ids.
 *
 * 覆盖：稳定性 / 顺序无关 / slot 区分 / 命名空间隔离.
 */
import { describe, it, expect } from 'vitest';
import { makeRegionId, isDerivedRegionId } from '../regionId';
import { makeOverlapId, isDerivedOverlapId } from '../overlapId';

describe('makeRegionId', () => {
  it('returns a stable id for the same participants + slot', () => {
    const id1 = makeRegionId(['lane_1', 'CW_1']);
    const id2 = makeRegionId(['lane_1', 'CW_1']);
    expect(id1).toBe(id2);
  });

  it('is order-independent (sorted internally)', () => {
    const id1 = makeRegionId(['lane_1', 'CW_1']);
    const id2 = makeRegionId(['CW_1', 'lane_1']);
    expect(id1).toBe(id2);
  });

  it('produces different ids for different slots', () => {
    const slot0 = makeRegionId(['A', 'B'], 0);
    const slot1 = makeRegionId(['A', 'B'], 1);
    const slot2 = makeRegionId(['A', 'B'], 2);
    expect(slot0).not.toBe(slot1);
    expect(slot1).not.toBe(slot2);
    expect(slot0).not.toBe(slot2);
  });

  it('matches the Apollo-style semantic shape: `region_<sortedParticipants>`', () => {
    const id = makeRegionId(['lane_3', 'CW_2']);
    // Lex sort: 'CW_2' < 'lane_3' (uppercase < lowercase)
    expect(id).toBe('region_CW_2_lane_3');
  });

  it('appends `__<slot>` only when slot > 0', () => {
    expect(makeRegionId(['A', 'B'], 0)).toBe('region_A_B');
    expect(makeRegionId(['A', 'B'], 2)).toBe('region_A_B__2');
  });

  it('default slot is 0', () => {
    expect(makeRegionId(['A', 'B'])).toBe(makeRegionId(['A', 'B'], 0));
  });

  it('throws on empty participants array', () => {
    expect(() => makeRegionId([])).toThrow(/non-empty/);
    expect(() => makeRegionId([], 2)).toThrow(/non-empty/);
  });

  it('dedupes duplicate participants before sorting', () => {
    expect(makeRegionId(['A', 'A', 'B'])).toBe('region_A_B');
    expect(makeRegionId(['B', 'A', 'B', 'A'])).toBe('region_A_B');
  });

  it('throws on negative slot', () => {
    expect(() => makeRegionId(['A', 'B'], -1)).toThrow(/non-negative integer/);
  });

  it('throws on non-integer slot', () => {
    expect(() => makeRegionId(['A', 'B'], 1.5)).toThrow(/non-negative integer/);
    expect(() => makeRegionId(['A', 'B'], NaN)).toThrow(/non-negative integer/);
    expect(() => makeRegionId(['A', 'B'], Infinity)).toThrow(/non-negative integer/);
  });
});

describe('isDerivedRegionId', () => {
  it('accepts any id starting with `region_`', () => {
    expect(isDerivedRegionId(makeRegionId(['A', 'B']))).toBe(true);
    expect(isDerivedRegionId('region_42')).toBe(true);
    expect(isDerivedRegionId('region_lane_3_CW_2')).toBe(true);
  });

  it('rejects ids that do not start with `region_`', () => {
    expect(isDerivedRegionId('Region_42')).toBe(false); // capital R
    expect(isDerivedRegionId('overlap_a_b')).toBe(false);
    expect(isDerivedRegionId('')).toBe(false);
  });
});

describe('namespace isolation between region and overlap ids', () => {
  it('region_ id is NOT detected as overlap', () => {
    const rid = makeRegionId(['A', 'B']);
    expect(isDerivedOverlapId(rid)).toBe(false);
  });

  it('overlap_ id is NOT detected as region', () => {
    const oid = makeOverlapId(['A', 'B']);
    expect(isDerivedRegionId(oid)).toBe(false);
  });
});
