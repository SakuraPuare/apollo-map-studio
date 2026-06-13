import React from 'react';
import type * as JsxDevRuntime from 'react/jsx-dev-runtime';
import type * as JsxRuntime from 'react/jsx-runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { EntityForm } from '../InspectorForms';
import { ScenarioEgoForm } from '../InspectorForms/ScenarioEgoForm';
import { ScenarioObstacleForm } from '../InspectorForms/ScenarioObstacleForm';
import { ScenarioTrafficLightForm } from '../InspectorForms/ScenarioTrafficLightForm';
import { TrajectoryEditor, WaypointEditor } from '../InspectorForms/scenarioPointEditors';
import { LaneRef, LaneRefList, laneRefDisplayLabel, selectLaneRef } from '../LaneRefList';
import { SchemaForm } from '../SchemaForm';
import { EditorProvider } from '@/context/EditorContext';
import type { EntitySchema } from '@/types/inspectorSchema';
import { useMapStore } from '@/store/mapStore';
import { useScenarioStore } from '@/store/scenarioStore';
import { useUIStore } from '@/store/uiStore';
import type {
  AreaEntity,
  BarrierGateEntity,
  ClearAreaEntity,
  CrosswalkEntity,
  JunctionEntity,
  LaneEntity,
  OverlapEntity,
  ParkingLotEntity,
  ParkingSpaceEntity,
  PNCJunctionEntity,
  RoadEntity,
  RSUEntity,
  SignalEntity,
  SpeedBumpEntity,
  SpeedControlEntity,
  StopSignEntity,
  YieldSignEntity,
} from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import type { ScenarioEgo, ScenarioObstacle, ScenarioTrafficLight } from '@/types/scenario';

const jsxCapture = vi.hoisted(() => ({
  elements: [] as Array<{ type: unknown; props: Record<string, unknown> }>,
}));

function recordCapturedElement(type: unknown, props: unknown): void {
  if (typeof type !== 'string' || typeof props !== 'object' || props === null) return;
  jsxCapture.elements.push({ type, props: props as Record<string, unknown> });
}

vi.mock('react/jsx-runtime', async () => {
  const actual = await vi.importActual<typeof JsxRuntime>('react/jsx-runtime');

  const jsx: typeof actual.jsx = (type, props, key) => {
    recordCapturedElement(type, props);
    return actual.jsx(type, props, key);
  };
  const jsxs: typeof actual.jsxs = (type, props, key) => {
    recordCapturedElement(type, props);
    return actual.jsxs(type, props, key);
  };

  return { ...actual, jsx, jsxs };
});

vi.mock('react/jsx-dev-runtime', async () => {
  const actual = await vi.importActual<typeof JsxDevRuntime>('react/jsx-dev-runtime');

  const jsxDEV: typeof actual.jsxDEV = (...args) => {
    const [type, props] = args;
    recordCapturedElement(type, props);
    return actual.jsxDEV(...args);
  };

  return { ...actual, jsxDEV };
});

const initialUIState = useUIStore.getState();

function render(node: React.ReactElement) {
  const actorRef = {
    send: vi.fn(),
    getSnapshot: vi.fn(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  };
  return renderToStaticMarkup(<EditorProvider actorRef={actorRef as never}>{node}</EditorProvider>);
}

function renderWithClientStoreSnapshot(node: React.ReactElement) {
  vi.spyOn(React, 'useSyncExternalStore').mockImplementation(((
    _subscribe: unknown,
    getSnapshot: () => unknown,
  ) => getSnapshot()) as typeof React.useSyncExternalStore);
  return render(node);
}

function renderForCapture(node: React.ReactElement) {
  jsxCapture.elements = [];
  return render(node);
}

function lane(id = 'lane_0000000001'): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: {
      segments: [
        {
          lineSegment: {
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
            ],
          },
          s: 0,
          startPosition: { x: 0, y: 0 },
          heading: 0,
          length: 10,
        },
      ],
    },
    leftBoundary: {
      curve: { segments: [] },
      length: 10,
      virtual: false,
      boundaryType: [{ s: 0, types: ['SOLID_WHITE'] }],
    },
    rightBoundary: {
      curve: { segments: [] },
      length: 10,
      virtual: true,
      boundaryType: [{ s: 0, types: ['DOTTED_YELLOW'] }],
    },
    length: 10,
    type: 'CITY_DRIVING',
    turn: 'LEFT_TURN',
    direction: 'FORWARD',
    speedLimit: 12.5,
    predecessorIds: ['lane_pred'],
    successorIds: ['lane_succ'],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId: 'junction_1',
    overlapIds: ['overlap_1'],
    leftSamples: [{ s: 0, width: 1.5 }],
    rightSamples: [{ s: 0, width: 1.7 }],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

