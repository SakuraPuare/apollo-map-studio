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
import { compileApolloFeatures, createApolloEntity, pointsToCurve } from '../apolloCompile';
import {
  getApolloEditPoints,
  moveApolloEntity,
  setAllApolloEditPoints,
} from '../apolloCompile/editPoints';
import type { Curve, LaneEntity, RoadEntity, SignalEntity } from '@/types/apollo';

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
