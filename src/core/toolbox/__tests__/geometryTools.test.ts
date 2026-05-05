import { describe, expect, it } from 'vitest';
import { rederiveEditableGeometry, simplifyRoadGeometry } from '../geometryTools';
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

function mapOf(...entities: MapEntity[]) {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

describe('toolbox geometry tools', () => {
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

  it('recomputes derived lane fields without changing point counts', () => {
    const lane = makeLane('lane_1', [point(0, 0), point(10, 0)], 999);

    const result = rederiveEditableGeometry(mapOf(lane));
    const next = result.changes.get('lane_1') as LaneEntity;

    expect(next.length).not.toBe(999);
    expect(result.before.pointCount).toBe(result.after.pointCount);
  });
});
