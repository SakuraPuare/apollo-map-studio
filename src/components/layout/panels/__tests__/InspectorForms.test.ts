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
import { applyAreaFormValuesToEntity, areaFormValuesFromEntity } from '../InspectorForms/area';
import {
  applyBarrierGateFormValuesToEntity,
  barrierGateFormValuesFromEntity,
} from '../InspectorForms/barrierGate';
import {
  applyJunctionFormValuesToEntity,
  junctionFormValuesFromEntity,
} from '../InspectorForms/junction';
import {
  applyParkingSpaceFormValuesToEntity,
  parkingSpaceFormValuesFromEntity,
} from '../InspectorForms/parkingSpace';
import { applyRoadFormValuesToEntity, roadFormValuesFromEntity } from '../InspectorForms/road';
import {
  applySignalFormValuesToEntity,
  applySignalSubsignalTypeToEntity,
  signalFormValuesFromEntity,
} from '../InspectorForms/signal';
import {
  applyStopSignFormValuesToEntity,
  stopSignFormValuesFromEntity,
} from '../InspectorForms/stopSign';
import type {
  AreaEntity,
  BarrierGateEntity,
  JunctionEntity,
  LaneEntity,
  ParkingSpaceEntity,
  RoadEntity,
  SignalEntity,
  StopSignEntity,
} from '@/types/apollo';

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

function trianglePolygon() {
  return {
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ],
  };
}

function lineCurve() {
  return {
    segments: [
      {
        lineSegment: {
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
          ],
        },
        s: 0,
        startPosition: { x: 0, y: 0 },
        heading: 0,
        length: 2,
      },
    ],
  };
}

function makeJunction(overrides: Partial<JunctionEntity> = {}): JunctionEntity {
  return {
    id: 'junction-1',
    entityType: 'junction',
    polygon: trianglePolygon(),
    overlapIds: [],
    ...overrides,
  };
}

function makeParkingSpace(overrides: Partial<ParkingSpaceEntity> = {}): ParkingSpaceEntity {
  return {
    id: 'parking-space-1',
    entityType: 'parkingSpace',
    polygon: trianglePolygon(),
    heading: Math.PI / 2,
    overlapIds: [],
    ...overrides,
  };
}

function makeSignal(overrides: Partial<SignalEntity> = {}): SignalEntity {
  return {
    id: 'signal-1',
    entityType: 'signal',
    boundary: trianglePolygon(),
    subsignals: [
      { id: 'subsignal-1', type: 'CIRCLE', location: { x: 0, y: 0, z: 4.8 } },
      { id: 'subsignal-2', type: 'ARROW_LEFT', location: { x: 1, y: 0, z: 4.4 } },
    ],
    type: 'MIX_3_VERTICAL',
    overlapIds: [],
    stopLines: [lineCurve()],
    signInfo: [],
    ...overrides,
  };
}

function makeStopSign(overrides: Partial<StopSignEntity> = {}): StopSignEntity {
  return {
    id: 'stop-sign-1',
    entityType: 'stopSign',
    stopLines: [lineCurve()],
    overlapIds: [],
    ...overrides,
  };
}

function makeRoad(overrides: Partial<RoadEntity> = {}): RoadEntity {
  return {
    id: 'road-1',
    entityType: 'road',
    sections: [{ id: 'section-1', laneIds: ['lane-1', 'lane-2'] }],
    junctionId: 'junction-1',
    ...overrides,
  };
}

function makeArea(overrides: Partial<AreaEntity> = {}): AreaEntity {
  return {
    id: 'area-1',
    entityType: 'area',
    type: 'Driveable',
    polygon: trianglePolygon(),
    overlapIds: [],
    name: 'Loading Bay',
    ...overrides,
  };
}

function makeBarrierGate(overrides: Partial<BarrierGateEntity> = {}): BarrierGateEntity {
  return {
    id: 'barrier-gate-1',
    entityType: 'barrierGate',
    type: 'FENCE',
    polygon: trianglePolygon(),
    stopLines: [lineCurve()],
    overlapIds: [],
    ...overrides,
  };
}

