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
  beforeEach(() => clearLaneArcLengthCache());

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

  it('preserves imported (non-derived) overlap entities even when no geometric hit', () => {
    const lane = makeLane('Lane_1', [
      { x: 117.0, y: 40.0 },
      { x: 117.0005, y: 40.0 },
    ]);
    const junction = makeJunction('Junction_1', [
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

    expect(patch.removedOverlapIds.has('overlap_imported_42')).toBe(false);
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