const testSchema = {
  id: 'test-lane',
  validation: z.object({
    kind: z.enum(['CITY_DRIVING', 'BIKING']),
    width: z.number(),
  }),
  sectionOrder: ['Main', 'Computed'],
  fields: [
    {
      kind: 'enum',
      name: 'kind',
      label: 'Kind',
      section: 'Main',
      options: ['CITY_DRIVING', 'BIKING'],
      read: (e: LaneEntity) => (e.type === 'BIKING' ? 'BIKING' : 'CITY_DRIVING'),
      write: (e: LaneEntity, v: 'CITY_DRIVING' | 'BIKING') => ({ ...e, type: v }),
    },
    {
      kind: 'number',
      name: 'width',
      label: 'Width',
      section: 'Computed',
      min: 0,
      max: 10,
      step: 0.1,
      read: (e: LaneEntity) => e.leftSamples[0]?.width ?? 0,
      write: (e: LaneEntity, v: number) => ({ ...e, leftSamples: [{ s: 0, width: v }] }),
    },
  ],
  readonly: [
    {
      kind: 'readonly',
      label: 'Identifier',
      section: 'Main',
      compute: (e: LaneEntity) => e.id,
    },
    {
      kind: 'readonly',
      label: 'Length',
      section: 'Computed',
      compute: (e: LaneEntity) => `${e.length ?? 0}m`,
    },
    {
      kind: 'readonly',
      label: 'Fallback',
      section: 'Unlisted',
      compute: () => 'after ordered sections',
    },
  ],
} satisfies EntitySchema<
  LaneEntity,
  {
    kind: 'CITY_DRIVING' | 'BIKING';
    width: number;
  }
>;

function signal(): SignalEntity {
  return {
    id: 'signal_0000000001',
    entityType: 'signal',
    boundary: {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
    },
    subsignals: [
      { id: 'subsignal_1', type: 'CIRCLE', location: { x: 0, y: 0, z: 4.25 } },
      { id: 'subsignal_2', type: 'ARROW_LEFT' },
    ],
    type: 'MIX_3_VERTICAL',
    overlapIds: ['overlap_1'],
    stopLines: [{ segments: [] }],
    signInfo: [{ type: 'NO_RIGHT_TURN_ON_RED' }],
  };
}

function pncJunction(): PNCJunctionEntity {
  return {
    id: 'pnc_junction_0000000001',
    entityType: 'pncJunction',
    polygon: {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
    },
    overlapIds: ['overlap_1'],
    passageGroups: [
      {
        id: 'passage_group_0000000001',
        passages: [
          {
            id: 'passage_0000000001',
            laneIds: ['lane_0000000001'],
            signalIds: ['signal_0000000001'],
            stopSignIds: ['stop_sign_0000000001'],
            yieldIds: ['yield_sign_0000000001'],
            type: 'ENTRANCE',
          },
        ],
      },
    ],
  };
}

