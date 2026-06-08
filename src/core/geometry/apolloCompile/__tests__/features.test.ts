import { beforeEach, describe, expect, it } from 'vitest';
import {
  LANE_CENTER_LINE_OPACITY,
  LANE_CENTER_LINE_WIDTH,
  LANE_EDGE_LINE_OPACITY,
  LANE_EDGE_LINE_WIDTH,
  LANE_FILL_OPACITY,
} from '@/config/mapConstants';
import { useSettingsStore } from '@/store/settingsStore';
import type {
  ApolloEntity,
  ApolloPolygon,
  AreaEntity,
  BarrierGateEntity,
  ClearAreaEntity,
  CrosswalkEntity,
  Curve,
  JunctionEntity,
  LaneEntity,
  ParkingSpaceEntity,
  PNCJunctionEntity,
  SignalEntity,
  SpeedBumpEntity,
  StopSignEntity,
  YieldSignEntity,
} from '@/types/apollo';
import { pointsToCurve } from '../conversions';
import { compileApolloFeatures } from '../features';

const p = (x: number, y: number, z?: number) => (z === undefined ? { x, y } : { x, y, z });
const poly = (...points: { x: number; y: number }[]): ApolloPolygon => ({ points });
const line = (...points: { x: number; y: number }[]): Curve => pointsToCurve(points);

function featureByRole(features: GeoJSON.Feature[], role: string): GeoJSON.Feature | undefined {
  return features.find((feature) => feature.properties?.role === role);
}

function featuresByRole(features: GeoJSON.Feature[], role: string): GeoJSON.Feature[] {
  return features.filter((feature) => feature.properties?.role === role);
}

function geometryCoords(feature: GeoJSON.Feature): GeoJSON.Position[] {
  expect(feature.geometry.type).toBe('LineString');
  return (feature.geometry as GeoJSON.LineString).coordinates;
}

function pointCoords(feature: GeoJSON.Feature): GeoJSON.Position {
  expect(feature.geometry.type).toBe('Point');
  return (feature.geometry as GeoJSON.Point).coordinates;
}

function makeLane(overrides: Partial<LaneEntity> = {}): LaneEntity {
  return {
    id: 'lane_a',
    entityType: 'lane',
    centralCurve: line(p(0, 0), p(10, 0)),
    leftBoundary: { curve: { segments: [] }, boundaryType: [{ types: ['DOTTED_WHITE'] }] },
    rightBoundary: { curve: { segments: [] }, boundaryType: [{ types: ['DOTTED_WHITE'] }] },
    length: 10,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 12,
    predecessorIds: [],
    successorIds: [],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId: null,
    overlapIds: [],
    leftSamples: [{ s: 0, width: 1 }],
    rightSamples: [{ s: 0, width: 2 }],
    leftRoadSamples: [],
    rightRoadSamples: [],
    ...overrides,
  };
}

