import { describe, expect, it } from 'vitest';
import type {
  ClearAreaEntity,
  CrosswalkEntity,
  JunctionEntity,
  ParkingSpaceEntity,
  SpeedBumpEntity,
  YieldSignEntity,
} from '@/types/apollo';
import {
  entityToRawClearArea,
  entityToRawCrosswalk,
  entityToRawJunction,
  entityToRawParkingSpace,
  entityToRawSpeedBump,
  entityToRawStopSign,
  entityToRawYieldSign,
  rawClearAreaToEntity,
  rawCrosswalkToEntity,
  rawJunctionToEntity,
  rawParkingSpaceToEntity,
  rawSpeedBumpToEntity,
  rawStopSignToEntity,
  rawYieldSignToEntity,
} from '../basic';

const polygon = {
  point: [
    { x: 1, y: 2 },
    { x: 3, y: 4, z: 5 },
  ],
};

const sparseCurve = {
  segment: [
    {
      line_segment: {
        point: [
          { x: 10, y: 11 },
          { y: 13, z: 14 },
        ],
      },
    },
  ],
};

describe('simpleEntities/basic codecs', () => {
  it('decodes and encodes crosswalks while rejecting missing IDs', () => {
    expect(rawCrosswalkToEntity({})).toBeNull();

    expect(
      rawCrosswalkToEntity({
        id: { id: 'crosswalk_1' },
        polygon,
        overlap_id: [{ id: 'overlap_1' }, {}],
      }),
    ).toEqual({
      id: 'crosswalk_1',
      entityType: 'crosswalk',
      polygon: {
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4, z: 5 },
        ],
      },
      overlapIds: ['overlap_1'],
    });

    const entity: CrosswalkEntity = {
      id: 'crosswalk_2',
      entityType: 'crosswalk',
      polygon: { points: [{ x: 5, y: 6 }] },
      overlapIds: ['overlap_2'],
    };
    expect(entityToRawCrosswalk(entity)).toEqual({
      id: { id: 'crosswalk_2' },
      polygon: { point: [{ x: 5, y: 6 }] },
      overlap_id: [{ id: 'overlap_2' }],
    });
  });

  it('preserves optional junction type semantics', () => {
    expect(rawJunctionToEntity({ id: {} })).toBeNull();
    expect(rawJunctionToEntity({ id: { id: 'junction_sparse' }, type: 99 })).toEqual({
      id: 'junction_sparse',
      entityType: 'junction',
      polygon: { points: [] },
      overlapIds: [],
    });
    expect(rawJunctionToEntity({ id: { id: 'junction_1' }, type: 2 })?.type).toBe('CROSS_ROAD');

    const withoutType: JunctionEntity = {
      id: 'junction_2',
      entityType: 'junction',
      polygon: { points: [] },
      overlapIds: [],
    };
    expect(entityToRawJunction(withoutType)).toEqual({
      id: { id: 'junction_2' },
      polygon: { point: [] },
      overlap_id: [],
    });
    expect(entityToRawJunction({ ...withoutType, type: 'DEAD_END' })).toMatchObject({ type: 5 });
  });

  it('defaults missing parking-space heading and encodes explicit heading', () => {
    expect(rawParkingSpaceToEntity({ id: { id: 'parking_1' } })).toEqual({
      id: 'parking_1',
      entityType: 'parkingSpace',
      polygon: { points: [] },
      heading: 0,
      overlapIds: [],
    });
    expect(rawParkingSpaceToEntity({ id: { id: 'parking_2' }, heading: 1.25 })?.heading).toBe(1.25);

    const entity: ParkingSpaceEntity = {
      id: 'parking_3',
      entityType: 'parkingSpace',
      polygon: { points: [{ x: 1, y: 1 }] },
      heading: 0.5,
      overlapIds: ['overlap_3'],
    };
    expect(entityToRawParkingSpace(entity)).toEqual({
      id: { id: 'parking_3' },
      polygon: { point: [{ x: 1, y: 1 }] },
      heading: 0.5,
      overlap_id: [{ id: 'overlap_3' }],
    });
  });

  it('preserves stop-sign optional type and absent curve segment scalars', () => {
    expect(rawStopSignToEntity({})).toBeNull();
    expect(rawStopSignToEntity({ id: { id: 'stop_1' }, type: 99 })?.type).toBeUndefined();

    const stop = rawStopSignToEntity({
      id: { id: 'stop_2' },
      type: 4,
      stop_line: [sparseCurve],
      overlap_id: [{ id: 'overlap_1' }],
    });
    expect(stop).toEqual({
      id: 'stop_2',
      entityType: 'stopSign',
      stopLines: [
        {
          segments: [
            {
              lineSegment: {
                points: [
                  { x: 10, y: 11 },
                  { x: 0, y: 13, z: 14 },
                ],
              },
            },
          ],
        },
      ],
      overlapIds: ['overlap_1'],
      type: 'FOUR_WAY',
    });

    const encoded = entityToRawStopSign(stop!);
    expect(encoded.type).toBe(4);
    expect(encoded.stop_line?.[0]?.segment?.[0]).toEqual({
      line_segment: {
        point: [
          { x: 10, y: 11 },
          { x: 0, y: 13, z: 14 },
        ],
      },
    });
  });

  it('decodes and encodes clear areas with empty defaults', () => {
    expect(rawClearAreaToEntity({})).toBeNull();
    expect(rawClearAreaToEntity({ id: { id: 'clear_1' } })).toEqual({
      id: 'clear_1',
      entityType: 'clearArea',
      polygon: { points: [] },
      overlapIds: [],
    });

    const entity: ClearAreaEntity = {
      id: 'clear_2',
      entityType: 'clearArea',
      polygon: { points: [{ x: 1, y: 2 }] },
      overlapIds: ['overlap_2'],
    };
    expect(entityToRawClearArea(entity)).toEqual({
      id: { id: 'clear_2' },
      polygon: { point: [{ x: 1, y: 2 }] },
      overlap_id: [{ id: 'overlap_2' }],
    });
  });

  it('decodes and encodes yield signs and speed bumps with curve arrays', () => {
    expect(rawYieldSignToEntity({})).toBeNull();
    expect(rawSpeedBumpToEntity({})).toBeNull();

    const yieldSign: YieldSignEntity = {
      id: 'yield_1',
      entityType: 'yieldSign',
      stopLines: [{ segments: [{ lineSegment: { points: [{ x: 1, y: 1 }] } }] }],
      overlapIds: ['overlap_y'],
    };
    const speedBump: SpeedBumpEntity = {
      id: 'speed_bump_1',
      entityType: 'speedBump',
      position: [{ segments: [{ lineSegment: { points: [{ x: 2, y: 2 }] } }] }],
      overlapIds: ['overlap_s'],
    };

    expect(rawYieldSignToEntity({ id: { id: 'yield_empty' } })).toMatchObject({
      stopLines: [],
      overlapIds: [],
    });
    expect(rawSpeedBumpToEntity({ id: { id: 'speed_empty' } })).toMatchObject({
      position: [],
      overlapIds: [],
    });
    expect(entityToRawYieldSign(yieldSign)).toEqual({
      id: { id: 'yield_1' },
      stop_line: [{ segment: [{ line_segment: { point: [{ x: 1, y: 1 }] } }] }],
      overlap_id: [{ id: 'overlap_y' }],
    });
    expect(entityToRawSpeedBump(speedBump)).toEqual({
      id: { id: 'speed_bump_1' },
      position: [{ segment: [{ line_segment: { point: [{ x: 2, y: 2 }] } }] }],
      overlap_id: [{ id: 'overlap_s' }],
    });
  });
});
