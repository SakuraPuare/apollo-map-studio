/**
 * Regression tests for the 3 polygon-vs-polyline gaps that pre-existed
 * the editor_meta refactor:
 *
 *   GAP #1 — road previously emitted ZERO cold-layer features, hiding
 *            imported road entities entirely. Now: outer-boundary edges
 *            render as polylines (no fill, dashed grey).
 *
 *   GAP #2 — signal with empty stopLines previously emitted ZERO cold
 *            features (label only fires when stopLines is non-empty),
 *            making boundary-only signals invisible. Now: falls back
 *            to a label icon at the boundary centroid.
 *
 *   GAP #3 — RoadEntity had no editPoints case → selecting a road
 *            yielded 0 vertices, blocking drag/edit. Now: surfaces the
 *            first section's first outer edge as the editable polyline.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LANE_BOUNDARY_TYPE,
  DEFAULT_LANE_HALF_WIDTH,
  DEFAULT_LANE_SPEED_LIMIT_MPS,
} from '@/config/mapConstants';
import { compileApolloFeatures, createApolloEntity, pointsToCurve } from '../apolloCompile';
import { laneFillGeometry } from '../apolloCompile/laneFillGeometry';
import {
  getApolloEditPoints,
  moveApolloEntity,
  setAllApolloEditPoints,
} from '../apolloCompile/editPoints';
import type {
  AreaEntity,
  BarrierGateEntity,
  Curve,
  LaneEntity,
  RoadEntity,
  SignalEntity,
  SpeedBumpEntity,
  StopSignEntity,
  YieldSignEntity,
} from '@/types/apollo';
import type { BezierAnchor } from '@/core/geometry/interpolate';

const pt = (x: number, y: number) => ({ x, y });

function multiSegmentCurve(segments: { x: number; y: number }[][]): Curve {
  return {
    segments: segments.map((points) => ({
      lineSegment: { points },
      s: 0,
      startPosition: points[0] ?? pt(0, 0),
      heading: 0,
      length: 0,
    })),
  };
}

function laneLine(
  features: GeoJSON.Feature[],
  id: string,
  role: 'laneEdgeLeft' | 'laneEdgeRight',
): GeoJSON.Feature<GeoJSON.LineString> | undefined {
  return features.find(
    (feature) => feature.properties?.id === id && feature.properties?.role === role,
  ) as GeoJSON.Feature<GeoJSON.LineString> | undefined;
}

describe('GAP #1 — road outer boundary renders as polylines', () => {
  it('emits one LineString per outer edge with role=roadBoundary', () => {
    const road: RoadEntity = {
      id: 'r_1',
      entityType: 'road',
      sections: [
        {
          id: 's_1',
          laneIds: ['lane_a'],
          boundary: {
            outerPolygon: {
              edges: [
                {
                  type: 'LEFT_BOUNDARY',
                  curve: {
                    segments: [
                      {
                        lineSegment: {
                          points: [
                            { x: 0, y: 0 },
                            { x: 1, y: 0 },
                            { x: 2, y: 0 },
                          ],
                        },
                        s: 0,
                        startPosition: { x: 0, y: 0 },
                        heading: 0,
                        length: 0,
                      },
                    ],
                  },
                },
                {
                  type: 'RIGHT_BOUNDARY',
                  curve: {
                    segments: [
                      {
                        lineSegment: {
                          points: [
                            { x: 0, y: 1 },
                            { x: 1, y: 1 },
                            { x: 2, y: 1 },
                          ],
                        },
                        s: 0,
                        startPosition: { x: 0, y: 1 },
                        heading: 0,
                        length: 0,
                      },
                    ],
                  },
                },
              ],
            },
            holes: [],
          },
        },
      ],
      junctionId: null,
      type: 'CITY_ROAD',
    };

    const features = compileApolloFeatures(road);
    const polygons = features.filter((f) => f.geometry.type === 'Polygon');
    const lines = features.filter((f) => f.geometry.type === 'LineString');
    expect(polygons.length).toBe(0);
    expect(lines.length).toBe(2);
    expect(lines.every((f) => f.properties?.role === 'roadBoundary')).toBe(true);
    const types = lines.map((f) => f.properties?.boundaryType).sort();
    expect(types).toEqual(['LEFT_BOUNDARY', 'RIGHT_BOUNDARY']);
  });

  it('road with no boundary section is silent (no features, no crash)', () => {
    const road: RoadEntity = {
      id: 'r_2',
      entityType: 'road',
      sections: [{ id: 's_1', laneIds: [] }],
      junctionId: null,
      type: 'CITY_ROAD',
    };
    expect(compileApolloFeatures(road)).toEqual([]);
  });
});

describe('GAP #2 — signal with empty stopLines stays visible', () => {
  it('emits a label point at boundary centroid when stopLines is empty', () => {
    const signal: SignalEntity = {
      id: 'sig_1',
      entityType: 'signal',
      boundary: {
        points: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 2 },
          { x: 0, y: 2 },
        ],
      },
      subsignals: [],
      type: 'MIX_3_VERTICAL',
      overlapIds: [],
      stopLines: [],
      signInfo: [],
    };
    const features = compileApolloFeatures(signal);
    expect(features.length).toBeGreaterThanOrEqual(1);
    const label = features.find((f) => f.properties?.role === 'label');
    expect(label).toBeDefined();
    expect(label!.geometry.type).toBe('Point');
    const [lng, lat] = (label!.geometry as GeoJSON.Point).coordinates;
    expect(lng).toBeCloseTo(1, 6);
    expect(lat).toBeCloseTo(1, 6);
    // Critically: no Polygon — boundary is 3D semantics, never drawn as fill.
    expect(features.every((f) => f.geometry.type !== 'Polygon')).toBe(true);
  });

  it('still renders stopLines as polylines when present (no regression)', () => {
    const signal: SignalEntity = {
      id: 'sig_2',
      entityType: 'signal',
      boundary: { points: [] },
      subsignals: [],
      type: 'MIX_3_VERTICAL',
      overlapIds: [],
      stopLines: [
        {
          segments: [
            {
              lineSegment: {
                points: [
                  { x: 0, y: 0 },
                  { x: 5, y: 0 },
                ],
              },
              s: 0,
              startPosition: { x: 0, y: 0 },
              heading: 0,
              length: 5,
            },
          ],
        },
      ],
      signInfo: [],
    };
    const features = compileApolloFeatures(signal);
    const lines = features.filter((f) => f.geometry.type === 'LineString');
    expect(lines.length).toBe(1);
  });
});

describe('GAP #3 — road editPoints surface the first outer edge', () => {
  function makeRoadWithEdge(points: { x: number; y: number }[]): RoadEntity {
    return {
      id: 'r_edit',
      entityType: 'road',
      sections: [
        {
          id: 's_1',
          laneIds: [],
          boundary: {
            outerPolygon: {
              edges: [
                {
                  type: 'LEFT_BOUNDARY',
                  curve: {
                    segments: [
                      {
                        lineSegment: { points },
                        s: 0,
                        startPosition: points[0]!,
                        heading: 0,
                        length: 0,
                      },
                    ],
                  },
                },
              ],
            },
            holes: [],
          },
        },
      ],
      junctionId: null,
      type: 'CITY_ROAD',
    };
  }

  it('returns the first outer edge points (not empty)', () => {
    const road = makeRoadWithEdge([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    const pts = getApolloEditPoints(road);
    expect(pts.length).toBe(3);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[2]).toEqual({ x: 2, y: 0 });
  });

  it('round-trips edited points back into the road structure', () => {
    const road = makeRoadWithEdge([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const moved = setAllApolloEditPoints(road, [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]) as RoadEntity;
    const newPts =
      moved.sections[0]?.boundary?.outerPolygon.edges[0]?.curve.segments[0]?.lineSegment.points;
    expect(newPts).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]);
  });
});

describe('GAP #4 — imported lane boundaries render from Apollo polylines', () => {
  it('uses leftBoundary/rightBoundary curves instead of synthetic centerline offsets', () => {
    const center = [pt(116, 39.9), pt(116.0004, 39.9002), pt(116.0008, 39.9)];
    const leftBoundary = [pt(116, 39.901), pt(116.0008, 39.901)];
    const rightBoundary = [pt(116, 39.899), pt(116.0004, 39.8988), pt(116.0008, 39.899)];
    const lane = createApolloEntity(
      'lane',
      'drawPolyline',
      center.map((point) => [point.x, point.y]),
      [],
    ) as LaneEntity;
    lane.leftBoundary.curve = pointsToCurve(leftBoundary);
    lane.rightBoundary.curve = pointsToCurve(rightBoundary);

    const features = compileApolloFeatures(lane);
    const leftEdge = laneLine(features, lane.id, 'laneEdgeLeft');
    const rightEdge = laneLine(features, lane.id, 'laneEdgeRight');
    const fill = features.find((feature) => feature.geometry.type === 'Polygon') as
      | GeoJSON.Feature<GeoJSON.Polygon>
      | undefined;

    expect(leftEdge?.geometry.coordinates).toEqual(leftBoundary.map((point) => [point.x, point.y]));
    expect(rightEdge?.geometry.coordinates).toEqual(
      rightBoundary.map((point) => [point.x, point.y]),
    );
    expect(fill?.geometry.coordinates[0]?.slice(0, 5)).toEqual([
      ...leftBoundary.map((point) => [point.x, point.y]),
      ...[...rightBoundary].reverse().map((point) => [point.x, point.y]),
    ]);
  });

  it('normalizes a self-intersecting imported lane corridor before fill rendering', () => {
    const lane = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [0, 0],
        [2, 0],
      ],
      [],
    ) as LaneEntity;
    lane.leftBoundary.curve = pointsToCurve([pt(0, 0), pt(3, 3)]);
    lane.rightBoundary.curve = pointsToCurve([pt(0, 2), pt(2, 0)]);

    const features = compileApolloFeatures(lane);
    const fill = features.find(
      (feature) =>
        feature.properties?.noStroke === true && feature.geometry.type === 'MultiPolygon',
    ) as GeoJSON.Feature<GeoJSON.MultiPolygon> | undefined;

    expect(fill).toBeDefined();
    expect(fill!.geometry.coordinates).toHaveLength(2);
    expect(features.some((feature) => feature.geometry.type === 'Polygon')).toBe(false);
  });

  it('self-crossing drawn lane fill stays near the lane strip instead of the outer envelope', () => {
    const lane = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [0, 0],
        [6, 0],
        [1, -5],
        [5, -5],
      ],
      [],
      { laneHalfWidth: 0.2 },
    ) as LaneEntity;

    const features = compileApolloFeatures(lane);
    const fill = features.find((feature) => feature.properties?.noStroke === true) as
      | GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
      | undefined;

    expect(fill).toBeDefined();
    expect(geometryArea(fill!.geometry)).toBeLessThan(6);
  });

  it('near-closed drawn lane loop fill does not expand to the loop envelope', () => {
    const lane = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [0, 0],
        [6, 0],
        [6, -4],
        [0, -4],
        [0.1, 0],
      ],
      [],
      { laneHalfWidth: 0.2 },
    ) as LaneEntity;

    const features = compileApolloFeatures(lane);
    const fill = features.find((feature) => feature.properties?.noStroke === true) as
      | GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
      | undefined;

    expect(fill).toBeDefined();
    expect(geometryArea(fill!.geometry)).toBeLessThan(5);
  });

  it('open U-shaped drawn lane keeps the continuous whole corridor fill', () => {
    const lane = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [0, 0],
        [0, 6],
        [8, 6],
        [8, 0],
      ],
      [],
      { laneHalfWidth: 0.2 },
    ) as LaneEntity;

    const features = compileApolloFeatures(lane);
    const leftEdge = laneLine(features, lane.id, 'laneEdgeLeft');
    const rightEdge = laneLine(features, lane.id, 'laneEdgeRight');
    const fill = features.find((feature) => feature.properties?.noStroke === true) as
      | GeoJSON.Feature<GeoJSON.Polygon>
      | undefined;

    expect(fill?.geometry.type).toBe('Polygon');
    expect(fill!.geometry.coordinates[0]?.slice(0, leftEdge!.geometry.coordinates.length)).toEqual(
      leftEdge!.geometry.coordinates,
    );
    expect(fill!.geometry.coordinates[0]?.at(-2)).toEqual(rightEdge!.geometry.coordinates[0]);
  });

  it('folded drawn lane fill remains the union of segment strips', () => {
    const lane = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [0, 0],
        [7, 1],
        [7, -4],
        [5, -1],
        [1, 3],
      ],
      [],
      { laneHalfWidth: 0.25 },
    ) as LaneEntity;

    const features = compileApolloFeatures(lane);
    const fill = features.find((feature) => feature.properties?.noStroke === true) as
      | GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
      | undefined;

    expect(fill).toBeDefined();
    expect(geometryArea(fill!.geometry)).toBeLessThan(12);
  });

  it('folded Bezier lane fill does not use the outer envelope', () => {
    const anchors: BezierAnchor[] = [
      { point: [0, 0], handleIn: null, handleOut: [3, 0] },
      { point: [8, 0], handleIn: [5, 0], handleOut: [8, -2] },
      { point: [8, -5], handleIn: [8, -3], handleOut: [5, -5] },
      { point: [2, -5], handleIn: [5, -5], handleOut: [2, -3] },
      { point: [2, -1], handleIn: [2, -3], handleOut: null },
    ];
    const lane = createApolloEntity('lane', 'drawBezier', [], anchors, {
      laneHalfWidth: 0.2,
    }) as LaneEntity;

    const features = compileApolloFeatures(lane);
    const fill = features.find((feature) => feature.properties?.noStroke === true) as
      | GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
      | undefined;

    expect(fill).toBeDefined();
    expect(geometryArea(fill!.geometry)).toBeLessThan(8);
  });

  it('crossed synthetic lane edges fall back to centerline segment strips', () => {
    const fillGeometry = laneFillGeometry({
      centerPts: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
      ],
      leftEdge: [
        { x: 0, y: 1 },
        { x: 8, y: -1 },
      ],
      rightEdge: [
        { x: 0, y: -1 },
        { x: 8, y: 1 },
      ],
      leftWidthMeters: 0.2,
      rightWidthMeters: 0.2,
      syntheticEdges: true,
    });

    expect(fillGeometry).not.toBeNull();
    expect(geometryArea(fillGeometry!)).toBeLessThan(0.001);
  });

  it('orients reversed imported boundaries to the central curve direction', () => {
    const center = [pt(116, 39.9), pt(116.001, 39.9)];
    const leftBoundary = [pt(116.001, 39.901), pt(116, 39.901)];
    const rightBoundary = [pt(116.001, 39.899), pt(116, 39.899)];
    const lane = createApolloEntity(
      'lane',
      'drawPolyline',
      center.map((point) => [point.x, point.y]),
      [],
    ) as LaneEntity;
    lane.leftBoundary.curve = pointsToCurve(leftBoundary);
    lane.rightBoundary.curve = pointsToCurve(rightBoundary);

    const features = compileApolloFeatures(lane);
    const leftEdge = laneLine(features, lane.id, 'laneEdgeLeft');

    expect(leftEdge?.geometry.coordinates).toEqual([
      [116, 39.901],
      [116.001, 39.901],
    ]);
  });

  it('uses every line segment in imported centralCurve polylines', () => {
    const lane = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [116, 39.9],
        [116.001, 39.9],
      ],
      [],
    ) as LaneEntity;
    lane.centralCurve = multiSegmentCurve([
      [pt(116, 39.9), pt(116.0005, 39.9)],
      [pt(116.0005, 39.9), pt(116.001, 39.9002)],
      [pt(116.001, 39.9002), pt(116.0015, 39.9002)],
    ]);

    const features = compileApolloFeatures(lane);
    const center = features.find((feature) => feature.properties?.role === 'laneCenter') as
      | GeoJSON.Feature<GeoJSON.LineString>
      | undefined;
    const leftEdge = laneLine(features, lane.id, 'laneEdgeLeft');

    expect(center?.geometry.coordinates).toEqual([
      [116, 39.9],
      [116.0005, 39.9],
      [116.001, 39.9002],
      [116.0015, 39.9002],
    ]);
    expect(leftEdge?.geometry.coordinates.length).toBe(4);
  });

  it('invalidates imported boundary curves when lane centerline shape is edited', () => {
    const lane = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [116, 39.9],
        [116.001, 39.9],
      ],
      [],
    ) as LaneEntity;
    const leftBoundary = [pt(116, 39.901), pt(116.001, 39.901)];
    const rightBoundary = [pt(116, 39.899), pt(116.001, 39.899)];
    lane.leftBoundary.curve = pointsToCurve(leftBoundary);
    lane.rightBoundary.curve = pointsToCurve(rightBoundary);

    const edited = setAllApolloEditPoints(lane, [
      pt(116, 39.9),
      pt(116.0005, 39.902),
      pt(116.001, 39.9),
    ]) as LaneEntity;
    const features = compileApolloFeatures(edited);

    expect(edited.leftBoundary.curve.segments).toEqual([]);
    expect(edited.rightBoundary.curve.segments).toEqual([]);
    expect(laneLine(features, lane.id, 'laneEdgeLeft')?.geometry.coordinates).not.toEqual(
      leftBoundary.map((point) => [point.x, point.y]),
    );
    expect(laneLine(features, lane.id, 'laneEdgeRight')?.geometry.coordinates).not.toEqual(
      rightBoundary.map((point) => [point.x, point.y]),
    );
  });

  it('translates imported boundary curves when moving the whole lane', () => {
    const lane = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [116, 39.9],
        [116.001, 39.9],
      ],
      [],
    ) as LaneEntity;
    lane.leftBoundary.curve = pointsToCurve([pt(116, 39.901), pt(116.001, 39.901)]);
    lane.rightBoundary.curve = pointsToCurve([pt(116, 39.899), pt(116.001, 39.899)]);

    const moved = moveApolloEntity(lane, 0.01, -0.02) as LaneEntity;
    const features = compileApolloFeatures(moved);

    expect(laneLine(features, lane.id, 'laneEdgeLeft')?.geometry.coordinates).toEqual([
      [116.01, 39.881],
      [116.01100000000001, 39.881],
    ]);
    expect(laneLine(features, lane.id, 'laneEdgeRight')?.geometry.coordinates).toEqual([
      [116.01, 39.879],
      [116.01100000000001, 39.879],
    ]);
  });
});

describe('Apollo compile renderer branch gaps — degenerate controls and areas', () => {
  it('keeps a boundary-only signal selectable from a single boundary point without deriving rotation', () => {
    const signal: SignalEntity = {
      id: 'sig_point_only',
      entityType: 'signal',
      boundary: { points: [{ x: 7, y: 9, z: 3 }] },
      subsignals: [],
      type: 'MIX_3_VERTICAL',
      overlapIds: [],
      stopLines: [],
      signInfo: [],
    };

    const features = compileApolloFeatures(signal);

    expect(features).toHaveLength(1);
    expect(features[0]?.geometry.type).toBe('Point');
    expect((features[0]?.geometry as GeoJSON.Point).coordinates).toEqual([7, 9]);
    expect(features[0]?.properties).toMatchObject({
      role: 'label',
      icon: 'icon-signal',
      labelSize: 22,
    });
    expect(features[0]?.properties).not.toHaveProperty('iconRotate');
  });

  it.each([
    [
      'stopSign',
      {
        id: 'stop_empty',
        entityType: 'stopSign',
        stopLines: [],
        type: 'ONE_WAY',
        overlapIds: [],
      } satisfies StopSignEntity,
    ],
    [
      'yieldSign',
      {
        id: 'yield_empty',
        entityType: 'yieldSign',
        stopLines: [],
        overlapIds: [],
      } satisfies YieldSignEntity,
    ],
    [
      'barrierGate',
      {
        id: 'barrier_empty',
        entityType: 'barrierGate',
        type: 'ROD',
        polygon: { points: [pt(0, 0), pt(1, 0), pt(1, 1)] },
        stopLines: [],
        overlapIds: [],
      } satisfies BarrierGateEntity,
    ],
  ] as const)('does not draw fallback geometry for %s without stop lines', (_label, entity) => {
    expect(compileApolloFeatures(entity)).toEqual([]);
  });

  it.each([
    [
      'stopSign',
      'icon-stop',
      {
        id: 'stop_point',
        entityType: 'stopSign',
        stopLines: [pointsToCurve([pt(1, 2)])],
        type: 'ONE_WAY',
        overlapIds: [],
      } satisfies StopSignEntity,
    ],
    [
      'yieldSign',
      'icon-yield',
      {
        id: 'yield_point',
        entityType: 'yieldSign',
        stopLines: [pointsToCurve([pt(3, 4)])],
        overlapIds: [],
      } satisfies YieldSignEntity,
    ],
    [
      'barrierGate',
      'icon-barrier',
      {
        id: 'barrier_point',
        entityType: 'barrierGate',
        type: 'FENCE',
        polygon: { points: [] },
        stopLines: [pointsToCurve([pt(5, 6)])],
        overlapIds: [],
      } satisfies BarrierGateEntity,
    ],
    [
      'speedBump',
      'icon-speed-bump',
      {
        id: 'speed_point',
        entityType: 'speedBump',
        position: [pointsToCurve([pt(7, 8)])],
        overlapIds: [],
      } satisfies SpeedBumpEntity,
    ],
  ] as const)(
    'emits only a selectable label for single-point %s geometry',
    (_label, icon, entity) => {
      const features = compileApolloFeatures(entity);

      expect(features.filter((feature) => feature.geometry.type === 'LineString')).toEqual([]);
      expect(features).toHaveLength(1);
      expect(features[0]?.geometry.type).toBe('Point');
      expect(features[0]?.properties).toMatchObject({ role: 'label', icon });
    },
  );

  it.each(['Driveable', 'UnDriveable', 'Custom1', 'Custom2', 'Custom3'] as const)(
    'renders %s areas with the same polygon styling',
    (type) => {
      const area: AreaEntity = {
        id: `area_${type}`,
        entityType: 'area',
        type,
        polygon: { points: [pt(0, 0), pt(2, 0), pt(1, 1)] },
        overlapIds: [],
      };

      const features = compileApolloFeatures(area);

      expect(features).toHaveLength(1);
      expect(features[0]?.geometry.type).toBe('Polygon');
      expect(features[0]?.properties).toMatchObject({
        entityType: 'area',
        fillOpacity: 0.25,
        lineWidth: 1.5,
      });
    },
  );
});

describe('Apollo compile factory branch gaps — defaults and degenerate draw results', () => {
  it('uses lane defaults when options and source draw info are absent', () => {
    const lane = createApolloEntity('lane', 'drawPolyline', [], [], {
      entities: new Map(),
    }) as LaneEntity;

    expect(lane.turn).toBe('NO_TURN');
    expect(lane.length).toBe(0);
    expect(lane.speedLimit).toBe(DEFAULT_LANE_SPEED_LIMIT_MPS);
    expect(lane.leftSamples).toEqual([{ s: 0, width: DEFAULT_LANE_HALF_WIDTH }]);
    expect(lane.rightSamples).toEqual([{ s: 0, width: DEFAULT_LANE_HALF_WIDTH }]);
    expect(lane.leftBoundary.boundaryType).toEqual([{ s: 0, types: [DEFAULT_LANE_BOUNDARY_TYPE] }]);
    expect(lane.rightBoundary.boundaryType).toEqual([
      { s: 0, types: [DEFAULT_LANE_BOUNDARY_TYPE] },
    ]);
    expect(lane.centralCurve.segments[0]?.lineSegment.points).toEqual([]);
    expect(lane._source).toBeUndefined();
  });

  it('keeps an underspecified drawn signal as a single-point stop line without template geometry', () => {
    const signal = createApolloEntity('signal', 'drawPolyline', [[1, 2]], [], {
      entities: new Map(),
    }) as SignalEntity;

    expect(signal.boundary.points).toEqual([]);
    expect(signal.subsignals).toEqual([]);
    expect(signal.stopLines[0]?.segments[0]?.lineSegment.points).toEqual([pt(1, 2)]);
    expect(signal._source).toBeUndefined();

    const features = compileApolloFeatures(signal);
    expect(features).toHaveLength(1);
    expect(features[0]?.geometry.type).toBe('Point');
    expect((features[0]?.geometry as GeoJSON.Point).coordinates).toEqual([1, 2]);
    expect(features[0]?.properties).not.toHaveProperty('iconRotate');
  });

  it('records source metadata for arc, Catmull-Rom, and rotated-rectangle factories', () => {
    const stop = createApolloEntity(
      'stopSign',
      'drawArc',
      [
        [0, 0],
        [1, 1],
        [2, 0],
      ],
      [],
      { entities: new Map() },
    ) as StopSignEntity;
    const bump = createApolloEntity(
      'speedBump',
      'drawCatmullRom',
      [
        [0, 0],
        [1, 1],
        [2, 0],
      ],
      [],
      { entities: new Map() },
    ) as SpeedBumpEntity;
    const area = createApolloEntity(
      'area',
      'drawRotatedRect',
      [
        [0, 0],
        [2, 0],
        [0, 1],
      ],
      [],
      { entities: new Map() },
    ) as AreaEntity;

    expect(stop._source).toMatchObject({
      drawTool: 'drawArc',
      arcPoints: [pt(0, 0), pt(1, 1), pt(2, 0)],
    });
    expect(stop.stopLines[0]?.segments[0]?.lineSegment.points.length).toBeGreaterThan(3);
    expect(bump._source).toMatchObject({
      drawTool: 'drawCatmullRom',
      points: [pt(0, 0), pt(1, 1), pt(2, 0)],
    });
    expect(bump.position[0]?.segments[0]?.lineSegment.points.length).toBeGreaterThan(3);
    expect(area._sourceRect).toEqual({
      p1: pt(0, -1),
      p2: pt(2, 1),
      rotation: -0,
    });
    expect(area.polygon.points).toHaveLength(5);
  });
});

function geometryArea(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  if (geometry.type === 'Polygon') return polygonArea(geometry.coordinates);
  return geometry.coordinates.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
}

function polygonArea(polygon: GeoJSON.Position[][]): number {
  const outer = ringArea(polygon[0] ?? []);
  const holes = polygon.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0);
  return Math.max(0, outer - holes);
}

function ringArea(ring: GeoJSON.Position[]): number {
  let area2 = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!;
    const b = ring[i]!;
    area2 += (a[0] ?? 0) * (b[1] ?? 0) - (b[0] ?? 0) * (a[1] ?? 0);
  }
  return Math.abs(area2 / 2);
}
