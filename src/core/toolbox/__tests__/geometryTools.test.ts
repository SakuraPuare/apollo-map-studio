import { describe, expect, it } from 'vitest';
import {
  collectGeometryStats,
  rederiveEditableGeometry,
  simplifyRoadGeometry,
} from '../geometryTools';
import {
  collectGeometryStats as collectGeometryStatsFromToolbox,
  rederiveEditableGeometry as rederiveEditableGeometryFromToolbox,
  simplifyRoadGeometry as simplifyRoadGeometryFromToolbox,
} from '..';
import type { LaneEntity, RoadEntity } from '@/types/apollo';
import type { GeoPoint, MapEntity } from '@/types/entities';

const DEG_PER_M = 1 / 111320;

function point(xMeters: number, yMeters: number): GeoPoint {
  return { x: xMeters * DEG_PER_M, y: yMeters * DEG_PER_M };
}

function makeLane(id: string, points: GeoPoint[], length = 1): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: {
      segments: [
        {
          lineSegment: { points },
          s: 0,
          startPosition: points[0],
          heading: 0,
          length,
        },
      ],
    },
    leftBoundary: {
      curve: {
        segments: [{ lineSegment: { points: points.map((p) => ({ ...p, y: p.y + 1e-6 })) } }],
      },
      length,
      boundaryType: [],
    },
    rightBoundary: {
      curve: {
        segments: [{ lineSegment: { points: points.map((p) => ({ ...p, y: p.y - 1e-6 })) } }],
      },
      length,
      boundaryType: [],
    },
    length,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 10,
    predecessorIds: [],
    successorIds: [],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId: null,
    overlapIds: [],
    leftSamples: [],
    rightSamples: [],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

function makeRoad(id: string, points: GeoPoint[]): RoadEntity {
  return {
    id,
    entityType: 'road',
    sections: [
      {
        id: `${id}_section`,
        laneIds: [],
        boundary: {
          outerPolygon: {
            edges: [{ type: 'NORMAL', curve: { segments: [{ lineSegment: { points } }] } }],
          },
          holes: [],
        },
      },
    ],
    junctionId: null,
    type: 'CITY_ROAD',
  };
}

function makeRoadWithHole(id: string, outerPoints: GeoPoint[], holePoints: GeoPoint[]): RoadEntity {
  return {
    id,
    entityType: 'road',
    sections: [
      {
        id: `${id}_section`,
        laneIds: [],
        boundary: {
          outerPolygon: {
            edges: [
              { type: 'NORMAL', curve: { segments: [{ lineSegment: { points: outerPoints } }] } },
            ],
          },
          holes: [
            {
              edges: [
                { type: 'NORMAL', curve: { segments: [{ lineSegment: { points: holePoints } }] } },
              ],
            },
          ],
        },
      },
    ],
    junctionId: null,
    type: 'CITY_ROAD',
  };
}

function makeMultiSegmentLane(id: string): LaneEntity {
  const first = [point(0, 0), point(10, 0.01), point(20, 0)];
  const second = [point(20, 0), point(25, 0), point(30, 0)];
  const lane = makeLane(id, first);
  lane.centralCurve = {
    segments: [
      {
        lineSegment: { points: first },
        s: 0,
        startPosition: first[0],
        heading: 0,
        length: 20,
      },
      {
        lineSegment: { points: second },
        s: 999,
        startPosition: second[0],
        heading: 0.25,
        length: 10,
      },
    ],
  };
  lane.leftBoundary.curve = { segments: [{ lineSegment: { points: first } }] };
  lane.rightBoundary.curve = { segments: [{ lineSegment: { points: first } }] };
  return lane;
}