function overlap(withRegions = true): OverlapEntity {
  return {
    id: 'overlap_0000000001',
    entityType: 'overlap',
    objects: [
      {
        objectType: 'lane',
        objectId: 'lane_0000000001',
        laneOverlapInfo: { startS: 1, endS: 4, isMerge: true },
      },
      {
        objectType: 'lane',
        objectId: 'lane_0000000002',
        laneOverlapInfo: { startS: 5, endS: 7, isMerge: false },
      },
      { objectType: 'signal', objectId: 'signal_0000000001' },
    ],
    regionOverlaps: withRegions
      ? [
          {
            id: 'region_overlap_0000000001',
            polygons: [
              {
                points: [
                  { x: 0, y: 0 },
                  { x: 1, y: 0 },
                  { x: 1, y: 1 },
                ],
              },
            ],
          },
        ]
      : [],
    _userOverrides: withRegions ? ['objects.0.laneOverlapInfo.isMerge', 'regionOverlaps'] : [],
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

function trianglePolygon() {
  return {
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ],
  };
}

function junction(): JunctionEntity {
  return {
    id: 'junction_0000000001',
    entityType: 'junction',
    polygon: trianglePolygon(),
    type: 'CROSS_ROAD',
    overlapIds: ['overlap_1', 'overlap_2'],
  };
}

function parkingSpace(): ParkingSpaceEntity {
  return {
    id: 'parking_space_0000000001',
    entityType: 'parkingSpace',
    polygon: trianglePolygon(),
    heading: Math.PI / 2,
    overlapIds: ['overlap_1'],
  };
}

function parkingLot(): ParkingLotEntity {
  return {
    id: 'parking_lot_0000000001',
    entityType: 'parkingLot',
    polygon: trianglePolygon(),
    overlapIds: ['overlap_1'],
  };
}

function speedControl(): SpeedControlEntity {
  return {
    id: 'speed_control_0000000001',
    entityType: 'speedControl',
    name: 'school_zone',
    polygon: trianglePolygon(),
    speedLimit: 8.33,
  };
}

function road(): RoadEntity {
  return {
    id: 'road_0000000001',
    entityType: 'road',
    sections: [
      { id: 'section_1', laneIds: ['lane_1', 'lane_2'] },
      { id: 'section_2', laneIds: [] },
    ],
    junctionId: 'junction_0000000001',
    type: 'CITY_ROAD',
  };
}

function area(): AreaEntity {
  return {
    id: 'area_0000000001',
    entityType: 'area',
    type: 'Driveable',
    name: 'Loading Bay',
    polygon: trianglePolygon(),
    overlapIds: ['overlap_1'],
  };
}

function barrierGate(): BarrierGateEntity {
  return {
    id: 'barrier_gate_0000000001',
    entityType: 'barrierGate',
    type: 'FENCE',
    polygon: trianglePolygon(),
    stopLines: [lineCurve()],
    overlapIds: ['overlap_1'],
  };
}

function stopSign(): StopSignEntity {
  return {
    id: 'stop_sign_0000000001',
    entityType: 'stopSign',
    stopLines: [lineCurve()],
    type: 'FOUR_WAY',
    overlapIds: ['overlap_1', 'overlap_2'],
  };
}

function crosswalk(): CrosswalkEntity {
  return {
    id: 'crosswalk_0000000001',
    entityType: 'crosswalk',
    polygon: trianglePolygon(),
    overlapIds: ['overlap_1'],
  };
}

function clearArea(): ClearAreaEntity {
  return {
    id: 'clear_area_0000000001',
    entityType: 'clearArea',
    polygon: trianglePolygon(),
    overlapIds: [],
  };
}

function speedBump(): SpeedBumpEntity {
  return {
    id: 'speed_bump_0000000001',
    entityType: 'speedBump',
    position: [lineCurve(), { segments: [] }],
    overlapIds: ['overlap_1'],
  };
}

function yieldSign(): YieldSignEntity {
  return {
    id: 'yield_sign_0000000001',
    entityType: 'yieldSign',
    stopLines: [lineCurve()],
    overlapIds: [],
  };
}

function rsu(): RSUEntity {
  return {
    id: 'rsu_0000000001',
    entityType: 'rsu',
    junctionId: null,
    overlapIds: ['overlap_1'],
  };
}

function scenarioEgo(): ScenarioEgo {
  return {
    start: { x: 1, y: 2, h: 0.25 },
    end: { x: 20, y: 30 },
    waypoints: [{ x: 5, y: 6 }],
    startVelocity: 4.5,
    startAcceleration: 0.2,
  };
}

function scenarioObstacle(): ScenarioObstacle {
  return {
    uid: 'obstacle_uid_1',
    name: 'npc_vehicle_1',
    apolloId: 7,
    kind: 'vehicle',
    dimensions: { length: 4.5, width: 2, height: 1.6 },
    position: { x: 11, y: 12, h: 0.5 },
    initialSpeed: 3.5,
    moving: true,
    trajectory: [
      { x: 11, y: 12, h: 0.5, speed: 3.5 },
      { x: 20, y: 22, speed: 5 },
    ],
    triggerType: 'TIME',
    triggerValue: 3,
    events: [
      {
        uid: 'event_speed_1',
        name: 'speed-up',
        trigger: { kind: 'simulationTime', rule: 'greaterOrEqual', value: 5 },
        action: {
          kind: 'speed',
          targetSpeed: 6.5,
          dynamicsShape: 'linear',
          dynamicsDimension: 'time',
          dynamicsValue: 1,
        },
        ref: null,
      },
      {
        uid: 'event_lane_1',
        name: 'lane-change',
        trigger: null,
        action: {
          kind: 'laneChange',
          relativeTargetLane: -1,
          dynamicsDimension: 'distance',
          dynamicsValue: 8,
        },
        ref: null,
      },
    ],
    ref: null,
  };
}

function scenarioTrafficLight(): ScenarioTrafficLight {
  return {
    uid: 'traffic_light_uid_1',
    signalId: 'signal_0000000001',
    location: { x: 100, y: 200 },
    triggerType: 'DISTANCE',
    triggerValue: 12,
    initialColor: 'YELLOW',
    stateGroup: [
      { color: 'RED', keepTime: 12 },
      { color: 'GREEN', keepTime: 8 },
    ],
    ref: null,
  };
}

function activeScenarioDoc() {
  const state = useScenarioStore.getState();
  const entry = state.loaded.find((candidate) => candidate.key === state.activeKey);
  if (!entry) throw new Error('expected active scenario fixture');
  return entry.doc;
}

function seedActiveScenarioFixture(
  overrides: Partial<{
    ego: ScenarioEgo;
    obstacles: ScenarioObstacle[];
    trafficLights: ScenarioTrafficLight[];
  }> = {},
) {
  const doc = {
    format: 'openscenario',
    meta: { id: 'scenario-1', tags: [] },
    ego: overrides.ego ?? scenarioEgo(),
    obstacles: overrides.obstacles ?? [scenarioObstacle()],
    trafficLights: overrides.trafficLights ?? [scenarioTrafficLight()],
    raw: {},
  } as const;
  useScenarioStore.setState({
    loaded: [{ key: 'scenario-1', filename: 'scenario.json', doc }],
    activeKey: 'scenario-1',
    selectedObstacleUid: doc.obstacles[0]?.uid ?? null,
    selectedTrafficLightUid: doc.trafficLights[0]?.uid ?? null,
    selectedKind: 'obstacle',
  });
  return doc;
}

function capturedElement(
  type: string,
  predicate: (props: Record<string, unknown>) => boolean,
): { props: Record<string, unknown> } {
  const element = jsxCapture.elements.find(
    (candidate) => candidate.type === type && predicate(candidate.props),
  );
  if (!element) throw new Error(`expected captured ${type}`);
  return element;
}

function capturedInputByLabel(label: string): { props: Record<string, unknown> } {
  return capturedElement('input', (props) => props['aria-label'] === label);
}

function capturedSelectByLabel(label: string): { props: Record<string, unknown> } {
  return capturedElement('select', (props) => props['aria-label'] === label);
}

function capturedButtonByText(text: string): { props: Record<string, unknown> } {
  return capturedElement('button', (props) => textContent(props.children).includes(text));
}

function capturedButtonByLabel(label: string): { props: Record<string, unknown> } {
  return capturedElement('button', (props) => props['aria-label'] === label);
}

function textContent(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textContent).join('');
  if (React.isValidElement(value)) {
    return textContent((value.props as { children?: unknown }).children);
  }
  return '';
}

function changeCapturedInput(input: { props: Record<string, unknown> }, value: string) {
  const onChange = input.props.onChange;
  if (typeof onChange !== 'function') throw new Error('expected input change handler');
  onChange({ target: { value } });
}

