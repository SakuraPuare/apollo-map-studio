import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LaneEntity, ObjectOverlapInfo, OverlapEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import type * as ComputeLaneSModule from '../computeLaneS';
import { clearLaneArcLengthCache } from '../computeLaneS';
import { makeOverlapId } from '../overlapId';
import { reconcileOverlaps, invalidateLaneCaches } from '../reconcile';
import { REGION_OVERLAPS_OVERRIDE_PATH } from '../overridePaths';
import { SpatialIndex, resetSharedSpatialIndex } from '../spatialIndex';
import { entityMap, makeCrosswalk, makeLane, pt } from './testHelpers';

const computeLaneSMocks = vi.hoisted(() => ({
  invalidateLaneArcLength: vi.fn(),
}));

vi.mock('../computeLaneS', async (importOriginal) => {
  const actual = await importOriginal<typeof ComputeLaneSModule>();
  return {
    ...actual,
    invalidateLaneArcLength: computeLaneSMocks.invalidateLaneArcLength,
  };
});

class GuardedEntityMap implements ReadonlyMap<string, MapEntity> {
  constructor(private readonly backing: Map<string, MapEntity>) {}

  get size(): number {
    return this.backing.size;
  }

  get(key: string): MapEntity | undefined {
    return this.backing.get(key);
  }

  has(key: string): boolean {
    return this.backing.has(key);
  }

  entries(): MapIterator<[string, MapEntity]> {
    throw new Error('unexpected full iteration in incremental reconcile');
  }

  keys(): MapIterator<string> {
    throw new Error('unexpected full iteration in incremental reconcile');
  }

  values(): MapIterator<MapEntity> {
    throw new Error('unexpected full iteration in incremental reconcile');
  }

  forEach(): void {
    throw new Error('unexpected full iteration in incremental reconcile');
  }

  [Symbol.iterator](): MapIterator<[string, MapEntity]> {
    throw new Error('unexpected full iteration in incremental reconcile');
  }
}

function crossingLane(id = 'Lane_1'): LaneEntity {
  return makeLane(id, [pt(116, 39.9), pt(116.0005, 39.9)]);
}

function crosswalkSquare(id = 'Crosswalk_1') {
  return makeCrosswalk(id, [
    pt(116.00015, 39.8999),
    pt(116.00035, 39.8999),
    pt(116.00035, 39.9001),
    pt(116.00015, 39.9001),
  ]);
}

function farCrosswalkSquare(id: string) {
  return makeCrosswalk(id, [
    pt(117, 40),
    pt(117.0002, 40),
    pt(117.0002, 40.0002),
    pt(117, 40.0002),
  ]);
}

function pinnedRegionPoints() {
  return [pt(999, 999), pt(1000, 999), pt(1000, 1000), pt(999, 1000)];
}

function buildIndex(entities: ReadonlyMap<string, MapEntity>): SpatialIndex {
  const index = new SpatialIndex();
  index.syncFromEntities(entities);
  return index;
}

interface TestLaneOverlapInfo {
  startS?: number;
  endS?: number;
  isMerge?: boolean;
  regionOverlapId?: string;
}

function laneObject(objectId: string, laneOverlapInfo: TestLaneOverlapInfo): ObjectOverlapInfo {
  return { objectType: 'lane', objectId, laneOverlapInfo };
}