function mapOf(...entities: MapEntity[]) {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

describe('toolbox geometry tools', () => {
  it('exposes geometry command helpers through the toolbox entrypoint', () => {
    expect(collectGeometryStatsFromToolbox).toBe(collectGeometryStats);
    expect(rederiveEditableGeometryFromToolbox).toBe(rederiveEditableGeometry);
    expect(simplifyRoadGeometryFromToolbox).toBe(simplifyRoadGeometry);
  });

  it('returns no changes and preserves before stats when tolerance is zero or negative', () => {
    const lane = makeLane('lane_1', [point(0, 0), point(10, 0.02), point(20, 0)]);

    const zero = simplifyRoadGeometry(mapOf(lane), { toleranceMeters: 0 });
    const negative = simplifyRoadGeometry(mapOf(lane), { toleranceMeters: -10 });

    expect(zero.changes.size).toBe(0);
    expect(zero.after).toEqual(zero.before);
    expect(negative.changes.size).toBe(0);
    expect(negative.after).toEqual(negative.before);
  });

  it('collects stats only from lane and road geometry entities', () => {
    const lane = makeLane('lane_1', [point(0, 0), point(10, 0)]);
    const drawing: MapEntity = {
      id: 'poly_1',
      entityType: 'polyline',
      points: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    };

    expect(collectGeometryStats(mapOf(lane, drawing))).toEqual({
      entityCount: 1,
      curveCount: 3,
      pointCount: 6,
    });
  });

  it('downsamples lane and road curves inside the meter tolerance', () => {
    const lane = makeLane('lane_1', [point(0, 0), point(10, 0.02), point(20, 0)]);
    const road = makeRoad('road_1', [point(0, 0), point(5, 0.01), point(10, 0)]);

    const result = simplifyRoadGeometry(mapOf(lane, road), { toleranceMeters: 0.1 });

    expect(result.changes.size).toBe(2);
    expect(result.before.pointCount).toBe(12);
    expect(result.after.pointCount).toBe(8);
    expect(
      (result.changes.get('lane_1') as LaneEntity).centralCurve.segments[0]!.lineSegment.points,
    ).toHaveLength(2);
    expect(
      (result.changes.get('road_1') as RoadEntity).sections[0]!.boundary!.outerPolygon.edges[0]!
        .curve.segments[0]!.lineSegment.points,
    ).toHaveLength(2);
  });

  it('keeps points needed to stay within the tolerance', () => {
    const lane = makeLane('lane_1', [point(0, 0), point(10, 2), point(20, 0)]);

    const result = simplifyRoadGeometry(mapOf(lane), { toleranceMeters: 0.5 });

    expect(result.changes.size).toBe(0);
    expect(result.after.pointCount).toBe(result.before.pointCount);
  });

  it('does not mark two-point or unsupported geometry as changed in batch summaries', () => {
    const lane = makeLane('lane_1', [point(0, 0), point(10, 0)]);
    const drawing: MapEntity = {
      id: 'poly_1',
      entityType: 'polyline',
      points: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    };

    const result = simplifyRoadGeometry(mapOf(lane, drawing), { toleranceMeters: 1 });

    expect(result.changes.size).toBe(0);
    expect(result.before).toEqual({ entityCount: 1, curveCount: 3, pointCount: 6 });
    expect(result.after).toEqual(result.before);
  });

  it('simplifies road hole boundaries as well as outer boundaries', () => {
    const road = makeRoadWithHole(
      'road_1',
      [point(0, 0), point(5, 0.01), point(10, 0)],
      [point(1, 1), point(2, 1.01), point(3, 1)],
    );

    const result = simplifyRoadGeometry(mapOf(road), { toleranceMeters: 0.1 });
    const next = result.changes.get('road_1') as RoadEntity;

    expect(
      next.sections[0]!.boundary!.outerPolygon.edges[0]!.curve.segments[0]!.lineSegment.points,
    ).toHaveLength(2);
    expect(
      next.sections[0]!.boundary!.holes[0]!.edges[0]!.curve.segments[0]!.lineSegment.points,
    ).toHaveLength(2);
  });

  it('updates road boundary summaries when only a hole polygon simplifies', () => {
    const outerPoints = [point(0, 0), point(10, 0)];
    const road = makeRoadWithHole('road_1', outerPoints, [
      point(1, 1),
      point(2, 1.01),
      point(3, 1),
    ]);

    const result = simplifyRoadGeometry(mapOf(road), { toleranceMeters: 0.1 });
    const next = result.changes.get('road_1') as RoadEntity;

    expect(result.changes.size).toBe(1);
    expect(result.before).toEqual({ entityCount: 1, curveCount: 2, pointCount: 5 });
    expect(result.after).toEqual({ entityCount: 1, curveCount: 2, pointCount: 4 });
    expect(
      next.sections[0]!.boundary!.outerPolygon.edges[0]!.curve.segments[0]!.lineSegment.points,
    ).toBe(outerPoints);
    expect(
      next.sections[0]!.boundary!.holes[0]!.edges[0]!.curve.segments[0]!.lineSegment.points,
    ).toHaveLength(2);
  });

  it('updates segment metadata and downstream s offsets after earlier segment simplification', () => {
    const lane = makeMultiSegmentLane('lane_1');

    const result = simplifyRoadGeometry(mapOf(lane), { toleranceMeters: 0.1 });
    const next = result.changes.get('lane_1') as LaneEntity;
    const [first, second] = next.centralCurve.segments;

    expect(first!.lineSegment.points).toHaveLength(2);
    expect(first!.startPosition).toEqual(first!.lineSegment.points[0]);
    expect(first!.length).toBeLessThan(20);
    expect(first!.heading).toBe(0);
    expect(second!.s).toBeCloseTo(first!.length!, 6);
  });

  it('keeps fallback heading when simplified segment collapses to identical endpoints', () => {
    const lane = makeLane('lane_1', [point(0, 0), point(0, 0.01), point(0, 0)], 1);

    const result = simplifyRoadGeometry(mapOf(lane), { toleranceMeters: 10 });
    const next = result.changes.get('lane_1') as LaneEntity;

    expect(next.centralCurve.segments[0]!.heading).toBe(0);
  });

  it('recomputes heading from simplified non-horizontal endpoints', () => {
    const lane = makeLane('lane_1', [point(0, 0), point(5, 5.01), point(10, 10)], 1);

    const result = simplifyRoadGeometry(mapOf(lane), { toleranceMeters: 0.1 });
    const next = result.changes.get('lane_1') as LaneEntity;

    expect(next.centralCurve.segments[0]!.heading).toBeGreaterThan(0);
  });

  it('recomputes derived lane fields without changing point counts', () => {
    const lane = makeLane('lane_1', [point(0, 0), point(10, 0)], 999);

    const result = rederiveEditableGeometry(mapOf(lane));
    const next = result.changes.get('lane_1') as LaneEntity;

    expect(next.length).not.toBe(999);
    expect(result.before.pointCount).toBe(result.after.pointCount);
  });

  it('leaves roads without editable boundary geometry unchanged', () => {
    const road: RoadEntity = {
      id: 'road_empty',
      entityType: 'road',
      sections: [{ id: 'road_empty_section', laneIds: [] }],
      junctionId: null,
      type: 'CITY_ROAD',
    };

    const result = simplifyRoadGeometry(mapOf(road), { toleranceMeters: 0.1 });

    expect(result.changes.size).toBe(0);
    expect(result.before).toEqual({ entityCount: 1, curveCount: 0, pointCount: 0 });
    expect(result.after).toEqual(result.before);
  });
});