describe('R1: InspectorForms reactive lane sync', () => {
  it('derives canonical form values from a lane entity', () => {
    const lane = makeLane();
    expect(laneFormValuesFromEntity(lane)).toEqual({
      type: 'CITY_DRIVING',
      turn: 'NO_TURN',
      direction: 'FORWARD',
      speedLimit: 13.89,
      speedLimitKmh: 50,
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
    expect(diffMap.get('speedLimitKmh')).toBe(18);
    expect(diffMap.get('leftWidth')).toBe(2.0);
    expect(diffs).toHaveLength(4);
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

/**
 * Schema-driven path tests.
 *
 * The Lane inspector panel has been refactored from hardcoded JSX
 * into a data-driven `LaneInspectorSchema` consumed by the generic
 * `SchemaForm` component. The legacy `lane*` helpers above are now
 * thin wrappers over the schema-generic helpers, so the R1
 * regression battery effectively pins both layers at once. This
 * suite adds direct coverage of the schema layer:
 *
 *  - Field shape: the schema lists the editable fields the Lane
 *    inspector renders, with the right names. This
 *    is what guarantees behavior parity at render time.
 *  - Round-trip via write adapters: applying a form-value patch
 *    through the schema's `write` adapters yields a structurally
 *    equivalent entity to what LaneForm's hand-written watch
 *    callback used to produce.
 *  - Validation gate: the schema's zod `validation` rejects
 *    out-of-range numeric edits exactly the way the original
 *    `laneSchema` did, which is the gate that keeps
 *    `formState.isValid` honest under `mode: 'onChange'`.
 */
import {
  LaneInspectorSchema,
  formValuesFromEntity,
  applyFormValuesToEntity,
} from '@/types/inspectorSchema';

describe('LaneInspectorSchema: schema-driven path', () => {
  it('declares the editable fields the Lane inspector renders', () => {
    const names = LaneInspectorSchema.fields.map((f) => f.name);
    expect(names).toEqual([
      'type',
      'turn',
      'direction',
      'speedLimit',
      'speedLimitKmh',
      'leftWidth',
      'rightWidth',
      'leftBoundaryType',
      'rightBoundaryType',
    ]);
  });

  it('produces the same form values as the legacy laneFormValuesFromEntity', () => {
    // Both APIs must agree on every lane fixture — the legacy helper
    // is now a thin wrapper, but pinning the equivalence prevents a
    // future schema tweak (e.g. swapping the leftWidth read adapter)
    // from silently breaking the legacy contract.
    const lane = makeLane();
    expect(formValuesFromEntity(LaneInspectorSchema, lane)).toEqual(laneFormValuesFromEntity(lane));
  });

  it('write adapter for leftWidth fans the value across leftSamples', () => {
    // The R1 fix preserved a subtle behavior: editing leftWidth
    // updates EVERY entry in leftSamples to the same width (and
    // seeds two anchors when the array is empty). Verify the
    // schema's write adapter reproduces that.
    const lane = makeLane({
      leftSamples: [
        { s: 0, width: 1.75 },
        { s: 5, width: 1.75 },
        { s: 10, width: 1.75 },
      ],
    });
    const next = applyFormValuesToEntity(LaneInspectorSchema, lane, {
      ...laneFormValuesFromEntity(lane),
      leftWidth: 2.4,
    });
    expect(next.leftSamples).toEqual([
      { s: 0, width: 2.4 },
      { s: 5, width: 2.4 },
      { s: 10, width: 2.4 },
    ]);
    // Right side untouched.
    expect(next.rightSamples).toEqual(lane.rightSamples);
  });

  it('write adapter for leftBoundaryType replaces boundaryType[0].types', () => {
    const lane = makeLane();
    const next = applyFormValuesToEntity(LaneInspectorSchema, lane, {
      ...laneFormValuesFromEntity(lane),
      leftBoundaryType: 'DOUBLE_YELLOW',
    });
    expect(next.leftBoundary.boundaryType).toEqual([{ s: 0, types: ['DOUBLE_YELLOW'] }]);
    // Right boundary unchanged — this is the cross-field isolation
    // the original LaneForm relied on.
    expect(next.rightBoundary.boundaryType).toEqual(lane.rightBoundary.boundaryType);
  });

  it('links speed limit m/s and km/h through the same stored m/s value', () => {
    const lane = makeLane({ speedLimit: 2.7777777777777777 });
    expect(formValuesFromEntity(LaneInspectorSchema, lane)).toMatchObject({
      speedLimit: 2.7777777777777777,
      speedLimitKmh: 10,
    });

    const fromMps = applyFormValuesToEntity(LaneInspectorSchema, lane, {
      ...laneFormValuesFromEntity(lane),
      speedLimit: 5,
    });
    expect(fromMps.speedLimit).toBe(5);
    expect(formValuesFromEntity(LaneInspectorSchema, fromMps).speedLimitKmh).toBe(18);

    const fromKmh = applyFormValuesToEntity(LaneInspectorSchema, lane, {
      ...laneFormValuesFromEntity(lane),
      speedLimitKmh: 36,
    });
    expect(fromKmh.speedLimit).toBe(10);
    expect(formValuesFromEntity(LaneInspectorSchema, fromKmh).speedLimitKmh).toBe(36);
  });

  it('validation gate rejects out-of-range numeric edits', () => {
    // This is the gate that keeps `formState.isValid` honest under
    // `mode: 'onChange'` — without it the watch callback would write
    // garbage values into the store. We exercise the zod schema
    // directly because the React/RHF wrapper is non-trivial to stand
    // up without a DOM, and the validation contract is what matters.
    const ok = LaneInspectorSchema.validation.safeParse({
      type: 'CITY_DRIVING',
      turn: 'NO_TURN',
      direction: 'FORWARD',
      speedLimit: 13.89,
      speedLimitKmh: 50,
      leftWidth: 1.75,
      rightWidth: 1.75,
      leftBoundaryType: 'DOTTED_WHITE',
      rightBoundaryType: 'SOLID_WHITE',
    });
    expect(ok.success).toBe(true);

    const tooFast = LaneInspectorSchema.validation.safeParse({
      type: 'CITY_DRIVING',
      turn: 'NO_TURN',
      direction: 'FORWARD',
      speedLimit: 999, // > 50 cap
      speedLimitKmh: 50,
      leftBoundaryType: 'DOTTED_WHITE',
      rightBoundaryType: 'SOLID_WHITE',
    });
    expect(tooFast.success).toBe(false);

    const tooFastKmh = LaneInspectorSchema.validation.safeParse({
      type: 'CITY_DRIVING',
      turn: 'NO_TURN',
      direction: 'FORWARD',
      speedLimit: 10,
      speedLimitKmh: 181, // > 180 km/h cap
      leftBoundaryType: 'DOTTED_WHITE',
      rightBoundaryType: 'SOLID_WHITE',
    });
    expect(tooFastKmh.success).toBe(false);

    const tooNarrow = LaneInspectorSchema.validation.safeParse({
      type: 'CITY_DRIVING',
      turn: 'NO_TURN',
      direction: 'FORWARD',
      speedLimit: 10,
      speedLimitKmh: 36,
      leftWidth: 0.1, // < 0.5 floor
      leftBoundaryType: 'DOTTED_WHITE',
      rightBoundaryType: 'SOLID_WHITE',
    });
    expect(tooNarrow.success).toBe(false);
  });

  it('full round-trip: read → write produces a structurally identical entity', () => {
    // A no-op edit (form values exactly match the entity) must
    // produce an entity equivalent to the source, otherwise
    // `shouldPersistForm` (which compares post-write) cannot break
    // the store→watch→updateEntity loop.
    const lane = makeLane();
    const values = formValuesFromEntity(LaneInspectorSchema, lane);
    const next = applyFormValuesToEntity(LaneInspectorSchema, lane, values);
    // Spot-check the fields that go through write adapters.
    expect(next.type).toBe(lane.type);
    expect(next.turn).toBe(lane.turn);
    expect(next.direction).toBe(lane.direction);
    expect(next.speedLimit).toBe(lane.speedLimit);
    expect(next.leftSamples[0]?.width).toBe(lane.leftSamples[0]?.width);
    expect(next.rightSamples[0]?.width).toBe(lane.rightSamples[0]?.width);
    expect(next.leftBoundary.boundaryType[0]?.types[0]).toBe(
      lane.leftBoundary.boundaryType[0]?.types[0],
    );
    expect(next.rightBoundary.boundaryType[0]?.types[0]).toBe(
      lane.rightBoundary.boundaryType[0]?.types[0],
    );
  });
});

/**
 * Smoke coverage for the area / barrier-gate inspector schemas.
 *
 * These two entity kinds gained their first inspector forms, so the
 * dispatch in `EntityForm` now needs the matching zod schemas to
 * accept the proto-aligned enum values. The schemas and option lists
 * live in `@/lib/schemas`; we pin the option-set + happy-path /
 * rejection contract here so a future enum rename in one place can't
 * silently desync the inspector.
 */
import {
  areaSchema,
  areaTypeOptions,
  barrierGateSchema,
  barrierGateTypeOptions,
  junctionSchema,
  parkingSpaceSchema,
  roadSchema,
  signalSchema,
  stopSignSchema,
} from '@/lib/schemas';

describe('Simple Apollo inspector form helpers', () => {
  it('derives form defaults and optional enum fallbacks', () => {
    expect(junctionFormValuesFromEntity(makeJunction())).toEqual({ type: 'UNKNOWN' });
    expect(stopSignFormValuesFromEntity(makeStopSign())).toEqual({
      type: 'UNKNOWN_STOP_SIGN',
    });
    expect(roadFormValuesFromEntity(makeRoad())).toEqual({ type: 'UNKNOWN_ROAD' });
    expect(parkingSpaceFormValuesFromEntity(makeParkingSpace())).toEqual({ heading: 90 });
    expect(areaFormValuesFromEntity(makeArea({ name: undefined }))).toEqual({
      type: 'Driveable',
      name: '',
    });
    expect(
      signalFormValuesFromEntity(
        makeSignal({
          signInfo: [{ type: 'NO_RIGHT_TURN_ON_RED' }, { type: 'UNKNOWN' as never }],
        }),
      ),
    ).toEqual({ type: 'MIX_3_VERTICAL', signInfo: ['NO_RIGHT_TURN_ON_RED'] });
    expect(barrierGateFormValuesFromEntity(makeBarrierGate())).toEqual({ type: 'FENCE' });
  });

  it('writes enum edits and skips fallback or no-op writes', () => {
    expect(applyJunctionFormValuesToEntity(makeJunction(), { type: 'UNKNOWN' })).toBeNull();
    expect(applyJunctionFormValuesToEntity(makeJunction(), { type: 'CROSS_ROAD' })?.type).toBe(
      'CROSS_ROAD',
    );

    expect(
      applyStopSignFormValuesToEntity(makeStopSign(), { type: 'UNKNOWN_STOP_SIGN' }),
    ).toBeNull();
    expect(applyStopSignFormValuesToEntity(makeStopSign(), { type: 'ALL_WAY' })?.type).toBe(
      'ALL_WAY',
    );

    expect(applyRoadFormValuesToEntity(makeRoad(), { type: 'UNKNOWN_ROAD' })).toBeNull();
    expect(applyRoadFormValuesToEntity(makeRoad(), { type: 'PARK' })?.type).toBe('PARK');

    expect(applyBarrierGateFormValuesToEntity(makeBarrierGate(), { type: 'FENCE' })).toBeNull();
    expect(applyBarrierGateFormValuesToEntity(makeBarrierGate(), { type: 'ROD' })?.type).toBe(
      'ROD',
    );
  });

  it('writes area text edits and parking heading edits', () => {
    const area = makeArea();
    const renamed = applyAreaFormValuesToEntity(area, {
      ...areaFormValuesFromEntity(area),
      type: 'Custom2',
      name: '  Loading Zone  ',
    });
    expect(renamed).toMatchObject({ type: 'Custom2', name: 'Loading Zone' });
    expect(
      applyAreaFormValuesToEntity(renamed!, {
        ...areaFormValuesFromEntity(renamed!),
        name: '   ',
      })?.name,
    ).toBeUndefined();
    expect(applyAreaFormValuesToEntity(area, areaFormValuesFromEntity(area))).toBeNull();

    const parking = makeParkingSpace();
    const rotated = applyParkingSpaceFormValuesToEntity(parking, { heading: -45 });
    expect(rotated?.heading).toBeCloseTo(-Math.PI / 4);
    expect(
      applyParkingSpaceFormValuesToEntity(parking, parkingSpaceFormValuesFromEntity(parking)),
    ).toBeNull();
    expect(applyParkingSpaceFormValuesToEntity(parking, {})).toBeNull();
  });

  it('writes signal sign-info, layout, and subsignal edits', () => {
    const signal = makeSignal();
    const withFlag = applySignalFormValuesToEntity(signal, {
      ...signalFormValuesFromEntity(signal),
      signInfo: ['NO_RIGHT_TURN_ON_RED'],
    });
    expect(withFlag?.signInfo).toEqual([{ type: 'NO_RIGHT_TURN_ON_RED' }]);
    expect(
      applySignalFormValuesToEntity(withFlag!, signalFormValuesFromEntity(withFlag!)),
    ).toBeNull();

    const unsupported = makeSignal({ signInfo: [{ type: 'UNKNOWN' as never }] });
    expect(
      applySignalFormValuesToEntity(unsupported, signalFormValuesFromEntity(unsupported))?.signInfo,
    ).toEqual([]);

    const relaidOut = applySignalFormValuesToEntity(signal, {
      ...signalFormValuesFromEntity(signal),
      type: 'MIX_2_HORIZONTAL',
    });
    expect(relaidOut?.type).toBe('MIX_2_HORIZONTAL');
    expect(relaidOut?.boundary.points).toHaveLength(4);
    expect(relaidOut?.subsignals).toHaveLength(2);

    const editedSubsignal = applySignalSubsignalTypeToEntity(signal, 1, 'ARROW_RIGHT');
    expect(editedSubsignal?.subsignals.map((s) => s.type)).toEqual(['CIRCLE', 'ARROW_RIGHT']);
    expect(applySignalSubsignalTypeToEntity(signal, 0, 'CIRCLE')).toBeNull();
    expect(applySignalSubsignalTypeToEntity(signal, 99, 'CIRCLE')).toBeNull();
  });

  it('rejects invalid input across simple Apollo schemas', () => {
    expect(junctionSchema.safeParse({ type: 'BOGUS' }).success).toBe(false);
    expect(stopSignSchema.safeParse({ type: 'YIELD' }).success).toBe(false);
    expect(roadSchema.safeParse({ type: 'DIRT' }).success).toBe(false);
    expect(parkingSpaceSchema.safeParse({ heading: 181 }).success).toBe(false);
    expect(parkingSpaceSchema.safeParse({ heading: -181 }).success).toBe(false);
    expect(
      signalSchema.safeParse({
        type: 'MIX_3_VERTICAL',
        signInfo: ['None'],
      }).success,
    ).toBe(false);
    expect(signalSchema.safeParse({ type: 'MISSING', signInfo: [] }).success).toBe(false);
  });
});

describe('Area + BarrierGate inspector schemas', () => {
  it('areaTypeOptions matches proto-aligned AreaType values', () => {
    expect([...areaTypeOptions]).toEqual([
      'Driveable',
      'UnDriveable',
      'Custom1',
      'Custom2',
      'Custom3',
    ]);
  });

  it('areaSchema accepts a valid type with optional name', () => {
    expect(areaSchema.safeParse({ type: 'Driveable' }).success).toBe(true);
    expect(areaSchema.safeParse({ type: 'Custom2', name: 'Loading Zone' }).success).toBe(true);
  });

  it('areaSchema rejects an unknown type', () => {
    expect(areaSchema.safeParse({ type: 'BOGUS' }).success).toBe(false);
  });

  it('barrierGateTypeOptions matches proto-aligned BarrierGateType values', () => {
    expect([...barrierGateTypeOptions]).toEqual([
      'ROD',
      'FENCE',
      'ADVERTISING',
      'TELESCOPIC',
      'OTHER',
    ]);
  });

  it('barrierGateSchema accepts a valid type', () => {
    expect(barrierGateSchema.safeParse({ type: 'ROD' }).success).toBe(true);
    expect(barrierGateSchema.safeParse({ type: 'TELESCOPIC' }).success).toBe(true);
  });

  it('barrierGateSchema rejects an unknown type', () => {
    expect(barrierGateSchema.safeParse({ type: 'GATE' }).success).toBe(false);
  });
});