function changeCapturedSelect(select: { props: Record<string, unknown> }, value: string) {
  const onChange = select.props.onChange;
  if (typeof onChange !== 'function') throw new Error('expected select change handler');
  onChange({ target: { value } });
}

function clickCapturedButton(button: { props: Record<string, unknown> }) {
  const onClick = button.props.onClick;
  if (typeof onClick !== 'function') throw new Error('expected button click handler');
  onClick();
}

beforeEach(() => {
  vi.restoreAllMocks();
  useUIStore.setState(initialUIState, true);
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useScenarioStore.setState({
    loaded: [],
    activeKey: null,
    projString: null,
    selectedObstacleUid: null,
    selectedTrafficLightUid: null,
    selectedKind: null,
  });
  useScenarioStore.temporal.getState().clear();
  jsxCapture.elements = [];
});

describe('SchemaForm SSR rendering', () => {
  it('renders schema fields, read-only rows, and explicit section ordering', () => {
    const html = render(<SchemaForm schema={testSchema} entity={lane()} />);

    expect(html.indexOf('Main')).toBeLessThan(html.indexOf('Computed'));
    expect(html.indexOf('Computed')).toBeLessThan(html.indexOf('Unlisted'));
    expect(html).toContain('Kind');
    expect(html).toContain('Width');
    expect(html).toContain('Length');
    expect(html).toContain('Fallback');
    expect(html).toContain('lane_0000000001');
  });
});

