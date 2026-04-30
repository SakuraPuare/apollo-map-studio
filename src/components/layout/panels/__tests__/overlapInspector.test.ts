/**
 * Inspector pin contract — pure transforms.
 *
 * 这层和 reconcile.test.ts 的 "honors `_userOverrides: ['regionOverlaps']`"
 * 配合形成端到端闭环：
 *   - 这里测 UI 写出的 _userOverrides 形状（withOverride / clearOverride）
 *   - reconcile 那边测被钉住后 polygon / regionOverlapId 不被覆盖
 * 路径常量 REGION_OVERLAPS_OVERRIDE_PATH 是两端的合同。
 */
import { describe, it, expect } from 'vitest';
import {
  withOverride,
  clearOverride,
  REGION_OVERLAPS_OVERRIDE_PATH,
} from '../InspectorForms/overlap';
import type { OverlapEntity } from '@/types/apollo';

function makeOverlap(overrides: Partial<OverlapEntity> = {}): OverlapEntity {
  return {
    id: 'Overlap_test',
    entityType: 'overlap',
    objects: [],
    regionOverlaps: [],
    ...overrides,
  };
}

describe('overlap inspector pin transforms', () => {
  it('withOverride adds the path on a fresh entity', () => {
    const e = makeOverlap();
    const next = withOverride(e, REGION_OVERLAPS_OVERRIDE_PATH);
    expect(next._userOverrides).toEqual(['regionOverlaps']);
  });

  it('withOverride is idempotent — adding twice is a no-op (same reference)', () => {
    const e = makeOverlap({ _userOverrides: ['regionOverlaps'] });
    const next = withOverride(e, REGION_OVERLAPS_OVERRIDE_PATH);
    expect(next).toBe(e);
  });

  it('withOverride preserves other paths (e.g. an isMerge pin) when adding region pin', () => {
    const e = makeOverlap({
      _userOverrides: ['objects.0.laneOverlapInfo.isMerge'],
    });
    const next = withOverride(e, REGION_OVERLAPS_OVERRIDE_PATH);
    expect(next._userOverrides).toEqual(['objects.0.laneOverlapInfo.isMerge', 'regionOverlaps']);
  });

  it('clearOverride removes the path', () => {
    const e = makeOverlap({ _userOverrides: ['regionOverlaps'] });
    const next = clearOverride(e, REGION_OVERLAPS_OVERRIDE_PATH);
    expect(next._userOverrides).toBeUndefined();
  });

  it('clearOverride preserves sibling pins', () => {
    const e = makeOverlap({
      _userOverrides: ['objects.0.laneOverlapInfo.isMerge', 'regionOverlaps'],
    });
    const next = clearOverride(e, REGION_OVERLAPS_OVERRIDE_PATH);
    expect(next._userOverrides).toEqual(['objects.0.laneOverlapInfo.isMerge']);
  });

  it('clearOverride is a no-op when the path is not present', () => {
    const e = makeOverlap({
      _userOverrides: ['objects.0.laneOverlapInfo.isMerge'],
    });
    const next = clearOverride(e, REGION_OVERLAPS_OVERRIDE_PATH);
    expect(next).toBe(e);
  });

  it('REGION_OVERLAPS_OVERRIDE_PATH matches the literal string consumed by reconcile', () => {
    // Hard contract — if reconcile changes the path, both ends must move.
    expect(REGION_OVERLAPS_OVERRIDE_PATH).toBe('regionOverlaps');
  });
});