describe('compileApolloFeatures lane renderer', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      laneFillOpacity: LANE_FILL_OPACITY,
      laneEdgeLineWidth: LANE_EDGE_LINE_WIDTH,
      laneEdgeLineOpacity: LANE_EDGE_LINE_OPACITY,
      laneCenterLineWidth: LANE_CENTER_LINE_WIDTH,
      laneCenterLineOpacity: LANE_CENTER_LINE_OPACITY,
    });
  });

  it('emits lane fill, hidden boundary base lines, and a directional center line with stable ids', () => {
    const features = compileApolloFeatures(makeLane());

    expect(features).toHaveLength(4);
    const fill = features.find((feature) => feature.properties?.noStroke === true);
    const leftEdge = featureByRole(features, 'laneEdgeLeft');
    const rightEdge = featureByRole(features, 'laneEdgeRight');
    const center = featureByRole(features, 'laneCenter');

    expect(fill?.id).toBe('lane_a:shape:noStroke');
    expect(fill?.geometry.type).toBe('Polygon');
    expect(fill?.properties).toMatchObject({
      id: 'lane_a',
      entityType: 'lane',
      color: '#4a9eff',
      fillOpacity: LANE_FILL_OPACITY,
      noStroke: true,
    });

    expect(leftEdge?.id).toBe('lane_a:laneEdgeLeft:noStroke:left');
    expect(leftEdge?.properties).toMatchObject({
      boundarySide: 'left',
      boundaryBase: true,
      lineWidth: LANE_EDGE_LINE_WIDTH,
      lineOpacity: LANE_EDGE_LINE_OPACITY,
      noStroke: true,
    });
    expect(rightEdge?.id).toBe('lane_a:laneEdgeRight:noStroke:right');
    expect(rightEdge?.properties).toMatchObject({ boundarySide: 'right', boundaryBase: true });

    expect(center?.id).toBe('lane_a:laneCenter:forward');
    expect(center?.properties).toMatchObject({
      color: '#ffffff',
      dashed: true,
      laneDirection: 'forward',
      lineWidth: LANE_CENTER_LINE_WIDTH,
      lineOpacity: LANE_CENTER_LINE_OPACITY,
    });
    expect(geometryCoords(center!)).toEqual([
      [0, 0],
      [10, 0],
    ]);
  });

  it('uses lane type color and reverses backward centerline direction', () => {
    const lane = makeLane({ id: 'lane_back', type: 'BIKING', direction: 'BACKWARD' });
    const features = compileApolloFeatures(lane);
    const fill = features.find((feature) => feature.properties?.noStroke === true);
    const center = featureByRole(features, 'laneCenter');

    expect(fill?.properties?.color).toBe('#22cc44');
    expect(center?.id).toBe('lane_back:laneCenter:backward');
    expect(center?.properties?.laneDirection).toBe('backward');
    expect(geometryCoords(center!)).toEqual([
      [10, 0],
      [0, 0],
    ]);
  });

  it('emits forward and backward centerlines for bidirectional lanes', () => {
    const features = compileApolloFeatures(makeLane({ id: 'lane_bi', direction: 'BIDIRECTION' }));
    const centers = featuresByRole(features, 'laneCenter');

    expect(centers.map((feature) => feature.id).sort()).toEqual([
      'lane_bi:laneCenter:backward',
      'lane_bi:laneCenter:forward',
    ]);
    expect(centers.map((feature) => feature.properties?.laneDirection).sort()).toEqual([
      'backward',
      'forward',
    ]);
  });

  it('is silent for degenerate lane center geometry', () => {
    expect(compileApolloFeatures(makeLane({ centralCurve: line(p(0, 0)) }))).toEqual([]);
  });
});

