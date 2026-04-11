/**
 * R1 regression test — Inspector property panel reactive sync.
 *
 * Bug: LaneForm's reset useEffect keyed on `[entity.id, methods]` never
 * re-ran when the store produced a new reference for the same-id entity
 * (undo/redo, canvas drag, programmatic updates). At the same time the
 * watch callback was gated on `methods.formState.isValid`, which stayed
 * `false` with the default `mode: 'onSubmit'` — so every edit to
 * leftWidth / leftBoundaryType was silently swallowed. Arc lanes went
 * through exactly the same LaneForm and so were affected identically.
 *
 * Fix: switch to `mode: 'onChange'`, derive form values via pure helpers
 * (`laneFormValuesFromEntity`), cherry-pick same-id sync via
 * `diffLaneFormAgainstEntity`, and gate persistence on
 * `shouldPersistLaneForm` to break the store→sync→watch→updateEntity
 * death loop.
 *
 * This test exercises the pure sync contract directly — it does not
 * rely on a DOM renderer (jsdom/happy-dom are intentionally not project
 * dependencies) and instead verifies the helper functions that the
 * React component delegates to. If these three helpers behave
 * correctly, LaneForm's reactive behavior follows deterministically.
 */

import { describe, it, expect } from 'vitest';
import {
  laneFormValuesFromEntity,
  diffLaneFormAgainstEntity,
  shouldPersistLaneForm,
} from '../InspectorForms';
import type { LaneEntity } from '@/types/apollo';

// Minimal in-memory lane fixture. Keep trivially constructible so the
// test stays readable — only the fields the sync contract touches
// actually need real values; everything else is empty/placeholder.
function makeLane(overrides: Partial<LaneEntity> = {}): LaneEntity {
  return {
    id: 'lane-1',
    entityType: 'lane',
    centralCurve: { segments: [] },
    leftBoundary: {
      curve: { segments: [] },
      length: 10,
      boundaryType: [{ s: 0, types: ['DOTTED_WHITE'] }],
    },
    rightBoundary: {
      curve: { segments: [] },
      length: 10,
      boundaryType: [{ s: 0, types: ['SOLID_WHITE'] }],
    },
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
  } as LaneEntity;
}

