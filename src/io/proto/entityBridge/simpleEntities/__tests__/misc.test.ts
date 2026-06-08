import { describe, expect, it } from 'vitest';
import type { AreaEntity, BarrierGateEntity, RSUEntity } from '@/types/apollo';
import {
  entityToRawArea,
  entityToRawBarrierGate,
  entityToRawRSU,
  rawAreaToEntity,
  rawBarrierGateToEntity,
  rawRSUToEntity,
} from '../misc';

const polygon = {
  point: [
    { x: 1, y: 2 },
    { x: 3, y: 4, z: 5 },
  ],
};

const curve = {
  segment: [
    {
      line_segment: {
        point: [
          { x: 10, y: 11 },
          { x: 12, y: 13, z: 14 },
        ],
      },
      s: 7,
      start_position: { x: 10, y: 11 },
      heading: 0.25,
      length: 4,
    },
  ],
};

describe('simpleEntities/misc codecs', () => {
  it('decodes and encodes barrier gates, including invalid-id rejection', () => {
    expect(rawBarrierGateToEntity({})).toBeNull();

    expect(
      rawBarrierGateToEntity({
        id: { id: 'barrier_gate_1' },
        type: 2,
        polygon,
        stop_line: [curve],
        overlap_id: [{ id: 'overlap_1' }, {}, { id: 'overlap_2' }],
      }),
    ).toEqual({
      id: 'barrier_gate_1',
      entityType: 'barrierGate',
      type: 'FENCE',
      polygon: {
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4, z: 5 },
        ],
      },
      stopLines: [
        {
          segments: [
            {
              lineSegment: {
                points: [
                  { x: 10, y: 11 },
                  { x: 12, y: 13, z: 14 },
                ],
              },
              s: 7,
              startPosition: { x: 10, y: 11 },
              heading: 0.25,
              length: 4,
            },
          ],
        },
      ],
      overlapIds: ['overlap_1', 'overlap_2'],
    });

    const entity: BarrierGateEntity = {
      id: 'barrier_gate_2',
      entityType: 'barrierGate',
      type: 'TELESCOPIC',
      polygon: { points: [{ x: 5, y: 6 }] },
      stopLines: [{ segments: [{ lineSegment: { points: [{ x: 1, y: 1 }] } }] }],
      overlapIds: ['overlap_3'],
    };

    expect(entityToRawBarrierGate(entity)).toEqual({
      id: { id: 'barrier_gate_2' },
      type: 4,
      polygon: { point: [{ x: 5, y: 6 }] },
      stop_line: [{ segment: [{ line_segment: { point: [{ x: 1, y: 1 }] } }] }],
      overlap_id: [{ id: 'overlap_3' }],
    });
  });

  it('decodes and encodes RSUs with nullable junction references', () => {
    expect(rawRSUToEntity({})).toBeNull();

    expect(
      rawRSUToEntity({
        id: { id: 'rsu_1' },
        junction_id: { id: 'junction_1' },
        overlap_id: [{ id: 'overlap_1' }],
      }),
    ).toEqual({
      id: 'rsu_1',
      entityType: 'rsu',
      junctionId: 'junction_1',
      overlapIds: ['overlap_1'],
    });

    expect(rawRSUToEntity({ id: { id: 'rsu_2' } })).toEqual({
      id: 'rsu_2',
      entityType: 'rsu',
      junctionId: null,
      overlapIds: [],
    });

    const withoutJunction: RSUEntity = {
      id: 'rsu_3',
      entityType: 'rsu',
      junctionId: null,
      overlapIds: ['overlap_2'],
    };
    expect(entityToRawRSU(withoutJunction)).toEqual({
      id: { id: 'rsu_3' },
      overlap_id: [{ id: 'overlap_2' }],
    });

    const withJunction: RSUEntity = {
      ...withoutJunction,
      junctionId: 'junction_2',
    };
    expect(entityToRawRSU(withJunction)).toEqual({
      id: { id: 'rsu_3' },
      overlap_id: [{ id: 'overlap_2' }],
      junction_id: { id: 'junction_2' },
    });
  });

  it('preserves optional area names while rejecting missing IDs', () => {
    expect(rawAreaToEntity({})).toBeNull();

    expect(
      rawAreaToEntity({
        id: { id: 'area_1' },
        type: 5,
        polygon,
        overlap_id: [{ id: 'overlap_1' }],
        name: 'loading bay',
      }),
    ).toEqual({
      id: 'area_1',
      entityType: 'area',
      type: 'Custom3',
      polygon: {
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4, z: 5 },
        ],
      },
      overlapIds: ['overlap_1'],
      name: 'loading bay',
    });

    expect(rawAreaToEntity({ id: { id: 'area_without_name' } })).toEqual({
      id: 'area_without_name',
      entityType: 'area',
      type: 'Driveable',
      polygon: { points: [] },
      overlapIds: [],
    });

    const named: AreaEntity = {
      id: 'area_2',
      entityType: 'area',
      type: 'Driveable',
      polygon: { points: [] },
      overlapIds: [],
      name: 'service yard',
    };
    expect(entityToRawArea(named)).toEqual({
      id: { id: 'area_2' },
      type: 1,
      polygon: { point: [] },
      overlap_id: [],
      name: 'service yard',
    });

    const unnamed: AreaEntity = {
      id: 'area_3',
      entityType: 'area',
      type: 'UnDriveable',
      polygon: { points: [{ x: 9, y: 10 }] },
      overlapIds: ['overlap_2'],
    };
    expect(entityToRawArea(unnamed)).toEqual({
      id: { id: 'area_3' },
      type: 2,
      polygon: { point: [{ x: 9, y: 10 }] },
      overlap_id: [{ id: 'overlap_2' }],
    });
  });
});
