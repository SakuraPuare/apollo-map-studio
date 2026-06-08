import { describe, expect, it } from 'vitest';
import {
  REGION_OVERLAPS_OVERRIDE_PATH,
  laneIsMergeOverridePath,
  parseLaneIsMergeOverride,
} from '../overridePaths';

describe('overridePaths', () => {
  it('builds lane isMerge override paths by object index', () => {
    expect(laneIsMergeOverridePath(0)).toBe('objects.0.laneOverlapInfo.isMerge');
    expect(laneIsMergeOverridePath(12)).toBe('objects.12.laneOverlapInfo.isMerge');
  });

  it('parses valid lane isMerge override paths', () => {
    expect(parseLaneIsMergeOverride('objects.0.laneOverlapInfo.isMerge')).toBe(0);
    expect(parseLaneIsMergeOverride('objects.42.laneOverlapInfo.isMerge')).toBe(42);
  });

  it('rejects malformed lane isMerge override paths', () => {
    expect(parseLaneIsMergeOverride('objects.-1.laneOverlapInfo.isMerge')).toBeNull();
    expect(parseLaneIsMergeOverride('objects.foo.laneOverlapInfo.isMerge')).toBeNull();
    expect(parseLaneIsMergeOverride('objects.1.laneOverlapInfo.startS')).toBeNull();
    expect(parseLaneIsMergeOverride('objects.1.laneOverlapInfo.isMerge.extra')).toBeNull();
  });

  it('rejects non-finite parsed indices', () => {
    expect(
      parseLaneIsMergeOverride(`objects.${'9'.repeat(400)}.laneOverlapInfo.isMerge`),
    ).toBeNull();
  });

  it('exports the region overlap pin path used by reconcile', () => {
    expect(REGION_OVERLAPS_OVERRIDE_PATH).toBe('regionOverlaps');
  });
});