describe('reconcileOverlaps incremental edge branches', () => {
  beforeEach(() => {
    clearLaneArcLengthCache();
    resetSharedSpatialIndex();
    computeLaneSMocks.invalidateLaneArcLength.mockClear();
  });

  it('ignores missing dirty ids without falling back to full entity iteration', () => {
    const lane = crossingLane();
    const crosswalk = crosswalkSquare();
    const entities = entityMap(lane, crosswalk);
    const index = buildIndex(entities);

    const patch = reconcileOverlaps(
      new GuardedEntityMap(entities),
      { mode: 'incremental', dirtyIds: new Set(['Missing_dirty_id']) },
      index,
    );

    expect(patch.changes.size).toBe(0);
    expect(patch.removedOverlapIds.size).toBe(0);
    expect(patch.stats.pairsTested).toBe(0);
    expect(patch.stats.pairsMatched).toBe(0);
  });

  it('skips stale overlapIds that point at non-overlap entities', () => {
    const staleId = 'overlap_stale_crosswalk_entity';
    const lane = makeLane('Lane_stale_ref', [pt(116, 39.9), pt(116.0005, 39.9)], {
      overlapIds: [staleId],
    });
    const staleEntity = farCrosswalkSquare(staleId);
    const entities = entityMap(lane, staleEntity);
    const index = buildIndex(entities);

    const patch = reconcileOverlaps(
      entities,
      { mode: 'incremental', dirtyIds: new Set([lane.id]) },
      index,
    );

    expect(patch.removedOverlapIds.has(staleId)).toBe(false);
    expect(patch.changes.has(staleId)).toBe(false);
    expect((patch.changes.get(lane.id) as LaneEntity | undefined)?.overlapIds).toEqual([]);
  });

  it('removes an existing overlap and cleans the remaining participant when another participant is gone', () => {
    const removedCrosswalkId = 'Crosswalk_removed';
    const overlapId = makeOverlapId(['Lane_remaining', removedCrosswalkId]);
    const lane = makeLane('Lane_remaining', [pt(116, 39.9), pt(116.0005, 39.9)], {
      overlapIds: [overlapId],
    });
    const oldOverlap: OverlapEntity = {
      id: overlapId,
      entityType: 'overlap',
      objects: [
        laneObject(lane.id, { startS: 0, endS: 10 }),
        { objectType: 'crosswalk', objectId: removedCrosswalkId },
      ],
      regionOverlaps: [],
    };
    const entities = entityMap(lane, oldOverlap);
    const index = buildIndex(entities);

    const patch = reconcileOverlaps(
      entities,
      { mode: 'incremental', dirtyIds: new Set([lane.id, removedCrosswalkId]) },
      index,
    );

    expect(patch.removedOverlapIds).toEqual(new Set([overlapId]));
    expect((patch.changes.get(lane.id) as LaneEntity | undefined)?.overlapIds).toEqual([]);
    expect(patch.changes.has(removedCrosswalkId)).toBe(false);
  });

  it('preserves a pinned legacy crosswalk object without adding a missing regionOverlapId', () => {
    const lane = crossingLane();
    const crosswalk = crosswalkSquare();
    const overlapId = makeOverlapId([lane.id, crosswalk.id]);
    lane.overlapIds = [overlapId];
    crosswalk.overlapIds = [overlapId];
    const legacyPinnedOverlap: OverlapEntity = {
      id: overlapId,
      entityType: 'overlap',
      objects: [
        laneObject(lane.id, { startS: 100, endS: 200 }),
        { objectType: 'crosswalk', objectId: crosswalk.id },
      ],
      regionOverlaps: [
        { id: 'Region_legacy_pinned', polygons: [{ points: pinnedRegionPoints() }] },
      ],
      _userOverrides: [REGION_OVERLAPS_OVERRIDE_PATH],
    };
    const entities = entityMap(lane, crosswalk, legacyPinnedOverlap);
    const index = buildIndex(entities);

    const patch = reconcileOverlaps(
      entities,
      { mode: 'incremental', dirtyIds: new Set([crosswalk.id]) },
      index,
    );

    const updated = patch.changes.get(overlapId) as OverlapEntity | undefined;
    expect(updated).toBeDefined();
    expect(updated?.regionOverlaps).toEqual(legacyPinnedOverlap.regionOverlaps);
    const updatedLane = updated?.objects.find((object) => object.objectType === 'lane');
    const updatedCrosswalk = updated?.objects.find((object) => object.objectType === 'crosswalk');
    if (updatedLane?.objectType === 'lane') {
      expect(updatedLane.laneOverlapInfo.regionOverlapId).toBeUndefined();
    }
    expect(updatedCrosswalk).toEqual({ objectType: 'crosswalk', objectId: crosswalk.id });
  });

  it('exports invalidateLaneCaches as an iterable forwarder to lane arc-length invalidation', () => {
    function* removedLaneIds() {
      yield 'Lane_removed_A';
      yield 'Lane_removed_B';
    }

    invalidateLaneCaches(removedLaneIds());

    expect(computeLaneSMocks.invalidateLaneArcLength).toHaveBeenCalledTimes(2);
    expect(computeLaneSMocks.invalidateLaneArcLength).toHaveBeenNthCalledWith(1, 'Lane_removed_A');
    expect(computeLaneSMocks.invalidateLaneArcLength).toHaveBeenNthCalledWith(2, 'Lane_removed_B');
  });
});
