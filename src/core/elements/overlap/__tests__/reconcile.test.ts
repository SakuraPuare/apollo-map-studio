import { beforeEach, describe, it, expect } from 'vitest';
import type {
  Curve,
  JunctionEntity,
  LaneEntity,
  OverlapEntity,
  CrosswalkEntity,
} from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import { reconcileOverlaps } from '../reconcile';
import { clearLaneArcLengthCache } from '../computeLaneS';
import { isDerivedOverlapId, makeOverlapId } from '../overlapId';
import { resetSharedSpatialIndex } from '../spatialIndex';

function curve(points: { x: number; y: number }[]): Curve {
  return {
    segments: [
      {
        s: 0,
        startPosition: points[0]!,
        heading: 0,
        length: 0,
        lineSegment: { points },
      },
    ],
  };
}

function makeLane(id: string, points: { x: number; y: number }[]): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: curve(points),
    leftBoundary: { curve: curve(points), length: 0, boundaryType: [] },
    rightBoundary: { curve: curve(points), length: 0, boundaryType: [] },
    length: 0,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 13.89,
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
}

function makeJunction(id: string, points: { x: number; y: number }[]): JunctionEntity {
  return {
    id,
    entityType: 'junction',
    polygon: { points },
    type: 'CROSS_ROAD',
    overlapIds: [],
  };
}

function makeCrosswalk(id: string, points: { x: number; y: number }[]): CrosswalkEntity {
  return {
    id,
    entityType: 'crosswalk',
    polygon: { points },
    overlapIds: [],
  };
}

function buildMap(...entities: MapEntity[]): Map<string, MapEntity> {
  const m = new Map<string, MapEntity>();
  for (const e of entities) m.set(e.id, e);
  return m;
}

