import { describe, it, expect } from 'vitest';
import { canDuplicateEntity, duplicateEntity } from '../entityOps';
import { DEG_TO_M } from '@/core/geometry/apolloCompile/projection';
import type { MapEntity, PolylineEntity } from '@/types/entities';
import type {
  LaneEntity,
  OverlapEntity,
  PNCJunctionEntity,
  RoadEntity,
  RSUEntity,
} from '@/types/apollo';
import { createEntity } from '../entityOps';

function asMap(...entities: MapEntity[]): Map<string, MapEntity> {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

describe('duplicateEntity', () => {
  it('duplicates drawing entities with a new id and visible meter offset', () => {
    const entity: PolylineEntity = {
      id: 'polyline_1',
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    };

    const copy = duplicateEntity(entity, asMap(entity), { offsetMeters: 1 }) as PolylineEntity;

    expect(copy.id).toBe('polyline_2');
    expect(copy).not.toBe(entity);
    expect(entity.points[0]).toEqual({ x: 0, y: 0 });
    expect(copy.points[0]!.x).toBeCloseTo(1 / DEG_TO_M, 10);
    expect(copy.points[0]!.y).toBeCloseTo(1 / DEG_TO_M, 10);
  });

  it('duplicates without translating points when offset is zero', () => {
    const entity: PolylineEntity = {
      id: 'polyline_1',
      entityType: 'polyline',
      points: [
        { x: 116, y: 30 },
        { x: 117, y: 31 },
      ],
    };
    const existing: PolylineEntity = { ...entity, id: 'polyline_2' };

    const copy = duplicateEntity(entity, asMap(entity, existing), {
      offsetMeters: 0,
    }) as PolylineEntity;

    expect(copy.id).toBe('polyline_3');
    expect(copy.points).toEqual(entity.points);
    expect(copy.points).not.toBe(entity.points);
  });

  it('resets copied lane topology and overlap references', () => {
    const lane = createEntity(
      'lane',
      'drawPolyline',
      [
        [0, 0],
        [1, 0],
      ],
      [],
      { entities: new Map() },
    ) as LaneEntity;
    const selected: LaneEntity = {
      ...lane,
      predecessorIds: ['lane_prev'],
      successorIds: ['lane_next'],
      leftNeighborForwardIds: ['lane_left'],
      rightNeighborForwardIds: ['lane_right'],
      leftNeighborReverseIds: ['lane_left_reverse'],
      rightNeighborReverseIds: ['lane_right_reverse'],
      selfReverseLaneIds: ['lane_reverse'],
      junctionId: 'J_1',
      overlapIds: ['overlap_lane_1_J_1'],
    };

    const copy = duplicateEntity(selected, asMap(selected), { offsetMeters: 1 }) as LaneEntity;

    expect(copy.id).toBe('lane_2');
    expect(copy.predecessorIds).toEqual([]);
    expect(copy.successorIds).toEqual([]);
    expect(copy.leftNeighborForwardIds).toEqual([]);
    expect(copy.rightNeighborForwardIds).toEqual([]);
    expect(copy.leftNeighborReverseIds).toEqual([]);
    expect(copy.rightNeighborReverseIds).toEqual([]);
    expect(copy.selfReverseLaneIds).toEqual([]);
    expect(copy.junctionId).toBeNull();
    expect(copy.overlapIds).toEqual([]);
    expect(selected.overlapIds).toEqual(['overlap_lane_1_J_1']);
  });

  it('resets copied road lane membership and junction references', () => {
    const road: RoadEntity = {
      id: 'road_1',
      entityType: 'road',
      sections: [
        { id: 'section_1', laneIds: ['lane_1', 'lane_2'] },
        { id: 'section_2', laneIds: ['lane_3'] },
      ],
      junctionId: 'J_1',
      type: 'CITY_ROAD',
    };

    const copy = duplicateEntity(road, asMap(road), { offsetMeters: 0 }) as RoadEntity;

    expect(copy.id).toBe('road_2');
    expect(copy.junctionId).toBeNull();
    expect(copy.sections.map((section) => section.laneIds)).toEqual([[], []]);
    expect(road.sections.map((section) => section.laneIds)).toEqual([
      ['lane_1', 'lane_2'],
      ['lane_3'],
    ]);
  });

  it('resets copied pncJunction passages and overlap references', () => {
    const pnc: PNCJunctionEntity = {
      id: 'PNCJ_1',
      entityType: 'pncJunction',
      polygon: { points: [{ x: 116, y: 30 }] },
      overlapIds: ['overlap_pnc'],
      passageGroups: [
        {
          id: 'passagegroup_1',
          passages: [
            {
              id: 'passage_1',
              laneIds: ['lane_1'],
              signalIds: ['signal_1'],
              yieldIds: ['yield_1'],
              stopSignIds: ['stopsign_1'],
              type: 'ENTRANCE',
            },
          ],
        },
      ],
    };

    const copy = duplicateEntity(pnc, asMap(pnc), { offsetMeters: 0 }) as PNCJunctionEntity;

    expect(copy.id).toBe('PNCJ_2');
    expect(copy.overlapIds).toEqual([]);
    expect(copy.passageGroups).toEqual([]);
    expect(pnc.passageGroups).toHaveLength(1);
    expect(pnc.overlapIds).toEqual(['overlap_pnc']);
  });

  it('resets copied rsu junction and overlap references', () => {
    const rsu: RSUEntity = {
      id: 'RSU_1',
      entityType: 'rsu',
      junctionId: 'J_1',
      overlapIds: ['overlap_rsu'],
    };

    const copy = duplicateEntity(rsu, asMap(rsu), { offsetMeters: 0 }) as RSUEntity;

    expect(copy.id).toBe('RSU_2');
    expect(copy.junctionId).toBeNull();
    expect(copy.overlapIds).toEqual([]);
    expect(rsu.junctionId).toBe('J_1');
    expect(rsu.overlapIds).toEqual(['overlap_rsu']);
  });

  it('does not duplicate derived overlap entities', () => {
    const overlap: OverlapEntity = {
      id: 'overlap_lane_1_J_1',
      entityType: 'overlap',
      objects: [],
      regionOverlaps: [],
    };

    expect(canDuplicateEntity(overlap)).toBe(false);
    expect(duplicateEntity(overlap, asMap(overlap))).toBeNull();
  });

  it('allows ordinary entities to be duplicated', () => {
    expect(
      canDuplicateEntity({
        id: 'polyline_1',
        entityType: 'polyline',
        points: [{ x: 0, y: 0 }],
      }),
    ).toBe(true);
  });
});
