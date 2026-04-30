/**
 * Tests for makeOverlapId / isDerivedOverlapId — Apollo-aligned semantic ids.
 *
 * 覆盖：empty 守卫 / dedup / 顺序无关 / isDerivedOverlapId happy path.
 */
import { describe, it, expect } from 'vitest';
import { makeOverlapId, isDerivedOverlapId } from '../overlapId';

describe('makeOverlapId', () => {
  it('throws on empty participants array', () => {
    expect(() => makeOverlapId([])).toThrow(/non-empty/);
  });

  it('dedupes duplicate participants before sorting', () => {
    expect(makeOverlapId(['A', 'A', 'B'])).toBe('overlap_A_B');
    expect(makeOverlapId(['B', 'A', 'B', 'A'])).toBe('overlap_A_B');
  });

  it('is order-invariant (sorted internally)', () => {
    const id1 = makeOverlapId(['lane_3', 'CW_2']);
    const id2 = makeOverlapId(['CW_2', 'lane_3']);
    expect(id1).toBe(id2);
  });

  it('matches the Apollo-style semantic shape: `overlap_<sortedParticipants>`', () => {
    // Lex sort: 'CW_2' < 'lane_3' (uppercase < lowercase)
    expect(makeOverlapId(['lane_3', 'CW_2'])).toBe('overlap_CW_2_lane_3');
  });
});

describe('isDerivedOverlapId', () => {
  it('accepts ids produced by makeOverlapId', () => {
    expect(isDerivedOverlapId(makeOverlapId(['A', 'B']))).toBe(true);
    expect(isDerivedOverlapId(makeOverlapId(['lane_3', 'signal_0']))).toBe(true);
  });

  it('accepts any id starting with `overlap_`', () => {
    expect(isDerivedOverlapId('overlap_42')).toBe(true);
    expect(isDerivedOverlapId('overlap_signal_0_lane_35')).toBe(true);
  });

  it('rejects ids that do not start with `overlap_`', () => {
    expect(isDerivedOverlapId('Overlap_42')).toBe(false); // capital O
    expect(isDerivedOverlapId('region_a_b')).toBe(false);
    expect(isDerivedOverlapId('')).toBe(false);
  });
});
