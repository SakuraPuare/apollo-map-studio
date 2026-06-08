import { describe, expect, it } from 'vitest';
import type { PNCJunctionEntity } from '@/types/apollo';
import { entityToRawPNCJunction, rawPNCJunctionToEntity } from '../pncJunction';

describe('simpleEntities/pncJunction codec', () => {
  it('rejects raw PNC junctions without usable ids', () => {
    expect(rawPNCJunctionToEntity({})).toBeNull();
    expect(rawPNCJunctionToEntity({ id: {} })).toBeNull();
  });

  it('decodes sparse passage groups with defaults for missing optional fields', () => {
    expect(
      rawPNCJunctionToEntity({
        id: { id: 'pnc_junction_1' },
        polygon: { point: [{ x: 1, y: 2 }] },
        overlap_id: [{ id: 'overlap_1' }],
        passage_group: [
          {
            id: { id: 'group_1' },
            passage: [
              {
                id: { id: 'passage_1' },
                lane_id: [{ id: 'lane_1' }, {}],
              },
              {
                type: 99,
                signal_id: [{ id: 'signal_1' }],
              },
            ],
          },
          {},
        ],
      }),
    ).toEqual({
      id: 'pnc_junction_1',
      entityType: 'pncJunction',
      polygon: { points: [{ x: 1, y: 2 }] },
      overlapIds: ['overlap_1'],
      passageGroups: [
        {
          id: 'group_1',
          passages: [
            {
              id: 'passage_1',
              signalIds: [],
              yieldIds: [],
              stopSignIds: [],
              laneIds: ['lane_1'],
              type: 'UNKNOWN_PASSAGE',
            },
            {
              id: '',
              signalIds: ['signal_1'],
              yieldIds: [],
              stopSignIds: [],
              laneIds: [],
              type: 'UNKNOWN_PASSAGE',
            },
          ],
        },
        { id: '', passages: [] },
      ],
    });
  });

  it('encodes populated passage groups back to Apollo raw fields', () => {
    const entity: PNCJunctionEntity = {
      id: 'pnc_junction_2',
      entityType: 'pncJunction',
      polygon: { points: [{ x: 3, y: 4, z: 5 }] },
      overlapIds: ['overlap_2'],
      passageGroups: [
        {
          id: 'group_2',
          passages: [
            {
              id: 'passage_2',
              signalIds: ['signal_2'],
              yieldIds: ['yield_2'],
              stopSignIds: ['stop_2'],
              laneIds: ['lane_2'],
              type: 'EXIT',
            },
          ],
        },
      ],
    };

    expect(entityToRawPNCJunction(entity)).toEqual({
      id: { id: 'pnc_junction_2' },
      polygon: { point: [{ x: 3, y: 4, z: 5 }] },
      overlap_id: [{ id: 'overlap_2' }],
      passage_group: [
        {
          id: { id: 'group_2' },
          passage: [
            {
              id: { id: 'passage_2' },
              signal_id: [{ id: 'signal_2' }],
              yield_id: [{ id: 'yield_2' }],
              stop_sign_id: [{ id: 'stop_2' }],
              lane_id: [{ id: 'lane_2' }],
              type: 2,
            },
          ],
        },
      ],
    });
  });
});
