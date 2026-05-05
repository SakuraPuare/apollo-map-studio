import { describe, it, expect } from 'vitest';
import { duplicateEntity } from '../entityOps';
import { DEG_TO_M } from '@/core/geometry/apolloCompile/projection';
import type { MapEntity, PolylineEntity } from '@/types/entities';
import type { LaneEntity, OverlapEntity } from '@/types/apollo';
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

  it('does not duplicate derived overlap entities', () => {
    const overlap: OverlapEntity = {
      id: 'overlap_lane_1_J_1',
      entityType: 'overlap',
      objects: [],
      regionOverlaps: [],
    };

    expect(duplicateEntity(overlap, asMap(overlap))).toBeNull();
  });
});
