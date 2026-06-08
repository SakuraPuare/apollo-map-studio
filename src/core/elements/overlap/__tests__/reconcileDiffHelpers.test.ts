import { describe, expect, it } from 'vitest';
import type { ObjectOverlapInfo, OverlapEntity, RegionOverlapInfo } from '@/types/apollo';
import {
  isRegionOverlapsPinned,
  objectsExactlyEqual,
  regionOverlapsEqual,
} from '../reconcileDiffHelpers';
import { REGION_OVERLAPS_OVERRIDE_PATH } from '../overridePaths';

type LaneOverlapInfo = Extract<ObjectOverlapInfo, { objectType: 'lane' }>['laneOverlapInfo'];

function pt(x: number, y: number) {
  return { x, y };
}

function overlap(overrides?: string[]): OverlapEntity {
  const entity: OverlapEntity = {
    id: 'overlap_1',
    entityType: 'overlap',
    objects: [],
    regionOverlaps: [],
  };
  if (overrides) entity._userOverrides = overrides;
  return entity;
}

function region(points = [pt(0, 0), pt(1, 0), pt(0, 1)]): RegionOverlapInfo {
  return { id: 'region_1', polygons: [{ points }] };
}

function laneObject(objectId: string, laneOverlapInfo: LaneOverlapInfo = {}): ObjectOverlapInfo {
  return { objectType: 'lane', objectId, laneOverlapInfo };
}

describe('isRegionOverlapsPinned', () => {
  it('detects region overlap pin paths', () => {
    expect(isRegionOverlapsPinned(overlap())).toBe(false);
    expect(isRegionOverlapsPinned(overlap([]))).toBe(false);
    expect(isRegionOverlapsPinned(overlap(['objects.0.laneOverlapInfo.isMerge']))).toBe(false);
    expect(
      isRegionOverlapsPinned(
        overlap(['objects.0.laneOverlapInfo.isMerge', REGION_OVERLAPS_OVERRIDE_PATH]),
      ),
    ).toBe(true);
  });
});

describe('regionOverlapsEqual', () => {
  it('compares region ids, polygon counts, point counts, and point coordinates', () => {
    const base = [region()];

    expect(regionOverlapsEqual(base, [region()])).toBe(true);
    expect(regionOverlapsEqual(base, [])).toBe(false);
    expect(regionOverlapsEqual(base, [{ ...region(), id: 'region_2' }])).toBe(false);
    expect(regionOverlapsEqual(base, [{ id: 'region_1', polygons: [] }])).toBe(false);
    expect(regionOverlapsEqual(base, [region([pt(0, 0), pt(1, 0)])])).toBe(false);
    expect(regionOverlapsEqual(base, [region([pt(0, 0), pt(2, 0), pt(0, 1)])])).toBe(false);
    expect(regionOverlapsEqual(base, [region([pt(0, 0), pt(1, 0), pt(0, 2)])])).toBe(false);
  });
});

describe('objectsExactlyEqual', () => {
  it('compares non-lane objects by type and id', () => {
    const signal: ObjectOverlapInfo = { objectType: 'signal', objectId: 'S1' };

    expect(objectsExactlyEqual([signal], [{ objectType: 'signal', objectId: 'S1' }])).toBe(true);
    expect(objectsExactlyEqual([signal], [])).toBe(false);
    expect(objectsExactlyEqual([signal], [{ objectType: 'stopSign', objectId: 'S1' }])).toBe(false);
    expect(objectsExactlyEqual([signal], [{ objectType: 'signal', objectId: 'S2' }])).toBe(false);
  });

  it('compares lane overlap fields while normalizing optional defaults', () => {
    expect(
      objectsExactlyEqual(
        [laneObject('L1', { startS: 1, endS: 2, isMerge: false })],
        [laneObject('L1', { startS: 1, endS: 2 })],
      ),
    ).toBe(true);
    expect(
      objectsExactlyEqual([laneObject('L1')], [laneObject('L1', { regionOverlapId: '' })]),
    ).toBe(true);
    expect(
      objectsExactlyEqual([laneObject('L1', { startS: 1 })], [laneObject('L1', { startS: 2 })]),
    ).toBe(false);
    expect(
      objectsExactlyEqual([laneObject('L1', { endS: 1 })], [laneObject('L1', { endS: 2 })]),
    ).toBe(false);
    expect(
      objectsExactlyEqual(
        [laneObject('L1', { isMerge: true })],
        [laneObject('L1', { isMerge: false })],
      ),
    ).toBe(false);
    expect(
      objectsExactlyEqual(
        [laneObject('L1', { regionOverlapId: 'region_1' })],
        [laneObject('L1', { regionOverlapId: 'region_2' })],
      ),
    ).toBe(false);
  });
});
