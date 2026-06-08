import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { BoundaryLineType, LaneEntity, LaneBoundary } from '../apollo';
import {
  LaneInspectorSchema,
  applyFormValuesToEntity,
  diffFormAgainstEntity,
  formValuesFromEntity,
  shouldPersistForm,
} from '../inspectorSchema';

function boundary(
  entries: Array<{ s: number; types: BoundaryLineType[] }>,
  virtual?: boolean,
): LaneBoundary {
  return {
    curve: { segments: [] },
    length: 10,
    boundaryType: entries,
    ...(virtual === undefined ? {} : { virtual }),
  };
}

function makeLane(overrides: Partial<LaneEntity> = {}): LaneEntity {
  return {
    id: 'lane_1',
    entityType: 'lane',
    centralCurve: { segments: [] },
    leftBoundary: boundary([{ s: 0, types: ['DOTTED_WHITE'] }], false),
    rightBoundary: boundary([{ s: 0, types: ['SOLID_WHITE'] }], true),
    length: 10,
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
    leftSamples: [
      { s: 0, width: 1.75 },
      { s: 10, width: 1.75 },
    ],
    rightSamples: [
      { s: 0, width: 1.75 },
      { s: 10, width: 1.75 },
    ],
    leftRoadSamples: [],
    rightRoadSamples: [],
    ...overrides,
  };
}