describe('Apollo inspector SSR rendering', () => {
  it('dispatches lane entities through the schema-backed LaneForm', () => {
    const html = render(<EntityForm entity={lane()} />);

    expect(html).toContain('Attributes');
    expect(html).toContain('Boundaries');
    expect(html).toContain('Topology');
    expect(html).toContain('Speed Limit (km/h)');
    expect(html).toContain('Left Width (m)');
    expect(html).toContain('Predecessors');
    expect(html).toContain('Successors');
    expect(html).toContain('lane_0000000001');
  });

  it('marks the inspector fieldset disabled when the entity layer is locked', () => {
    useUIStore.getState().setLayerLocked('signal', true);

    const html = renderWithClientStoreSnapshot(<EntityForm entity={signal()} />);

    expect(html).toContain('<fieldset');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('Layer is locked');
    expect(html).toContain('opacity-60');
  });

  it('marks advanced inspector forms disabled when pnc junction or overlap layers are locked', () => {
    useUIStore.getState().setLayerLocked('pncJunction', true);
    const pncHtml = renderWithClientStoreSnapshot(<EntityForm entity={pncJunction()} />);

    expect(pncHtml).toContain('<fieldset');
    expect(pncHtml).toContain('disabled=""');
    expect(pncHtml).toContain('Layer is locked');
    expect(pncHtml).toContain('Passage Groups');
    expect(pncHtml).toContain('+ Passage Group');

    useUIStore.getState().setLayerLocked('pncJunction', false);
    useUIStore.getState().setLayerLocked('overlap', true);
    const overlapHtml = renderWithClientStoreSnapshot(<EntityForm entity={overlap()} />);

    expect(overlapHtml).toContain('<fieldset');
    expect(overlapHtml).toContain('disabled=""');
    expect(overlapHtml).toContain('Layer is locked');
    expect(overlapHtml).toContain('Lane × Lane Semantics');
    expect(overlapHtml).toContain('Region Overlaps');
  });

  it('renders SignalForm attributes, subsignals, and sign-info checkboxes', () => {
    const html = render(<EntityForm entity={signal()} />);

    expect(html).toContain('Attributes');
    expect(html).toContain('3-Light Vertical');
    expect(html).toContain('2-Light Horizontal');
    expect(html).toContain('Arrow Forward');
    expect(html).toContain('Stop Lines');
    expect(html).toContain('Overlaps');
    expect(html).toContain('Subsignals (2)');
    expect(html).toContain('Regenerate from stop line');
    expect(html).toContain('Circle');
    expect(html).toContain('Arrow Left');
    expect(html).toContain('No Right Turn on Red');
    expect(html).toContain('checked=""');
    expect(html).toContain('z=4.25');
    expect(html).toContain('z=—');
  });

  it('renders SignalForm empty subsignals and leaves unsupported sign-info flags unchecked', () => {
    const entity: SignalEntity = {
      ...signal(),
      stopLines: [],
      overlapIds: [],
      subsignals: [],
      signInfo: [{ type: 'UNKNOWN' as never }],
    };

    const html = render(<EntityForm entity={entity} />);

    expect(html).toContain('Subsignals (0)');
    expect(html).toContain('No bulbs: draw a stop line or click Regenerate below.');
    expect(html).toContain('Regenerate from stop line');
    expect(html).toContain('No Right Turn on Red');
    expect(html).not.toContain('checked=""');
    expect(html).toContain('Stop Lines');
    expect(html).toContain('Overlaps');
    expect(html).toContain('—');
  });

  it('renders PNC junction passage groups and selected reference chips', () => {
    const html = render(<EntityForm entity={pncJunction()} />);

    expect(html).toContain('Attributes');
    expect(html).toContain('Vertices');
    expect(html).toContain('Overlaps');
    expect(html).toContain('Passage Groups');
    expect(html).toContain('Group');
    expect(html).toContain('Entrance');
    expect(html).toContain('Exit');
    expect(html).toContain('Lanes');
    expect(html).toContain('Signals');
    expect(html).toContain('Stop');
    expect(html).toContain('Yield');
    expect(html).toContain('+ Passage');
    expect(html).toContain('+ Passage Group');
    expect(html).toContain('Remove lane_0000000001');
    expect(html).toContain('Remove signal_0000000001');
    expect(html).toContain('Remove stop_sign_0000000001');
    expect(html).toContain('Remove yield_sign_0000000001');
  });

  it('renders PNC junction empty passage references and empty attribute aggregates', () => {
    const entity: PNCJunctionEntity = {
      ...pncJunction(),
      polygon: { points: [] },
      overlapIds: [],
      passageGroups: [
        {
          id: 'passage_group_0000000002',
          passages: [
            {
              id: 'passage_0000000002',
              laneIds: [],
              signalIds: [],
              stopSignIds: [],
              yieldIds: [],
              type: 'UNKNOWN_PASSAGE',
            },
          ],
        },
      ],
    };

    const html = render(<EntityForm entity={entity} />);

    expect(html).toContain('Vertices');
    expect(html).toContain('Overlaps');
    expect(html).toContain('Unknown');
    expect(html).toContain('none');
    expect(html).toContain('—');
    expect(html).not.toContain('+ add');
  });

  it('renders PNC junction with no passage groups', () => {
    const html = render(<EntityForm entity={{ ...pncJunction(), passageGroups: [] }} />);

    expect(html).toContain('Passage Groups');
    expect(html).toContain('no groups yet');
    expect(html).toContain('+ Passage Group');
    expect(html).not.toContain('+ Passage</button>');
  });

  it('renders PNC junction empty groups without passage blocks', () => {
    const html = render(
      <EntityForm
        entity={{
          ...pncJunction(),
          passageGroups: [{ id: 'passage_group_0000000003', passages: [] }],
        }}
      />,
    );

    expect(html).toContain('Group');
    expect(html).toContain('passage_group_0000000003');
    expect(html).toContain('+ Passage');
    expect(html).toContain('+ Passage Group');
    expect(html).not.toContain('Lanes');
    expect(html).not.toContain('Signals');
  });

  it('seeds PNC junction reference add selectors from the map store', () => {
    const extraSignal: SignalEntity = { ...signal(), id: 'signal_0000000002' };
    const extraStopSign: StopSignEntity = { ...stopSign(), id: 'stop_sign_0000000002' };
    const extraYieldSign: YieldSignEntity = { ...yieldSign(), id: 'yield_sign_0000000002' };
    useMapStore.setState({
      entities: new Map<string, MapEntity>([
        ['lane_0000000003', lane('lane_0000000003')],
        [extraSignal.id, extraSignal],
        [extraStopSign.id, extraStopSign],
        [extraYieldSign.id, extraYieldSign],
      ]),
    });

    const html = renderWithClientStoreSnapshot(<EntityForm entity={pncJunction()} />);

    expect(html).toContain('+ add');
    expect(html).toContain('value="lane_0000000003"');
    expect(html).toContain('value="signal_0000000002"');
    expect(html).toContain('value="stop_sign_0000000002"');
    expect(html).toContain('value="yield_sign_0000000002"');
  });

  it('renders overlap participants, lane semantics, and pinned region summaries', () => {
    const html = render(<EntityForm entity={overlap()} />);

    expect(html).toContain('Participants');
    expect(html).toContain('Lane × Lane Semantics');
    expect(html).toContain('Region Overlaps');
    expect(html).toContain('pinned');
    expect(html).toContain('region_o');
    expect(html).toContain('3 pt');
  });

  it('renders empty overlap participants without lane semantics or region controls', () => {
    const html = render(
      <EntityForm entity={{ ...overlap(false), objects: [], regionOverlaps: [] }} />,
    );

    expect(html).toContain('Participants');
    expect(html).toContain('no objects');
    expect(html).not.toContain('Lane × Lane Semantics');
    expect(html).not.toContain('Region Overlaps');
  });

  it('renders unpinned overlap lane and region controls', () => {
    const html = render(<EntityForm entity={{ ...overlap(), _userOverrides: [] }} />);

    expect(html).toContain('Lane × Lane Semantics');
    expect(html).toContain('auto');
    expect(html).toContain('Region Overlaps');
    expect(html).toContain('auto-derived');
    expect(html).toContain('Pin → freeze current region polygons');
  });

  it('omits optional overlap sections when branch data is absent', () => {
    const html = render(<EntityForm entity={overlap(false)} />);

    expect(html).toContain('Participants');
    expect(html).toContain('Lane × Lane Semantics');
    expect(html).not.toContain('Region Overlaps');
  });

  it('renders editable simple Apollo forms with their summary rows', () => {
    const cases: Array<[MapEntity, string[]]> = [
      [junction(), ['junction_0000000001', 'Crossroad', 'Overlaps']],
      [parkingSpace(), ['parking_space_0000000001', 'Heading (°)', 'Overlaps']],
      [road(), ['road_0000000001', 'City Road', 'Sections', 'Total Lanes', 'junction_0000000001']],
      [area(), ['area_0000000001', 'Driveable', 'Name', 'Overlaps']],
      [barrierGate(), ['barrier_gate_0000000001', 'Fence', 'Stop Lines', 'Overlaps']],
      [stopSign(), ['stop_sign_0000000001', 'Four-Way', 'Stop Lines', 'Overlaps']],
    ];

    for (const [entity, expected] of cases) {
      const html = render(<EntityForm entity={entity} />);
      expect(html).toContain('Attributes');
      for (const text of expected) {
        expect(html).toContain(text);
      }
    }
  });

  it('renders AreaForm with blank optional name and all area type labels', () => {
    const { name: _name, ...entity } = area();
    const html = render(<EntityForm entity={{ ...entity, overlapIds: [] }} />);

    expect(html).toContain('area_0000000001');
    expect(html).toContain('Driveable');
    expect(html).toContain('Undriveable');
    expect(html).toContain('Custom 1');
    expect(html).toContain('Custom 2');
    expect(html).toContain('Custom 3');
    expect(html).toContain('Name');
    expect(html).toContain('Overlaps');
    expect(html).toContain('—');
  });

  it('renders editable Apollo forms with empty aggregate and optional enum fallbacks', () => {
    const cases: Array<[MapEntity, string[]]> = [
      [
        { ...junction(), type: undefined, overlapIds: [] },
        ['junction_0000000001', 'Unknown', 'Overlaps', '—'],
      ],
      [{ ...parkingSpace(), overlapIds: [] }, ['parking_space_0000000001', 'Overlaps', '—']],
      [
        {
          ...road(),
          type: undefined,
          sections: [{ id: 'empty_section', laneIds: [] }],
          junctionId: null,
        },
        ['road_0000000001', 'Unknown', 'Sections', 'Total Lanes', 'Junction', '—'],
      ],
      [
        { ...barrierGate(), stopLines: [], overlapIds: [] },
        ['barrier_gate_0000000001', 'Stop Lines', 'Overlaps', '—'],
      ],
      [
        { ...stopSign(), type: undefined, stopLines: [], overlapIds: [] },
        ['stop_sign_0000000001', 'Unknown', 'Stop Lines', 'Overlaps', '—'],
      ],
    ];

    for (const [entity, expected] of cases) {
      const html = render(<EntityForm entity={entity} />);
      expect(html).toContain('Attributes');
      for (const text of expected) {
        expect(html).toContain(text);
      }
    }
  });

  it('renders read-only Apollo forms with empty and non-empty aggregates', () => {
    const cases: Array<[MapEntity, string[]]> = [
      [crosswalk(), ['crosswalk_0000000001', 'Vertices', '3', 'Overlaps']],
      [clearArea(), ['clear_area_0000000001', 'Vertices', '3', 'Overlaps', '—']],
      [speedBump(), ['speed_bump_0000000001', 'Position Curves', '2', 'Segments', '1']],
      [yieldSign(), ['yield_sign_0000000001', 'Stop Lines', '1', 'Segments', '1', '—']],
      [rsu(), ['rsu_0000000001', 'Junction', '—', 'Overlaps', '1']],
    ];

    for (const [entity, expected] of cases) {
      const html = render(<EntityForm entity={entity} />);
      expect(html).toContain('Attributes');
      for (const text of expected) {
        expect(html).toContain(text);
      }
    }
  });
});