describe('compileApolloFeatures signal and line-control renderers', () => {
  it('renders signal stop lines plus a rotated label at the line midpoint', () => {
    const signal: SignalEntity = {
      id: 'signal_a',
      entityType: 'signal',
      boundary: poly(p(0, 1, 0), p(0, 2, 1), p(0, 3, 1)),
      subsignals: [],
      type: 'MIX_3_VERTICAL',
      overlapIds: [],
      stopLines: [line(p(0, 0), p(4, 0))],
      signInfo: [],
    };

    const features = compileApolloFeatures(signal);

    expect(features).toHaveLength(2);
    expect(features[0]?.geometry.type).toBe('LineString');
    expect(features[0]?.properties).toMatchObject({
      id: 'signal_a',
      entityType: 'signal',
      color: '#22cc44',
      lineWidth: 4,
    });
    const label = featureByRole(features, 'label');
    expect(label?.id).toBe('signal_a:label');
    expect(label?.properties).toMatchObject({
      icon: 'icon-signal',
      labelSize: 22,
      iconRotate: expect.any(Number),
    });
    expect(pointCoords(label!)).toEqual([2, 0]);
  });

  it('renders boundary-only signals as a selectable label and never draws the boundary polygon', () => {
    const signal: SignalEntity = {
      id: 'signal_boundary',
      entityType: 'signal',
      boundary: poly(p(0, 0), p(4, 0), p(4, 2), p(0, 2)),
      subsignals: [],
      type: 'MIX_3_VERTICAL',
      overlapIds: [],
      stopLines: [],
      signInfo: [],
    };

    const features = compileApolloFeatures(signal);

    expect(features).toHaveLength(1);
    expect(features.every((feature) => feature.geometry.type !== 'Polygon')).toBe(true);
    expect(pointCoords(features[0]!)).toEqual([2, 1]);
    expect(features[0]?.properties).toMatchObject({
      role: 'label',
      icon: 'icon-signal',
      labelSize: 22,
    });
  });

  it('is silent for signals without stop lines or boundary points', () => {
    const signal: SignalEntity = {
      id: 'signal_empty',
      entityType: 'signal',
      boundary: poly(),
      subsignals: [],
      type: 'MIX_3_VERTICAL',
      overlapIds: [],
      stopLines: [],
      signInfo: [],
    };

    expect(compileApolloFeatures(signal)).toEqual([]);
  });

  it.each([
    ['stopSign', 'icon-stop', 4, false],
    ['yieldSign', 'icon-yield', 3, true],
    ['barrierGate', 'icon-barrier', 5, true],
  ] as const)(
    'renders %s stop line plus label properties',
    (entityType, icon, lineWidth, dashed) => {
      const entity = {
        id: `${entityType}_a`,
        entityType,
        stopLines: [line(p(1, 1), p(5, 1))],
        overlapIds: [],
        ...(entityType === 'stopSign' ? { type: 'ONE_WAY' } : {}),
        ...(entityType === 'barrierGate' ? { type: 'ROD', polygon: poly() } : {}),
      } as StopSignEntity | YieldSignEntity | BarrierGateEntity;

      const features = compileApolloFeatures(entity);
      const stopLine = features.find((feature) => feature.geometry.type === 'LineString');
      const label = featureByRole(features, 'label');

      expect(features).toHaveLength(2);
      expect(stopLine?.properties).toMatchObject({
        id: `${entityType}_a`,
        entityType,
        lineWidth,
        ...(dashed ? { dashed: true } : {}),
      });
      expect(label?.properties).toMatchObject({ role: 'label', icon, labelSize: 20 });
      expect(pointCoords(label!)).toEqual([3, 1]);
    },
  );

  it('renders speed bump as base and dashed overlays plus label', () => {
    const speedBump: SpeedBumpEntity = {
      id: 'speed_a',
      entityType: 'speedBump',
      position: [line(p(0, 3), p(4, 3))],
      overlapIds: [],
    };

    const features = compileApolloFeatures(speedBump);
    const lines = features.filter((feature) => feature.geometry.type === 'LineString');
    const label = featureByRole(features, 'label');

    expect(features).toHaveLength(3);
    expect(lines[0]?.properties).toMatchObject({
      color: '#443300',
      lineWidth: 10,
      lineOpacity: 0.4,
    });
    expect(lines[1]?.properties).toMatchObject({
      color: '#ffaa00',
      lineWidth: 10,
      lineOpacity: 0.8,
      dashed: true,
    });
    expect(label?.properties).toMatchObject({
      role: 'label',
      icon: 'icon-speed-bump',
      labelSize: 20,
    });
  });

  it('drops degenerate line-control curves but keeps valid curves in the same entity', () => {
    const stopSign: StopSignEntity = {
      id: 'stop_mixed',
      entityType: 'stopSign',
      stopLines: [line(p(0, 0)), line(p(0, 1), p(2, 1))],
      type: 'ONE_WAY',
      overlapIds: [],
    };

    const features = compileApolloFeatures(stopSign);

    expect(features.filter((feature) => feature.geometry.type === 'LineString')).toHaveLength(1);
    expect(features.filter((feature) => feature.geometry.type === 'Point')).toHaveLength(1);
    expect(pointCoords(featureByRole(features, 'label')!)).toEqual([0, 1]);
  });
});

