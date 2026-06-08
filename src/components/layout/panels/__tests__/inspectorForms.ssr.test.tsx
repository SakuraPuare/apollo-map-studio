import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { EntityForm } from '../InspectorForms';
import { ScenarioEgoForm } from '../InspectorForms/ScenarioEgoForm';
import { ScenarioObstacleForm } from '../InspectorForms/ScenarioObstacleForm';
import { ScenarioTrafficLightForm } from '../InspectorForms/ScenarioTrafficLightForm';
import { TrajectoryEditor, WaypointEditor } from '../InspectorForms/scenarioPointEditors';
import { LaneRef, LaneRefList } from '../LaneRefList';
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
});