describe('Drawing inspector SSR rendering', () => {
  it('renders drawing primitive geometry summaries through the EntityForm fallback', () => {
    const cases: Array<[MapEntity, string]> = [
      [
        {
          id: 'polyline_0000000001',
          entityType: 'polyline',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
        },
        '2',
      ],
      [
        {
          id: 'catmull_rom_0000000001',
          entityType: 'catmullRom',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 0 },
          ],
        },
        '3',
      ],
      [
        {
          id: 'bezier_0000000001',
          entityType: 'bezier',
          anchors: [
            { point: { x: 0, y: 0 }, handleIn: null, handleOut: { x: 1, y: 0 } },
            { point: { x: 2, y: 0 }, handleIn: { x: 1, y: 0 }, handleOut: null },
          ],
        },
        '2',
      ],
      [
        {
          id: 'polygon_0000000001',
          entityType: 'polygon',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
          ],
        },
        '3',
      ],
      [
        {
          id: 'arc_0000000001',
          entityType: 'arc',
          start: { x: 0, y: 0 },
          mid: { x: 1, y: 1 },
          end: { x: 2, y: 0 },
        },
        '—',
      ],
      [
        {
          id: 'rect_0000000001',
          entityType: 'rect',
          p1: { x: 0, y: 0 },
          p2: { x: 1, y: 1 },
          rotation: 0,
        },
        '—',
      ],
    ];

    for (const [entity, vertices] of cases) {
      const html = render(<EntityForm entity={entity} />);

      expect(html).toContain('Geometry');
      expect(html).toContain(entity.id);
      expect(html).toContain('Vertices');
      expect(html).toContain(vertices);
    }
  });

  it('renders Apollo entities without dedicated forms through the geometry fallback', () => {
    const cases: Array<[MapEntity, string]> = [
      [parkingLot(), '3'],
      [speedControl(), '3'],
    ];

    for (const [entity, vertices] of cases) {
      const html = render(<EntityForm entity={entity} />);

      expect(html).toContain('Geometry');
      expect(html).toContain(entity.id);
      expect(html).toContain('Vertices');
      expect(html).toContain(vertices);
    }
  });
});

