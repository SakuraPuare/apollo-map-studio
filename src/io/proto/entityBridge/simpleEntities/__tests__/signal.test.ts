import { describe, expect, it } from 'vitest';
import type { SignalEntity } from '@/types/apollo';
import { entityToRawSignal, rawSignalToEntity } from '../signal';

describe('simpleEntities/signal codec', () => {
  it('drops raw signals without a usable id', () => {
    expect(rawSignalToEntity({})).toBeNull();
    expect(rawSignalToEntity({ id: {} })).toBeNull();
  });

  it('imports sparse raw signals without synthesising optional fields', () => {
    expect(
      rawSignalToEntity({
        id: { id: 'signal_sparse' },
        subsignal: [{ id: {}, type: 999 }, { id: { id: 'sub_1' } }],
        sign_info: [{}],
        stop_line: [{ segment: [{ line_segment: { point: [{ x: 1 }, { y: 2, z: 3 }] } }] }],
      }),
    ).toEqual({
      id: 'signal_sparse',
      entityType: 'signal',
      boundary: { points: [] },
      subsignals: [
        { id: '', type: 'UNKNOWN_SUBSIGNAL' },
        { id: 'sub_1', type: 'UNKNOWN_SUBSIGNAL' },
      ],
      type: 'UNKNOWN_SIGNAL',
      overlapIds: [],
      stopLines: [
        {
          segments: [
            {
              lineSegment: {
                points: [
                  { x: 1, y: 0 },
                  { x: 0, y: 2, z: 3 },
                ],
              },
            },
          ],
        },
      ],
      signInfo: [{ type: 'None' }],
    });
  });

  it('imports populated signal fields and enum values', () => {
    const entity = rawSignalToEntity({
      id: { id: 'signal_1' },
      boundary: {
        point: [
          { x: 1, y: 2 },
          { x: 3, y: 4, z: 5 },
        ],
      },
      subsignal: [
        {
          id: { id: 'sub_1' },
          type: 3,
          location: { x: 6, y: 7, z: 8 },
        },
      ],
      overlap_id: [{ id: 'overlap_1' }, {}],
      type: 6,
      stop_line: [
        {
          segment: [
            {
              line_segment: { point: [{ x: 9, y: 10 }] },
              s: 1,
              start_position: { x: 9, y: 10 },
              heading: 0.5,
              length: 3,
            },
          ],
        },
      ],
      sign_info: [{ type: 1 }, { type: 99 }],
    });

    expect(entity).toEqual({
      id: 'signal_1',
      entityType: 'signal',
      boundary: {
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4, z: 5 },
        ],
      },
      subsignals: [
        {
          id: 'sub_1',
          type: 'ARROW_LEFT',
          location: { x: 6, y: 7, z: 8 },
        },
      ],
      type: 'SINGLE',
      overlapIds: ['overlap_1'],
      stopLines: [
        {
          segments: [
            {
              lineSegment: { points: [{ x: 9, y: 10 }] },
              s: 1,
              startPosition: { x: 9, y: 10 },
              heading: 0.5,
              length: 3,
            },
          ],
        },
      ],
      signInfo: [{ type: 'NO_RIGHT_TURN_ON_RED' }, { type: 'None' }],
    });
  });

  it('exports signals while preserving absent optional subsignal locations', () => {
    const entity: SignalEntity = {
      id: 'signal_2',
      entityType: 'signal',
      boundary: { points: [{ x: 1, y: 2, z: 3 }] },
      subsignals: [
        { id: 'sub_without_location', type: 'CIRCLE' },
        { id: 'sub_with_location', type: 'ARROW_U_TURN', location: { x: 4, y: 5 } },
      ],
      type: 'MIX_3_VERTICAL',
      overlapIds: ['overlap_2'],
      stopLines: [
        {
          segments: [
            {
              lineSegment: { points: [{ x: 6, y: 7 }] },
            },
          ],
        },
      ],
      signInfo: [{ type: 'NO_RIGHT_TURN_ON_RED' }],
    };

    expect(entityToRawSignal(entity)).toEqual({
      id: { id: 'signal_2' },
      boundary: { point: [{ x: 1, y: 2, z: 3 }] },
      subsignal: [
        { id: { id: 'sub_without_location' }, type: 2 },
        {
          id: { id: 'sub_with_location' },
          type: 8,
          location: { x: 4, y: 5 },
        },
      ],
      overlap_id: [{ id: 'overlap_2' }],
      type: 5,
      stop_line: [{ segment: [{ line_segment: { point: [{ x: 6, y: 7 }] } }] }],
      sign_info: [{ type: 1 }],
    });
  });

  it('round-trips imported signal data through the entity shape', () => {
    const entity = rawSignalToEntity({
      id: { id: 'signal_roundtrip' },
      boundary: { point: [{ x: 0, y: 1 }] },
      subsignal: [{ id: { id: 'sub_1' }, type: 4 }],
      overlap_id: [{ id: 'overlap_1' }],
      type: 2,
      stop_line: [{ segment: [{ line_segment: { point: [{ x: 2, y: 3 }] } }] }],
      sign_info: [{ type: 0 }],
    })!;

    expect(rawSignalToEntity(entityToRawSignal(entity))).toEqual(entity);
  });
});