describe('LaneInspectorSchema uncovered branches', () => {
  it('reads default speed, widths, and unknown boundary variants', () => {
    const emptyValues = formValuesFromEntity(
      LaneInspectorSchema,
      makeLane({
        speedLimit: undefined,
        leftSamples: [],
        rightSamples: [],
        leftBoundary: boundary([{ s: 0, types: [] }]),
        rightBoundary: boundary([{ s: 0, types: [] }]),
      }),
    );

    expect(emptyValues).toMatchObject({
      speedLimit: 0,
      speedLimitKmh: 0,
      leftWidth: 1.75,
      rightWidth: 1.75,
      leftBoundaryType: 'UNKNOWN',
      rightBoundaryType: 'UNKNOWN',
    });

    const multiBoundaryValues = formValuesFromEntity(
      LaneInspectorSchema,
      makeLane({
        leftBoundary: boundary([
          { s: 0, types: ['DOTTED_WHITE'] },
          { s: 5, types: ['SOLID_WHITE'] },
        ]),
        rightBoundary: boundary([
          { s: 0, types: ['DOTTED_YELLOW'] },
          { s: 5, types: ['SOLID_YELLOW'] },
        ]),
      }),
    );

    expect(multiBoundaryValues.leftBoundaryType).toBe('UNKNOWN');
    expect(multiBoundaryValues.rightBoundaryType).toBe('UNKNOWN');
  });

  it('writes enum, speed, width, and boundary fields through adapter branches', () => {
    const next = applyFormValuesToEntity(
      LaneInspectorSchema,
      makeLane({
        leftSamples: [],
        rightSamples: [],
        length: 12,
      }),
      {
        type: 'PARKING',
        turn: 'LEFT_TURN',
        direction: 'BACKWARD',
        speedLimit: undefined,
        speedLimitKmh: undefined,
        leftWidth: 2.2,
        rightWidth: 2.4,
        leftBoundaryType: 'DOUBLE_YELLOW',
        rightBoundaryType: 'CURB',
      },
    );

    expect(next).toMatchObject({
      type: 'PARKING',
      turn: 'LEFT_TURN',
      direction: 'BACKWARD',
      speedLimit: 0,
      leftSamples: [
        { s: 0, width: 2.2 },
        { s: 12, width: 2.2 },
      ],
      rightSamples: [
        { s: 0, width: 2.4 },
        { s: 12, width: 2.4 },
      ],
    });
    expect(next.leftBoundary.boundaryType).toEqual([{ s: 0, types: ['DOUBLE_YELLOW'] }]);
    expect(next.rightBoundary.boundaryType).toEqual([{ s: 0, types: ['CURB'] }]);
    expect(next._userOverrides).toEqual(
      expect.arrayContaining([
        'type',
        'turn',
        'direction',
        'speedLimit',
        'leftWidth',
        'rightWidth',
        'leftBoundaryType',
        'rightBoundaryType',
      ]),
    );
  });

  it('skips absent form keys and avoids override tagging after default no-op writes', () => {
    const lane = makeLane({ length: undefined });

    expect(applyFormValuesToEntity(LaneInspectorSchema, lane, {})).toBe(lane);
    expect(applyFormValuesToEntity(LaneInspectorSchema, lane, { type: 'CITY_DRIVING' })).toBe(lane);
    expect(
      shouldPersistForm(LaneInspectorSchema, formValuesFromEntity(LaneInspectorSchema, lane), lane),
    ).toBe(false);

    const diffs = diffFormAgainstEntity(LaneInspectorSchema, { type: 'PARKING' }, lane);
    expect(diffs).toContainEqual(['type', 'CITY_DRIVING']);
    expect(diffs).toContainEqual(['turn', 'NO_TURN']);
    expect(diffs).toHaveLength(LaneInspectorSchema.fields.length);

    const defaulted = applyFormValuesToEntity(LaneInspectorSchema, lane, {
      leftWidth: undefined,
      rightWidth: undefined,
    });
    expect(defaulted.leftSamples).toEqual(lane.leftSamples);
    expect(defaulted.rightSamples).toEqual(lane.rightSamples);
    expect(defaulted._userOverrides).toBeUndefined();
  });

  it('seeds empty width samples safely and detects changed partial form values', () => {
    const lane = makeLane({
      leftSamples: [],
      rightSamples: [],
      length: undefined,
    });

    const seededWithoutLength = applyFormValuesToEntity(LaneInspectorSchema, lane, {
      leftWidth: 2.25,
      rightWidth: 2.5,
    });
    expect(seededWithoutLength.leftSamples).toEqual([
      { s: 0, width: 2.25 },
      { s: 0, width: 2.25 },
    ]);
    expect(seededWithoutLength.rightSamples).toEqual([
      { s: 0, width: 2.5 },
      { s: 0, width: 2.5 },
    ]);

    const seededNegativeLength = applyFormValuesToEntity(
      LaneInspectorSchema,
      makeLane({ leftSamples: [], length: -5 }),
      { leftWidth: 2.75 },
    );
    expect(seededNegativeLength.leftSamples).toEqual([
      { s: 0, width: 2.75 },
      { s: 0, width: 2.75 },
    ]);

    const resampled = applyFormValuesToEntity(
      LaneInspectorSchema,
      makeLane({
        leftSamples: [
          { s: 1, width: 1.5 },
          { s: 4, width: 1.5 },
        ],
      }),
      { leftWidth: 3 },
    );
    expect(resampled.leftSamples).toEqual([
      { s: 1, width: 3 },
      { s: 4, width: 3 },
    ]);

    expect(
      shouldPersistForm(
        LaneInspectorSchema,
        { ...formValuesFromEntity(LaneInspectorSchema, makeLane()), type: 'PARKING' },
        makeLane(),
      ),
    ).toBe(true);
  });

  it('computes every read-only row across topology and boundary display branches', () => {
    const rows = new Map(LaneInspectorSchema.readonly.map((row) => [row.label, row]));
    const lane = makeLane({
      id: 'lane_topology',
      length: 12.345,
      leftBoundary: boundary([{ s: 0, types: ['DOTTED_WHITE'] }], true),
      rightBoundary: boundary([{ s: 0, types: ['SOLID_WHITE'] }], false),
      junctionId: 'junction_1',
      predecessorIds: ['pred_1'],
      successorIds: ['succ_1'],
      leftNeighborForwardIds: ['left_fwd_1'],
      rightNeighborForwardIds: ['right_fwd_1'],
      leftNeighborReverseIds: ['left_rev_1'],
      rightNeighborReverseIds: ['right_rev_1'],
      selfReverseLaneIds: ['self_rev_1'],
      overlapIds: ['overlap_1'],
    });

    expect(rows.get('ID')?.compute(lane)).toBe('lane_topology');
    expect(rows.get('Length')?.compute(lane)).toBe('12.35 m');
    expect(rows.get('Length')?.compute(makeLane({ length: undefined }))).toBe('0.00 m');
    expect(rows.get('L Virtual')?.compute(lane)).toBe('Yes');
    expect(rows.get('L Virtual')?.compute(makeLane())).toBe('No');
    expect(rows.get('R Virtual')?.compute(lane)).toBe('No');
    expect(rows.get('R Virtual')?.compute(makeLane())).toBe('Yes');

    for (const label of [
      'Junction',
      'Predecessors',
      'Successors',
      'L Neighbors (fwd)',
      'R Neighbors (fwd)',
      'L Neighbors (rev)',
      'R Neighbors (rev)',
      'Self-Reverse',
      'Overlaps',
    ]) {
      expect(isValidElement(rows.get(label)?.compute(lane))).toBe(true);
    }
  });
});