describe('Scenario inspector form SSR rendering', () => {
  it('renders ego start, end, motion, and waypoint sections', () => {
    const html = render(<ScenarioEgoForm ego={scenarioEgo()} />);

    expect(html).toContain('起点 (世界米)');
    expect(html).toContain('终点 (世界米)');
    expect(html).toContain('运动');
    expect(html).toContain('初速 (m/s)');
    expect(html).toContain('初加速度');
    expect(html).toContain('途经点 (世界米)');
    expect(html).toContain('点 1 X');
    expect(html).toContain('点 1 Y');
    expect(html).toContain('删除点 1');
    expect(html).toContain('添加途经点');
  });

  it('renders obstacle identity, geometry, trajectory, and both event action branches', () => {
    const html = render(<ScenarioObstacleForm obstacle={scenarioObstacle()} />);

    expect(html).toContain('标识');
    expect(html).toContain('npc_vehicle_1');
    expect(html).toContain('Apollo ID');
    expect(html).toContain('位置 (世界米)');
    expect(html).toContain('尺寸 (米)');
    expect(html).toContain('轨迹顶点 (世界米)');
    expect(html).toContain('点 1 X');
    expect(html).toContain('点 2 Y');
    expect(html).toContain('删除点 2');
    expect(html).toContain('动态事件');
    expect(html).toContain('事件 #1');
    expect(html).toContain('事件 #2');
    expect(html).toContain('目标速度');
    expect(html).toContain('相对车道');
    expect(html).toContain('添加顶点');
    expect(html).toContain('添加事件');
    expect(html).toContain('删除障碍物');
  });

  it('renders traffic light identity, trigger, and timing rows', () => {
    const html = render(<ScenarioTrafficLightForm light={scenarioTrafficLight()} />);

    expect(html).toContain('Signal ID');
    expect(html).toContain('signal_0000000001');
    expect(html).toContain('位置 (世界米)');
    expect(html).toContain('颜色');
    expect(html).toContain('触发');
    expect(html).toContain('YELLOW');
    expect(html).toContain('TIME');
    expect(html).toContain('DISTANCE');
    expect(html).toContain('NA');
    expect(html).toContain('初始状态');
    expect(html).toContain('配时方案');
    expect(html).toContain('阶段 1 颜色');
    expect(html).toContain('阶段 2 保持秒数');
    expect(html).toContain('删除阶段 1');
    expect(html).toContain('RED');
    expect(html).toContain('GREEN');
    expect(html).toContain('添加阶段');
    expect(html).toContain('删除红绿灯');
  });

  it('renders traffic light timing editor with no states', () => {
    const html = render(
      <ScenarioTrafficLightForm light={{ ...scenarioTrafficLight(), stateGroup: [] }} />,
    );

    expect(html).toContain('配时方案');
    expect(html).toContain('添加阶段');
    expect(html).not.toContain('阶段 1 颜色');
    expect(html).not.toContain('删除阶段 1');
  });

  it('renders point editors directly for empty waypoint and trajectory arrays', () => {
    const egoHtml = render(<WaypointEditor ego={{ ...scenarioEgo(), waypoints: [] }} />);
    const obstacleHtml = render(
      <TrajectoryEditor obstacle={{ ...scenarioObstacle(), trajectory: [] }} />,
    );

    expect(egoHtml).toContain('添加途经点');
    expect(egoHtml).not.toContain('点 1 X');
    expect(obstacleHtml).toContain('添加顶点');
    expect(obstacleHtml).not.toContain('点 1 X');
  });

  it('invokes ego numeric and waypoint handlers against the scenario store', () => {
    seedActiveScenarioFixture();
    renderForCapture(<ScenarioEgoForm ego={activeScenarioDoc().ego} />);

    changeCapturedInput(capturedInputByLabel('X'), '101');
    expect(activeScenarioDoc().ego.start.x).toBe(101);

    changeCapturedInput(capturedInputByLabel('朝向 (rad)'), '1.5');
    expect(activeScenarioDoc().ego.start.h).toBe(1.5);

    changeCapturedInput(capturedInputByLabel('初速 (m/s)'), '8.25');
    expect(activeScenarioDoc().ego.startVelocity).toBe(8.25);

    changeCapturedInput(capturedInputByLabel('点 1 X'), '55');
    expect(activeScenarioDoc().ego.waypoints[0]?.x).toBe(55);

    changeCapturedInput(capturedInputByLabel('点 1 Y'), 'bad');
    expect(activeScenarioDoc().ego.waypoints[0]?.y).toBe(6);

    clickCapturedButton(capturedButtonByText('添加途经点'));
    expect(activeScenarioDoc().ego.waypoints.at(-1)).toEqual({ x: 10, y: 11 });

    clickCapturedButton(capturedButtonByLabel('删除点 1'));
    expect(activeScenarioDoc().ego.waypoints[0]).toEqual({ x: 10, y: 11 });
  });

  it('invokes obstacle field, trajectory, event, and remove handlers against the scenario store', () => {
    seedActiveScenarioFixture();
    renderForCapture(<ScenarioObstacleForm obstacle={activeScenarioDoc().obstacles[0]!} />);

    changeCapturedSelect(capturedSelectByLabel('类型'), 'pedestrian');
    expect(activeScenarioDoc().obstacles[0]?.kind).toBe('pedestrian');

    changeCapturedInput(capturedInputByLabel('X'), '31');
    expect(activeScenarioDoc().obstacles[0]?.position.x).toBe(31);

    changeCapturedInput(capturedInputByLabel('长'), '6.2');
    expect(activeScenarioDoc().obstacles[0]?.dimensions.length).toBe(6.2);

    changeCapturedInput(capturedInputByLabel('初速 (m/s)'), '4.75');
    expect(activeScenarioDoc().obstacles[0]?.initialSpeed).toBe(4.75);

    changeCapturedInput(capturedInputByLabel('点 1 X'), '13');
    expect(activeScenarioDoc().obstacles[0]?.trajectory[0]?.x).toBe(13);

    clickCapturedButton(capturedButtonByText('添加顶点'));
    expect(activeScenarioDoc().obstacles[0]?.trajectory.at(-1)).toEqual({ x: 25, y: 27 });

    changeCapturedSelect(capturedSelectByLabel('触发类型'), 'relativeDistance');
    expect(activeScenarioDoc().obstacles[0]?.events[0]?.trigger).toMatchObject({
      kind: 'relativeDistance',
      rule: 'greaterOrEqual',
      value: 5,
    });

    changeCapturedInput(capturedInputByLabel('触发值'), '12');
    expect(activeScenarioDoc().obstacles[0]?.events[0]?.trigger).toMatchObject({ value: 12 });

    changeCapturedSelect(capturedSelectByLabel('动作类型'), 'laneChange');
    expect(activeScenarioDoc().obstacles[0]?.events[0]?.action).toMatchObject({
      kind: 'laneChange',
      relativeTargetLane: 1,
    });

    changeCapturedInput(capturedInputByLabel('相对目标车道'), '-2');
    expect(activeScenarioDoc().obstacles[0]?.events[1]?.action).toMatchObject({
      kind: 'laneChange',
      relativeTargetLane: -2,
    });

    clickCapturedButton(capturedButtonByText('添加事件'));
    expect(activeScenarioDoc().obstacles[0]?.events).toHaveLength(3);

    clickCapturedButton(capturedButtonByLabel('删除事件 1'));
    expect(activeScenarioDoc().obstacles[0]?.events[0]?.uid).toBe('event_lane_1');

    clickCapturedButton(capturedButtonByText('删除障碍物'));
    expect(activeScenarioDoc().obstacles).toEqual([]);
  });

  it('invokes traffic light field, timing, and remove handlers against the scenario store', () => {
    seedActiveScenarioFixture();
    renderForCapture(<ScenarioTrafficLightForm light={activeScenarioDoc().trafficLights[0]!} />);

    changeCapturedInput(capturedInputByLabel('Signal ID'), 'signal_next');
    expect(activeScenarioDoc().trafficLights[0]?.signalId).toBe('signal_next');

    changeCapturedInput(capturedInputByLabel('X'), '110');
    expect(activeScenarioDoc().trafficLights[0]?.location.x).toBe(110);

    changeCapturedSelect(capturedSelectByLabel('颜色'), 'GREEN');
    expect(activeScenarioDoc().trafficLights[0]?.initialColor).toBe('GREEN');

    changeCapturedSelect(capturedSelectByLabel('触发'), 'TIME');
    expect(activeScenarioDoc().trafficLights[0]?.triggerType).toBe('TIME');

    changeCapturedInput(capturedInputByLabel('触发值'), '44');
    expect(activeScenarioDoc().trafficLights[0]?.triggerValue).toBe(44);

    changeCapturedSelect(capturedSelectByLabel('阶段 1 颜色'), 'YELLOW');
    expect(activeScenarioDoc().trafficLights[0]?.stateGroup[0]?.color).toBe('YELLOW');

    changeCapturedInput(capturedInputByLabel('阶段 1 保持秒数'), '15.5');
    expect(activeScenarioDoc().trafficLights[0]?.stateGroup[0]?.keepTime).toBe(15.5);

    changeCapturedInput(capturedInputByLabel('阶段 1 保持秒数'), 'not-number');
    expect(activeScenarioDoc().trafficLights[0]?.stateGroup[0]?.keepTime).toBe(15.5);

    clickCapturedButton(capturedButtonByText('添加阶段'));
    expect(activeScenarioDoc().trafficLights[0]?.stateGroup.at(-1)).toEqual({
      color: 'GREEN',
      keepTime: 10,
    });

    clickCapturedButton(capturedButtonByLabel('删除阶段 1'));
    expect(activeScenarioDoc().trafficLights[0]?.stateGroup[0]).toEqual({
      color: 'GREEN',
      keepTime: 8,
    });

    clickCapturedButton(capturedButtonByText('删除红绿灯'));
    expect(activeScenarioDoc().trafficLights).toEqual([]);
  });
});