describe('compileApolloFeatures polygon renderers', () => {
  it.each([
    ['junction', { fillOpacity: 0.35, lineWidth: 2 }],
    ['pncJunction', { fillOpacity: 0.2, lineWidth: 2, dashed: true }],
    ['crosswalk', { fillOpacity: 0.25, lineWidth: 2.5 }],
    ['clearArea', { fillOpacity: 0.25, lineWidth: 2 }],
    ['area', { fillOpacity: 0.25, lineWidth: 1.5 }],
  ] as const)('renders %s as a polygon with expected style properties', (entityType, style) => {
    const entity = {
      id: `${entityType}_a`,
      entityType,
      polygon: poly(p(0, 0), p(3, 0), p(3, 2), p(0, 2)),
      overlapIds: [],
      ...(entityType === 'junction' ? { type: 'CROSS_ROAD' } : {}),
      ...(entityType === 'pncJunction' ? { passageGroups: [] } : {}),
      ...(entityType === 'area' ? { type: 'Driveable' } : {}),
    } as JunctionEntity | PNCJunctionEntity | CrosswalkEntity | ClearAreaEntity | AreaEntity;

    const features = compileApolloFeatures(entity);

    expect(features).toHaveLength(1);
    expect(features[0]?.id).toBe(`${entityType}_a:shape`);
    expect(features[0]?.geometry.type).toBe('Polygon');
    expect(features[0]?.properties).toMatchObject({
      id: `${entityType}_a`,
      entityType,
      ...style,
    });
  });

  it('renders parking space polygon and area-weighted label', () => {
    const parkingSpace: ParkingSpaceEntity = {
      id: 'parking_a',
      entityType: 'parkingSpace',
      polygon: poly(p(0, 0), p(4, 0), p(4, 2), p(0, 2)),
      heading: 0,
      overlapIds: [],
    };

    const features = compileApolloFeatures(parkingSpace);
    const polygon = features.find((feature) => feature.geometry.type === 'Polygon');
    const label = featureByRole(features, 'label');

    expect(features).toHaveLength(2);
    expect(polygon?.properties).toMatchObject({ fillOpacity: 0.4, lineWidth: 1.5 });
    expect(label?.id).toBe('parking_a:label');
    expect(label?.properties).toMatchObject({
      icon: 'icon-parking',
      labelSize: 22,
    });
    expect(pointCoords(label!)).toEqual([2, 1]);
  });

  it('uses averaged centroid for degenerate parking polygons that still have at least three points', () => {
    const parkingSpace: ParkingSpaceEntity = {
      id: 'parking_line',
      entityType: 'parkingSpace',
      polygon: poly(p(0, 0), p(2, 0), p(4, 0)),
      heading: 0,
      overlapIds: [],
    };

    const features = compileApolloFeatures(parkingSpace);

    expect(features).toHaveLength(2);
    expect(pointCoords(featureByRole(features, 'label')!)).toEqual([2, 0]);
  });

  it.each([
    ['junction', { type: 'CROSS_ROAD' }],
    ['pncJunction', { passageGroups: [] }],
    ['parkingSpace', { heading: 0 }],
    ['crosswalk', {}],
    ['clearArea', {}],
    ['area', { type: 'Driveable' }],
  ] as const)('is silent for %s polygons with fewer than three points', (entityType, extra) => {
    const entity = {
      id: `${entityType}_degenerate`,
      entityType,
      polygon: poly(p(0, 0), p(1, 1)),
      overlapIds: [],
      ...extra,
    } as
      | JunctionEntity
      | PNCJunctionEntity
      | ParkingSpaceEntity
      | CrosswalkEntity
      | ClearAreaEntity
      | AreaEntity;

    expect(compileApolloFeatures(entity)).toEqual([]);
  });
});

describe('compileApolloFeatures unsupported entity variants', () => {
  it('returns no features for known Apollo types without renderers', () => {
    const unsupported: ApolloEntity[] = [
      { id: 'parking_lot_a', entityType: 'parkingLot', polygon: poly(), overlapIds: [] },
      { id: 'rsu_a', entityType: 'rsu', junctionId: null, overlapIds: [] },
      { id: 'overlap_a', entityType: 'overlap', objects: [], regionOverlaps: [] },
      {
        id: 'speed_control_a',
        entityType: 'speedControl',
        name: 'school',
        speedLimit: 5,
        polygon: poly(),
      },
    ];

    expect(unsupported.flatMap(compileApolloFeatures)).toEqual([]);
  });
});
