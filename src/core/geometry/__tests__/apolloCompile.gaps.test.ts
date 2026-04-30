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
import { compileApolloFeatures } from '../apolloCompile';
import { getApolloEditPoints, setAllApolloEditPoints } from '../apolloCompile/editPoints';
import type { RoadEntity, SignalEntity } from '@/types/apollo';

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