describe('LaneRef SSR rendering', () => {
  it('renders none for empty lists and null single refs', () => {
    expect(render(<LaneRefList ids={[]} />)).toContain('none');
    expect(render(<LaneRef id={null} />)).toContain('none');
  });

  it('renders existing and missing lane references with short and full labels', () => {
    useMapStore.setState({
      entities: new Map([[lane().id, lane()]]),
    });

    const shortHtml = render(<LaneRefList ids={['lane_0000000001', 'lane_missing_0000000002']} />);
    expect(shortHtml).toContain('…000001');
    expect(shortHtml).toContain('…000002');
    expect(shortHtml).toContain('disabled=""');
    expect(shortHtml).toContain('line-through');

    const fullHtml = render(<LaneRefList ids={['lane_0000000001']} short={false} />);
    expect(fullHtml).toContain('lane_0000000001');
  });

  it('formats lane labels and sends selection only for existing references', () => {
    const actorRef = { send: vi.fn() };
    const entities = new Map<string, unknown>([['lane_0000000001', {}]]);

    expect(laneRefDisplayLabel('lane_0000000001')).toBe('…000001');
    expect(laneRefDisplayLabel('lane_0000000001', false)).toBe('lane_0000000001');
    expect(selectLaneRef('lane_missing', actorRef, entities)).toBe(false);
    expect(actorRef.send).not.toHaveBeenCalled();
    expect(selectLaneRef('lane_0000000001', actorRef, entities)).toBe(true);
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: 'lane_0000000001' });
  });
});