describe('reconcileOverlaps', () => {
  beforeEach(() => {
    clearLaneArcLengthCache();
    resetSharedSpatialIndex();
  });

  it('creates an overlap when a lane crosses a junction', () => {
    const lane = makeLane('Lane_1', [
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    const junction = makeJunction('Junction_1', [
      { x: 116.0001, y: 39.8999 },
      { x: 116.0003, y: 39.8999 },
      { x: 116.0003, y: 39.9001 },
      { x: 116.0001, y: 39.9001 },
    ]);

    const entities = buildMap(lane, junction);
    const patch = reconcileOverlaps(entities, { mode: 'full' });

    const overlapEntries = [...patch.changes.values()].filter(
      (e) => e.entityType === 'overlap',
    ) as OverlapEntity[];
    expect(overlapEntries.length).toBe(1);
    const overlap = overlapEntries[0]!;
    expect(isDerivedOverlapId(overlap.id)).toBe(true);
    expect(overlap.objects.length).toBe(2);

    const expectedId = makeOverlapId(['Lane_1', 'Junction_1']);
    expect(overlap.id).toBe(expectedId);

    const updatedLane = patch.changes.get('Lane_1') as LaneEntity | undefined;
    expect(updatedLane?.overlapIds).toContain(expectedId);
    const updatedJunction = patch.changes.get('Junction_1') as JunctionEntity | undefined;
    expect(updatedJunction?.overlapIds).toContain(expectedId);
  });

  it('drops a derived overlap when geometry no longer intersects', () => {
    const lane = makeLane('Lane_1', [
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    const junction = makeJunction('Junction_1', [
      { x: 116.0001, y: 39.8999 },
      { x: 116.0003, y: 39.8999 },
      { x: 116.0003, y: 39.9001 },
      { x: 116.0001, y: 39.9001 },
    ]);

    const expectedId = makeOverlapId([lane.id, junction.id]);
    const overlap: OverlapEntity = {
      id: expectedId,
      entityType: 'overlap',
      objects: [
        {
          objectType: 'lane',
          objectId: lane.id,
          laneOverlapInfo: { startS: 0, endS: 1 },
        },
        { objectType: 'junction', objectId: junction.id },
      ],
      regionOverlaps: [],
    };
    lane.overlapIds = [expectedId];
    junction.overlapIds = [expectedId];

    // Now move the lane far away so it no longer crosses the junction
    const movedLane = makeLane('Lane_1', [
      { x: 117.0, y: 40.0 },
      { x: 117.0005, y: 40.0 },
    ]);
    movedLane.overlapIds = [expectedId];

    const entities = buildMap(movedLane, junction, overlap);
    const patch = reconcileOverlaps(entities, { mode: 'full' });

    expect(patch.removedOverlapIds.has(expectedId)).toBe(true);
  });

  it('B.3: Apollo-imported overlap with non-canonical id is normalized to canonical sorted form on reconcile', () => {
    // Apollo data ships overlap ids like `overlap_signal_0_lane_35` (Apollo's
    // own ordering). Our canonical form is sorted: `overlap_lane_35_signal_0`.
    // Under B.3 there is no "imported preserve" branch — the old id is dropped
    // and the canonical-id overlap is recreated from geometry.
    const lane = makeLane('lane_1', [
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    const junction = makeJunction('J_1', [
      { x: 116.0001, y: 39.8999 },
      { x: 116.0003, y: 39.8999 },
      { x: 116.0003, y: 39.9001 },
      { x: 116.0001, y: 39.9001 },
    ]);
    const apolloStyleId = 'overlap_J_1_lane_1_legacy_form'; // not canonical sort
    const apolloOverlap: OverlapEntity = {
      id: apolloStyleId,
      entityType: 'overlap',
      objects: [
        {
          objectType: 'lane',
          objectId: lane.id,
          laneOverlapInfo: { startS: 0, endS: 5 },
        },
        { objectType: 'junction', objectId: junction.id },
      ],
      regionOverlaps: [],
    };

    const entities = buildMap(lane, junction, apolloOverlap);
    const patch = reconcileOverlaps(entities, { mode: 'full' });

    // Old non-canonical id is dropped …
    expect(patch.removedOverlapIds.has(apolloStyleId)).toBe(true);
    // … and the canonical-id overlap is recreated from geometric truth.
    const canonicalId = makeOverlapId(['lane_1', 'J_1']);
    expect(patch.changes.has(canonicalId)).toBe(true);
  });

  it('B.3: Apollo-imported overlap with no geometric hit is dropped (derive-only semantics)', () => {
    // Pre-B.3 this returned false ("preserve imported"). Post-B.3 every
    // overlap is geometric — non-overlapping participants → no overlap.
    const lane = makeLane('lane_1', [
      { x: 117.0, y: 40.0 },
      { x: 117.0005, y: 40.0 },
    ]);
    const junction = makeJunction('J_1', [
      { x: 116.0, y: 39.9 },
      { x: 116.0001, y: 39.9 },
      { x: 116.0001, y: 39.9001 },
      { x: 116.0, y: 39.9001 },
    ]);
    const importedOverlap: OverlapEntity = {
      id: 'overlap_imported_42',
      entityType: 'overlap',
      objects: [
        {
          objectType: 'lane',
          objectId: lane.id,
          laneOverlapInfo: { startS: 0, endS: 5 },
        },
        { objectType: 'junction', objectId: junction.id },
      ],
      regionOverlaps: [],
    };

    const entities = buildMap(lane, junction, importedOverlap);
    const patch = reconcileOverlaps(entities, { mode: 'full' });

    expect(patch.removedOverlapIds.has('overlap_imported_42')).toBe(true);
  });

  it('removes imported overlap when participant entity is gone', () => {
    const lane = makeLane('Lane_1', [
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    const importedOverlap: OverlapEntity = {
      id: 'overlap_orphan',
      entityType: 'overlap',
      objects: [
        {
          objectType: 'lane',
          objectId: lane.id,
          laneOverlapInfo: { startS: 0, endS: 5 },
        },
        { objectType: 'junction', objectId: 'Junction_GHOST' },
      ],
      regionOverlaps: [],
    };

    const entities = buildMap(lane, importedOverlap);
    const patch = reconcileOverlaps(entities, { mode: 'full' });

    expect(patch.removedOverlapIds.has('overlap_orphan')).toBe(true);
  });

  it('preserves user-pinned isMerge across reconcile', () => {
    // Two lanes converging at the same end point → derived isMerge=true
    const laneA = makeLane('Lane_A', [
      { x: 116.0, y: 39.9 },
      { x: 116.001, y: 39.9 },
    ]);
    const laneB = makeLane('Lane_B', [
      { x: 116.0, y: 39.9001 },
      { x: 116.001, y: 39.9 },
    ]);
    laneA.junctionId = 'J';
    laneB.junctionId = 'J';
    const junction = makeJunction('J', [
      { x: 115.9999, y: 39.8999 },
      { x: 116.0011, y: 39.8999 },
      { x: 116.0011, y: 39.9002 },
      { x: 115.9999, y: 39.9002 },
    ]);

    const initial = buildMap(laneA, laneB, junction);
    const patch1 = reconcileOverlaps(initial, { mode: 'full' });

    const stable = new Map(initial);
    for (const [id, e] of patch1.changes) stable.set(id, e);
    for (const id of patch1.removedOverlapIds) stable.delete(id);

    const overlapId = makeOverlapId(['Lane_A', 'Lane_B']);
    const ov = stable.get(overlapId) as OverlapEntity | undefined;
    expect(ov).toBeDefined();
    expect(ov!.objects.length).toBe(2);
    // The lane×lane derived overlap should default to isMerge=true based on endpoint coincidence
    const aInfo = ov!.objects.find(
      (o): o is Extract<typeof o, { objectType: 'lane' }> =>
        o.objectType === 'lane' && o.objectId === 'Lane_A',
    );
    expect(aInfo?.laneOverlapInfo.isMerge).toBe(true);

    // The override path index depends on iteration order — find which slot Lane_A is in
    const aIdx = ov!.objects.findIndex((o) => o.objectType === 'lane' && o.objectId === 'Lane_A');
    const pinnedOv: OverlapEntity = {
      ...ov!,
      objects: ov!.objects.map((o, i) => {
        if (i !== aIdx || o.objectType !== 'lane') return o;
        return {
          ...o,
          laneOverlapInfo: { ...o.laneOverlapInfo, isMerge: false },
        };
      }),
      _userOverrides: [`objects.${aIdx}.laneOverlapInfo.isMerge`],
    };
    stable.set(overlapId, pinnedOv);

    // Re-run reconcile — geometry still says isMerge=true, but the pin must hold
    const patch2 = reconcileOverlaps(stable, { mode: 'full' });
    const after = (patch2.changes.get(overlapId) ?? stable.get(overlapId)) as OverlapEntity;
    const aAfter = after.objects[aIdx];
    expect(aAfter?.objectType).toBe('lane');
    if (aAfter?.objectType === 'lane') {
      expect(aAfter.laneOverlapInfo.isMerge).toBe(false); // pinned value held
    }
  });

  it('emits lane×lane overlap when centerlines cross outside any junction (GAP-2)', () => {
    // Two lanes physically cross (e.g. ramp / overpass scenario) but neither
    // belongs to a junction. Old gate `if (!laneA.junctionId || ...) return`
    // dropped this entirely; new rule keeps the cross-detection branch.
    const horizontal = makeLane('Lane_H', [
      { x: 116.0, y: 39.9 },
      { x: 116.001, y: 39.9 },
    ]);
    const vertical = makeLane('Lane_V', [
      { x: 116.0005, y: 39.8995 },
      { x: 116.0005, y: 39.9005 },
    ]);
    // junctionId left null on both
    const entities = buildMap(horizontal, vertical);
    const patch = reconcileOverlaps(entities, { mode: 'full' });
    const overlapId = makeOverlapId(['Lane_H', 'Lane_V']);
    expect(patch.changes.has(overlapId)).toBe(true);
    const ov = patch.changes.get(overlapId) as OverlapEntity;
    // Pure crossing, no merging endpoints → isMerge=false
    const hInfo = ov.objects.find((o) => o.objectType === 'lane' && o.objectId === 'Lane_H');
    if (hInfo?.objectType === 'lane') {
      expect(hInfo.laneOverlapInfo.isMerge ?? false).toBe(false);
    }
  });

  it('does NOT emit lane×lane overlap when only START endpoints coincide outside junction (GAP-7 / pred-succ semantics)', () => {
    // Two lanes diverging from the same point (a fork) — outside any junction
    // this is a successor/predecessor relationship, NOT an overlap. The pure
    // lane graph topology already expresses this; emitting an Overlap here
    // would double-count the relationship.
    const a = makeLane('Lane_A', [
      { x: 116.0, y: 39.9 },
      { x: 116.001, y: 39.9 },
    ]);
    const b = makeLane('Lane_B', [
      { x: 116.0, y: 39.9 }, // same start as A
      { x: 116.001, y: 39.901 }, // diverging
    ]);
    const entities = buildMap(a, b);
    const patch = reconcileOverlaps(entities, { mode: 'full' });
    const overlapId = makeOverlapId(['Lane_A', 'Lane_B']);
    expect(patch.changes.has(overlapId)).toBe(false);
  });

  it('mergeAtStart inside junction still emits overlap, but isMerge stays false (GAP-7)', () => {
    // Inside a junction, two lanes sharing a START point is a split/fork — it
    // IS a trajectory conflict, so emit overlap. But Apollo `is_merge` means
    // "merging into" — start-fork is not a merge. isMerge must be false.
    const a = makeLane('Lane_A', [
      { x: 116.0, y: 39.9 },
      { x: 116.001, y: 39.9 },
    ]);
    const b = makeLane('Lane_B', [
      { x: 116.0, y: 39.9 }, // same start as A
      { x: 116.001, y: 39.901 },
    ]);
    a.junctionId = 'J';
    b.junctionId = 'J';
    const j = makeJunction('J', [
      { x: 115.999, y: 39.899 },
      { x: 116.002, y: 39.899 },
      { x: 116.002, y: 39.902 },
      { x: 115.999, y: 39.902 },
    ]);
    const entities = buildMap(a, b, j);
    const patch = reconcileOverlaps(entities, { mode: 'full' });
    const overlapId = makeOverlapId(['Lane_A', 'Lane_B']);
    const ov = patch.changes.get(overlapId) as OverlapEntity | undefined;
    expect(ov).toBeDefined();
    const aInfo = ov!.objects.find((o) => o.objectType === 'lane' && o.objectId === 'Lane_A');
    if (aInfo?.objectType === 'lane') {
      expect(aInfo.laneOverlapInfo.isMerge ?? false).toBe(false);
    }
  });

  it('incremental mode emits a lane×other pair regardless of which side is dirty (GAP-3)', () => {
    // Regression: the old `lane.id < lo.id` ordering gate silently dropped
    // pairs whose dirty side had the lex-larger id. With makeOverlapId-based
    // dedup, marking either lane dirty must yield the same overlap.
    const laneSmall = makeLane('Lane_AAA', [
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    const laneLarge = makeLane('Lane_ZZZ', [
      { x: 116.00025, y: 39.8999 },
      { x: 116.00025, y: 39.9001 },
    ]);
    laneSmall.junctionId = 'J1';
    laneLarge.junctionId = 'J1';
    const junction = makeJunction('J1', [
      { x: 115.9999, y: 39.8998 },
      { x: 116.0006, y: 39.8998 },
      { x: 116.0006, y: 39.9002 },
      { x: 115.9999, y: 39.9002 },
    ]);
    const entities = buildMap(laneSmall, laneLarge, junction);
    const expectedId = makeOverlapId(['Lane_AAA', 'Lane_ZZZ']);

    // Mark only the lex-larger lane as dirty — old code would skip this pair
    // (because Lane_ZZZ < Lane_AAA is false).
    const patchLarge = reconcileOverlaps(entities, {
      mode: 'incremental',
      dirtyIds: new Set(['Lane_ZZZ']),
    });
    expect(patchLarge.changes.has(expectedId)).toBe(true);

    // And reverse: marking only the lex-smaller side must also emit.
    const patchSmall = reconcileOverlaps(entities, {
      mode: 'incremental',
      dirtyIds: new Set(['Lane_AAA']),
    });
    expect(patchSmall.changes.has(expectedId)).toBe(true);
  });

  // ── GAP-5 Sprint 2 / Sprint 3: region_overlap auto-derivation ──

  it('auto-derives a RegionOverlapInfo for crosswalk × lane (GAP-5)', async () => {
    const { makeRegionId } = await import('../regionId');
    const lane = makeLane('Lane_1', [
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    const cw = makeCrosswalk('Crosswalk_1', [
      { x: 116.00015, y: 39.8999 },
      { x: 116.00035, y: 39.8999 },
      { x: 116.00035, y: 39.9001 },
      { x: 116.00015, y: 39.9001 },
    ]);

    const entities = buildMap(lane, cw);
    const patch = reconcileOverlaps(entities, { mode: 'full' });

    const overlapId = makeOverlapId(['Lane_1', 'Crosswalk_1']);
    const ov = patch.changes.get(overlapId) as OverlapEntity | undefined;
    expect(ov).toBeDefined();
    expect(ov!.regionOverlaps.length).toBe(1);

    const expectedRegionId = makeRegionId(['Lane_1', 'Crosswalk_1']);
    expect(ov!.regionOverlaps[0]!.id).toBe(expectedRegionId);
    expect(ov!.regionOverlaps[0]!.polygons.length).toBe(1);
    expect(ov!.regionOverlaps[0]!.polygons[0]!.points.length).toBeGreaterThanOrEqual(3);

    // Both lane-side and crosswalk-side ObjectOverlapInfo carry the region id
    const laneSide = ov!.objects.find((o) => o.objectType === 'lane');
    const cwSide = ov!.objects.find((o) => o.objectType === 'crosswalk');
    if (laneSide?.objectType === 'lane') {
      expect(laneSide.laneOverlapInfo.regionOverlapId).toBe(expectedRegionId);
    }
    if (cwSide?.objectType === 'crosswalk') {
      expect(cwSide.regionOverlapId).toBe(expectedRegionId);
    }
  });

  it('does NOT generate region_overlap for lane × junction (proto only references it from crosswalk side)', () => {
    const lane = makeLane('Lane_1', [
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    const junction = makeJunction('Junction_1', [
      { x: 116.00015, y: 39.8999 },
      { x: 116.00035, y: 39.8999 },
      { x: 116.00035, y: 39.9001 },
      { x: 116.00015, y: 39.9001 },
    ]);

    const entities = buildMap(lane, junction);
    const patch = reconcileOverlaps(entities, { mode: 'full' });

    const overlapId = makeOverlapId(['Lane_1', 'Junction_1']);
    const ov = patch.changes.get(overlapId) as OverlapEntity;
    expect(ov.regionOverlaps).toEqual([]);
    const laneSide = ov.objects.find((o) => o.objectType === 'lane');
    if (laneSide?.objectType === 'lane') {
      expect(laneSide.laneOverlapInfo.regionOverlapId).toBeUndefined();
    }
  });

  it('region polygon recomputes when lane geometry changes', () => {
    const lane = makeLane('Lane_1', [
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    const cw = makeCrosswalk('Crosswalk_1', [
      { x: 116.00015, y: 39.8999 },
      { x: 116.00035, y: 39.8999 },
      { x: 116.00035, y: 39.9001 },
      { x: 116.00015, y: 39.9001 },
    ]);
    const initial = buildMap(lane, cw);
    const patch1 = reconcileOverlaps(initial, { mode: 'full' });
    const overlapId = makeOverlapId(['Lane_1', 'Crosswalk_1']);
    const ov1 = patch1.changes.get(overlapId) as OverlapEntity;
    const points1 = ov1.regionOverlaps[0]!.polygons[0]!.points;

    // Build the next-state map: apply patch1 first, THEN override Lane_1 with
    // moved geometry — patch1.changes carries the original centralCurve, so if
    // we did `buildMap(movedLane, ...)` then applied the patch, the patched
    // Lane_1 would clobber the moved one.
    const after = new Map<string, MapEntity>();
    for (const [id, e] of patch1.changes) after.set(id, e);
    const patchedLane = after.get('Lane_1') as LaneEntity;
    const movedLane: LaneEntity = {
      ...makeLane('Lane_1', [
        { x: 116.0, y: 39.90008 },
        { x: 116.0005, y: 39.90008 },
      ]),
      overlapIds: patchedLane.overlapIds,
    };
    after.set('Lane_1', movedLane);
    after.set('Crosswalk_1', cw);

    const patch2 = reconcileOverlaps(after, { mode: 'full' });
    const ov2 = (patch2.changes.get(overlapId) as OverlapEntity) ?? after.get(overlapId);
    const points2 = (ov2 as OverlapEntity).regionOverlaps[0]!.polygons[0]!.points;
    const sameShape =
      points1.length === points2.length &&
      points1.every((p, i) => p.x === points2[i]!.x && p.y === points2[i]!.y);
    expect(sameShape).toBe(false);
  });

  it('honors `_userOverrides: ["regionOverlaps"]` — pinned region survives reconcile', () => {
    const lane = makeLane('Lane_1', [
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    const cw = makeCrosswalk('Crosswalk_1', [
      { x: 116.00015, y: 39.8999 },
      { x: 116.00035, y: 39.8999 },
      { x: 116.00035, y: 39.9001 },
      { x: 116.00015, y: 39.9001 },
    ]);

    const initial = buildMap(lane, cw);
    const patch1 = reconcileOverlaps(initial, { mode: 'full' });
    const overlapId = makeOverlapId(['Lane_1', 'Crosswalk_1']);

    const stable = new Map(initial);
    for (const [id, e] of patch1.changes) stable.set(id, e);
    const ov = stable.get(overlapId) as OverlapEntity;
    const pinnedPolygon = [
      { x: 999, y: 999 },
      { x: 1000, y: 999 },
      { x: 1000, y: 1000 },
      { x: 999, y: 1000 },
    ];
    const pinnedOv: OverlapEntity = {
      ...ov,
      regionOverlaps: [{ id: 'Region_pinned', polygons: [{ points: pinnedPolygon }] }],
      _userOverrides: ['regionOverlaps'],
    };
    stable.set(overlapId, pinnedOv);

    const patch2 = reconcileOverlaps(stable, { mode: 'full' });
    const after = (patch2.changes.get(overlapId) as OverlapEntity) ?? stable.get(overlapId);
    const final = (after as OverlapEntity).regionOverlaps;
    expect(final.length).toBe(1);
    expect(final[0]!.id).toBe('Region_pinned');
    expect(final[0]!.polygons[0]!.points).toEqual(pinnedPolygon);
  });

  it('two lanes crossing the same crosswalk produce two distinct regions (different overlap ids)', async () => {
    const { makeRegionId } = await import('../regionId');
    const laneA = makeLane('Lane_A', [
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    const laneB = makeLane('Lane_B', [
      { x: 116.0, y: 39.9001 },
      { x: 116.0005, y: 39.9001 },
    ]);
    const cw = makeCrosswalk('Crosswalk_1', [
      { x: 116.00015, y: 39.89985 },
      { x: 116.00035, y: 39.89985 },
      { x: 116.00035, y: 39.90025 },
      { x: 116.00015, y: 39.90025 },
    ]);
    const entities = buildMap(laneA, laneB, cw);
    const patch = reconcileOverlaps(entities, { mode: 'full' });

    const idA = makeOverlapId(['Lane_A', 'Crosswalk_1']);
    const idB = makeOverlapId(['Lane_B', 'Crosswalk_1']);
    const ovA = patch.changes.get(idA) as OverlapEntity;
    const ovB = patch.changes.get(idB) as OverlapEntity;
    expect(ovA.regionOverlaps.length).toBe(1);
    expect(ovB.regionOverlaps.length).toBe(1);
    expect(ovA.regionOverlaps[0]!.id).toBe(makeRegionId(['Lane_A', 'Crosswalk_1']));
    expect(ovB.regionOverlaps[0]!.id).toBe(makeRegionId(['Lane_B', 'Crosswalk_1']));
    expect(ovA.regionOverlaps[0]!.id).not.toBe(ovB.regionOverlaps[0]!.id);
  });

  it('full mode is idempotent on a stable map', () => {
    const lane = makeLane('Lane_1', [
      { x: 116.0, y: 39.9 },
      { x: 116.0005, y: 39.9 },
    ]);
    const cw = makeCrosswalk('Crosswalk_1', [
      { x: 116.0001, y: 39.8999 },
      { x: 116.0003, y: 39.8999 },
      { x: 116.0003, y: 39.9001 },
      { x: 116.0001, y: 39.9001 },
    ]);

    const initial = buildMap(lane, cw);
    const patch1 = reconcileOverlaps(initial, { mode: 'full' });

    // Apply patch1 to get a stable map.
    const stable = new Map(initial);
    for (const id of patch1.removedOverlapIds) stable.delete(id);
    for (const [id, e] of patch1.changes) stable.set(id, e);

    const patch2 = reconcileOverlaps(stable, { mode: 'full' });
    expect(patch2.changes.size).toBe(0);
    expect(patch2.removedOverlapIds.size).toBe(0);
  });
});