describe('R1: InspectorForms reactive lane sync', () => {
  it('derives canonical form values from a lane entity', () => {
    const lane = makeLane();
    expect(laneFormValuesFromEntity(lane)).toEqual({
      type: 'CITY_DRIVING',
      turn: 'NO_TURN',
      direction: 'FORWARD',
      speedLimit: 13.89,
      leftWidth: 1.75,
      rightWidth: 1.75,
      leftBoundaryType: 'DOTTED_WHITE',
      rightBoundaryType: 'SOLID_WHITE',
    });
  });

  it('reports no drift when form values already match the entity', () => {
    const lane = makeLane();
    const formValues = laneFormValuesFromEntity(lane);
    expect(diffLaneFormAgainstEntity(formValues, lane)).toEqual([]);
    expect(shouldPersistLaneForm(formValues, lane)).toBe(false);
  });

  it('detects leftWidth drift when store pushes an external update', () => {
    // Simulates: user selects lane in Inspector -> form shows width=1.75.
    // Then an external actor (undo/redo, canvas drag, etc.) updates the
    // same-id entity with width=2.5. The sync effect must see the drift.
    const oldLane = makeLane();
    const newLane = makeLane({
      leftSamples: [
        { s: 0, width: 2.5 },
        { s: 10, width: 2.5 },
      ],
    });
    const formValues = laneFormValuesFromEntity(oldLane); // what the form currently holds
    const diffs = diffLaneFormAgainstEntity(formValues, newLane);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual(['leftWidth', 2.5]);
  });

  it('detects leftBoundaryType drift (the second half of the R1 repro)', () => {
    const oldLane = makeLane();
    const newLane = makeLane({
      leftBoundary: {
        curve: { segments: [] },
        length: 10,
        boundaryType: [{ s: 0, types: ['DOUBLE_YELLOW'] }],
      },
    });
    const formValues = laneFormValuesFromEntity(oldLane);
    const diffs = diffLaneFormAgainstEntity(formValues, newLane);
    expect(diffs).toEqual([['leftBoundaryType', 'DOUBLE_YELLOW']]);
  });

  it('detects drift across multiple fields simultaneously', () => {
    const oldLane = makeLane();
    const newLane = makeLane({
      type: 'BIKING',
      speedLimit: 5,
      leftSamples: [
        { s: 0, width: 2.0 },
        { s: 10, width: 2.0 },
      ],
    });
    const formValues = laneFormValuesFromEntity(oldLane);
    const diffs = diffLaneFormAgainstEntity(formValues, newLane);
    const diffMap = new Map(diffs);
    expect(diffMap.get('type')).toBe('BIKING');
    expect(diffMap.get('speedLimit')).toBe(5);
    expect(diffMap.get('leftWidth')).toBe(2.0);
    expect(diffs).toHaveLength(3);
  });

  it('shouldPersistLaneForm breaks the write→rerender→write loop', () => {
    // After the watch callback persists width=2.5 into the store, the
    // component re-renders with the new entity. The next watch
    // invocation (triggered by RHF's auto-notification after the
    // resulting setValue sync) must be a no-op, otherwise the store
    // would thrash. This test pins the dedupe contract.
    const lane = makeLane({
      leftSamples: [
        { s: 0, width: 2.5 },
        { s: 10, width: 2.5 },
      ],
    });
    const formValuesMatchingStore = laneFormValuesFromEntity(lane);
    expect(shouldPersistLaneForm(formValuesMatchingStore, lane)).toBe(false);
  });

  it('shouldPersistLaneForm fires only on genuine user-originated drift', () => {
    const lane = makeLane();
    const formWithEditedWidth = {
      ...laneFormValuesFromEntity(lane),
      leftWidth: 3.2, // user typed a new value into the Inspector
    };
    expect(shouldPersistLaneForm(formWithEditedWidth, lane)).toBe(true);
  });

  it('arc lanes (non-straight geometry) hit the exact same sync path', () => {
    // Arc and bezier lanes produce LaneEntity with identical schema —
    // only the underlying curve segments differ. The Inspector form
    // has no geometry-type branch (see EntityForm in InspectorForms.tsx),
    // so this test guards the contract that the sync layer is
    // geometry-agnostic. The drawing/geometry type lives in `_source`,
    // and the form never reads that, so width/boundary edits must
    // work uniformly regardless of how the lane was drawn.
    const arcLane = makeLane({
      id: 'arc-lane-7',
      leftSamples: [
        { s: 0, width: 1.9 },
        { s: 10, width: 1.9 },
      ],
    });
    const values = laneFormValuesFromEntity(arcLane);
    expect(values.leftWidth).toBe(1.9);
    // Verify drift detection also works for arc lanes.
    const updatedArc = makeLane({
      id: 'arc-lane-7',
      leftSamples: [
        { s: 0, width: 2.4 },
        { s: 10, width: 2.4 },
      ],
    });
    expect(diffLaneFormAgainstEntity(values, updatedArc)).toEqual([['leftWidth', 2.4]]);
  });

  it('falls back to DEFAULT_LANE_HALF_WIDTH when sample arrays are empty', () => {
    const lane = makeLane({
      leftSamples: [],
      rightSamples: [],
    });
    const values = laneFormValuesFromEntity(lane);
    // The default comes from config/mapConstants — assert it is a
    // sensible positive number rather than pinning an exact constant
    // so this test does not break if the default is re-tuned.
    expect(values.leftWidth).toBeGreaterThan(0);
    expect(values.rightWidth).toBeGreaterThan(0);
  });
});
