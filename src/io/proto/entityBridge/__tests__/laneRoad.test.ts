import { describe, expect, it } from 'vitest';
import type { Curve, LaneEntity, RoadEntity } from '@/types/apollo';
import {
  entityToRawLane,
  entityToRawRoad,
  rawLaneToEntity,
  rawRoadToEntity,
  type RawRoad,
} from '../laneRoad';
import type { RawPoint } from '../common';

function rawCurve(points: RawPoint[] = [{ x: 1, y: 2 }]) {
  return {
    segment: [
      {
        line_segment: { point: points },
        s: 3,
        start_position: { x: 4, y: 5 },
        heading: 6,
        length: 7,
      },
    ],
  };
}

function curve(points: Array<{ x: number; y: number; z?: number }> = [{ x: 1, y: 2 }]): Curve {
  return {
    segments: [
      {
        lineSegment: { points },
        s: 3,
        startPosition: { x: 4, y: 5 },
        heading: 6,
        length: 7,
      },
    ],
  };
}

function laneEntity(overrides: Partial<LaneEntity> = {}): LaneEntity {
  return {
    id: 'lane_1',
    entityType: 'lane',
    centralCurve: curve([{ x: 1, y: 2, z: 0 }]),
    leftBoundary: {
      curve: curve([{ x: 10, y: 11 }]),
      length: 12,
      virtual: true,
      boundaryType: [{ s: 0, types: ['SOLID_WHITE', 'CURB'] }],
    },
    rightBoundary: {
      curve: curve([{ x: 20, y: 21 }]),
      length: 13,
      virtual: false,
      boundaryType: [{ types: ['DOTTED_YELLOW'] }],
    },
    length: 100,
    type: 'CITY_DRIVING',
    turn: 'LEFT_TURN',
    direction: 'BIDIRECTION',
    speedLimit: 15,
    predecessorIds: ['pre_1'],
    successorIds: ['succ_1'],
    leftNeighborForwardIds: ['lnf_1'],
    rightNeighborForwardIds: ['rnf_1'],
    leftNeighborReverseIds: ['lnr_1'],
    rightNeighborReverseIds: ['rnr_1'],
    selfReverseLaneIds: ['rev_1'],
    junctionId: 'junction_1',
    overlapIds: ['overlap_1'],
    leftSamples: [{ s: 1, width: 2 }],
    rightSamples: [{ s: 3, width: 4 }],
    leftRoadSamples: [{ s: 5, width: 6 }],
    rightRoadSamples: [{ s: 7, width: 8 }],
    ...overrides,
  };
}

describe('laneRoad bridge — lanes', () => {
  it('drops raw lanes without a usable id', () => {
    expect(rawLaneToEntity({})).toBeNull();
    expect(rawLaneToEntity({ id: {} })).toBeNull();
  });

  it('imports a sparse raw lane with editor defaults and absent optional scalars', () => {
    expect(rawLaneToEntity({ id: { id: 'lane_sparse' } })).toEqual({
      id: 'lane_sparse',
      entityType: 'lane',
      centralCurve: { segments: [] },
      leftBoundary: { curve: { segments: [] }, boundaryType: [] },
      rightBoundary: { curve: { segments: [] }, boundaryType: [] },
      type: 'NONE',
      turn: 'NO_TURN',
      direction: 'FORWARD',
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
    });
  });

  it('imports populated raw lane fields and falls back for unknown enums/sample defaults', () => {
    const shared = rawCurve([{ x: 0 }, { y: 2, z: 3 }]);
    const entity = rawLaneToEntity({
      id: { id: 'lane_full' },
      central_curve: shared,
      left_boundary: {
        curve: shared,
        length: 20,
        virtual: false,
        boundary_type: [{ s: 2, types: [4, 6, 99] }, { types: [] }],
      },
      right_boundary: {
        curve: shared,
        length: 21,
        virtual: true,
        boundary_type: [],
      },
      length: 111,
      speed_limit: 22,
      overlap_id: [{ id: 'ov_1' }, {}],
      predecessor_id: [{ id: 'pre_1' }],
      successor_id: [{ id: 'succ_1' }],
      left_neighbor_forward_lane_id: [{ id: 'lf_1' }],
      right_neighbor_forward_lane_id: [{ id: 'rf_1' }],
      left_neighbor_reverse_lane_id: [{ id: 'lr_1' }],
      right_neighbor_reverse_lane_id: [{ id: 'rr_1' }],
      self_reverse_lane_id: [{ id: 'self_1' }],
      junction_id: { id: 'junction_1' },
      left_sample: [{ s: 1 }, { width: 2 }],
      right_sample: [{ s: 3, width: 4 }],
      left_road_sample: [{ s: 5, width: 6 }],
      right_road_sample: [{ s: 7, width: 8 }],
      type: 3,
      turn: 4,
      direction: 3,
    })!;

    expect(entity).toMatchObject({
      id: 'lane_full',
      type: 'BIKING',
      turn: 'U_TURN',
      direction: 'BIDIRECTION',
      length: 111,
      speedLimit: 22,
      predecessorIds: ['pre_1'],
      successorIds: ['succ_1'],
      leftNeighborForwardIds: ['lf_1'],
      rightNeighborForwardIds: ['rf_1'],
      leftNeighborReverseIds: ['lr_1'],
      rightNeighborReverseIds: ['rr_1'],
      selfReverseLaneIds: ['self_1'],
      junctionId: 'junction_1',
      overlapIds: ['ov_1'],
      leftSamples: [
        { s: 1, width: 0 },
        { s: 0, width: 2 },
      ],
      rightSamples: [{ s: 3, width: 4 }],
      leftRoadSamples: [{ s: 5, width: 6 }],
      rightRoadSamples: [{ s: 7, width: 8 }],
    });
    expect(entity.leftBoundary.boundaryType).toEqual([
      { s: 2, types: ['SOLID_WHITE', 'CURB', 'UNKNOWN'] },
      { types: [] },
    ]);
    expect(entity.rightBoundary.boundaryType).toEqual([]);
    expect(entity.centralCurve.segments[0]!.lineSegment.points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 2, z: 3 },
    ]);
    expect(entity.leftBoundary.curve).not.toBe(entity.centralCurve);
    expect(entity.rightBoundary.curve).not.toBe(entity.centralCurve);
    expect(entity.rightBoundary.curve).not.toBe(entity.leftBoundary.curve);
    entity.centralCurve.segments[0]!.lineSegment.points[0]!.x = 99;
    expect(entity.leftBoundary.curve.segments[0]!.lineSegment.points[0]!.x).toBe(0);
    expect(entity.rightBoundary.curve.segments[0]!.lineSegment.points[0]!.x).toBe(0);
    entity.leftBoundary.curve.segments[0]!.startPosition!.x = 77;
    expect(entity.centralCurve.segments[0]!.startPosition!.x).toBe(4);
    expect(entity.rightBoundary.curve.segments[0]!.startPosition!.x).toBe(4);
  });

  it('falls back unknown lane enum values on import', () => {
    const entity = rawLaneToEntity({
      id: { id: 'lane_unknown' },
      type: 999,
      turn: 999,
      direction: 999,
    })!;

    expect(entity.type).toBe('NONE');
    expect(entity.turn).toBe('NO_TURN');
    expect(entity.direction).toBe('FORWARD');
  });

  it('imports present lane boundaries without synthesising virtual or length', () => {
    const entity = rawLaneToEntity({
      id: { id: 'lane_boundary_defaults' },
      left_boundary: { curve: rawCurve([{ x: 9, y: 10 }]) },
      right_boundary: { boundary_type: [{ types: [2] }] },
    })!;

    expect(entity.leftBoundary).toEqual({
      curve: curve([{ x: 9, y: 10 }]),
      boundaryType: [],
    });
    expect(entity.rightBoundary).toEqual({
      curve: { segments: [] },
      boundaryType: [{ types: ['DOTTED_WHITE'] }],
    });
    expect(entity.leftBoundary.length).toBeUndefined();
    expect(entity.leftBoundary.virtual).toBeUndefined();
    expect(entity.rightBoundary.length).toBeUndefined();
    expect(entity.rightBoundary.virtual).toBeUndefined();
  });

  it('exports a populated lane to raw proto field names', () => {
    expect(entityToRawLane(laneEntity())).toEqual({
      id: { id: 'lane_1' },
      central_curve: curveToRaw([{ x: 1, y: 2, z: 0 }]),
      left_boundary: {
        curve: curveToRaw([{ x: 10, y: 11 }]),
        length: 12,
        virtual: true,
        boundary_type: [{ s: 0, types: [4, 6] }],
      },
      right_boundary: {
        curve: curveToRaw([{ x: 20, y: 21 }]),
        length: 13,
        virtual: false,
        boundary_type: [{ types: [1] }],
      },
      overlap_id: [{ id: 'overlap_1' }],
      predecessor_id: [{ id: 'pre_1' }],
      successor_id: [{ id: 'succ_1' }],
      left_neighbor_forward_lane_id: [{ id: 'lnf_1' }],
      right_neighbor_forward_lane_id: [{ id: 'rnf_1' }],
      left_neighbor_reverse_lane_id: [{ id: 'lnr_1' }],
      right_neighbor_reverse_lane_id: [{ id: 'rnr_1' }],
      self_reverse_lane_id: [{ id: 'rev_1' }],
      type: 2,
      turn: 2,
      direction: 3,
      left_sample: [{ s: 1, width: 2 }],
      right_sample: [{ s: 3, width: 4 }],
      left_road_sample: [{ s: 5, width: 6 }],
      right_road_sample: [{ s: 7, width: 8 }],
      length: 100,
      speed_limit: 15,
      junction_id: { id: 'junction_1' },
    });
  });

  it('exports empty lane arrays and omits absent optional scalars', () => {
    const raw = entityToRawLane(
      laneEntity({
        leftBoundary: { curve: { segments: [] }, boundaryType: [] },
        rightBoundary: { curve: { segments: [] }, boundaryType: [] },
        length: undefined,
        speedLimit: undefined,
        junctionId: null,
        overlapIds: [],
        predecessorIds: [],
        successorIds: [],
        leftNeighborForwardIds: [],
        rightNeighborForwardIds: [],
        leftNeighborReverseIds: [],
        rightNeighborReverseIds: [],
        selfReverseLaneIds: [],
        leftSamples: [],
        rightSamples: [],
        leftRoadSamples: [],
        rightRoadSamples: [],
      }),
    );

    expect(raw).toMatchObject({
      overlap_id: [],
      predecessor_id: [],
      successor_id: [],
      left_neighbor_forward_lane_id: [],
      right_neighbor_forward_lane_id: [],
      left_neighbor_reverse_lane_id: [],
      right_neighbor_reverse_lane_id: [],
      self_reverse_lane_id: [],
      left_sample: [],
      right_sample: [],
      left_road_sample: [],
      right_road_sample: [],
      left_boundary: { curve: { segment: [] }, boundary_type: [] },
      right_boundary: { curve: { segment: [] }, boundary_type: [] },
    });
    expect(raw.length).toBeUndefined();
    expect(raw.speed_limit).toBeUndefined();
    expect(raw.junction_id).toBeUndefined();
  });
});

describe('laneRoad bridge — roads', () => {
  it('drops raw roads without a usable id', () => {
    expect(rawRoadToEntity({})).toBeNull();
    expect(rawRoadToEntity({ id: {} })).toBeNull();
  });

  it('imports sparse and populated road fields without synthesising absent optionals', () => {
    expect(rawRoadToEntity({ id: { id: 'road_sparse' } })).toEqual({
      id: 'road_sparse',
      entityType: 'road',
      sections: [],
      junctionId: null,
    });

    const raw: RawRoad = {
      id: { id: 'road_full' },
      type: 2,
      junction_id: { id: 'junction_1' },
      section: [
        {
          id: {},
          lane_id: [{ id: 'lane_1' }, {}],
        },
        {
          id: { id: 'section_1' },
          lane_id: [{ id: 'lane_2' }],
          boundary: {
            outer_polygon: {
              edge: [{ type: 2, curve: rawCurve([{ x: 1, y: 2 }]) }, { type: 99 }],
            },
            hole: [
              {
                edge: [{ type: 3, curve: rawCurve([{ x: 3, y: 4 }]) }],
              },
            ],
          },
        },
      ],
    };

    expect(rawRoadToEntity(raw)).toEqual({
      id: 'road_full',
      entityType: 'road',
      type: 'CITY_ROAD',
      junctionId: 'junction_1',
      sections: [
        { id: '', laneIds: ['lane_1'] },
        {
          id: 'section_1',
          laneIds: ['lane_2'],
          boundary: {
            outerPolygon: {
              edges: [
                { type: 'LEFT_BOUNDARY', curve: curve([{ x: 1, y: 2 }]) },
                { type: 'UNKNOWN', curve: { segments: [] } },
              ],
            },
            holes: [
              {
                edges: [{ type: 'RIGHT_BOUNDARY', curve: curve([{ x: 3, y: 4 }]) }],
              },
            ],
          },
        },
      ],
    });
  });

  it('does not set road type when the raw enum is absent or unknown', () => {
    expect(rawRoadToEntity({ id: { id: 'road_no_type' } })!.type).toBeUndefined();
    expect(rawRoadToEntity({ id: { id: 'road_unknown_type' }, type: 99 })!.type).toBeUndefined();
  });

  it('imports present road boundaries with omitted polygons and holes as empty polygons', () => {
    expect(
      rawRoadToEntity({
        id: { id: 'road_boundary_defaults' },
        section: [{ id: { id: 'section_1' }, boundary: {} }],
      }),
    ).toEqual({
      id: 'road_boundary_defaults',
      entityType: 'road',
      sections: [
        {
          id: 'section_1',
          laneIds: [],
          boundary: {
            outerPolygon: { edges: [] },
            holes: [],
          },
        },
      ],
      junctionId: null,
    });
  });

  it('exports roads with optional type, junction, sections, and boundary polygons', () => {
    const road: RoadEntity = {
      id: 'road_1',
      entityType: 'road',
      type: 'HIGHWAY',
      junctionId: 'junction_1',
      sections: [
        {
          id: 'section_1',
          laneIds: ['lane_1', 'lane_2'],
          boundary: {
            outerPolygon: {
              edges: [{ type: 'NORMAL', curve: curve([{ x: 1, y: 2 }]) }],
            },
            holes: [
              {
                edges: [{ type: 'RIGHT_BOUNDARY', curve: curve([{ x: 3, y: 4 }]) }],
              },
            ],
          },
        },
        {
          id: 'section_2',
          laneIds: [],
        },
      ],
    };

    expect(entityToRawRoad(road)).toEqual({
      id: { id: 'road_1' },
      type: 1,
      junction_id: { id: 'junction_1' },
      section: [
        {
          id: { id: 'section_1' },
          lane_id: [{ id: 'lane_1' }, { id: 'lane_2' }],
          boundary: {
            outer_polygon: {
              edge: [{ type: 1, curve: curveToRaw([{ x: 1, y: 2 }]) }],
            },
            hole: [
              {
                edge: [{ type: 3, curve: curveToRaw([{ x: 3, y: 4 }]) }],
              },
            ],
          },
        },
        {
          id: { id: 'section_2' },
          lane_id: [],
        },
      ],
    });
  });

  it('omits optional raw road fields when absent on the entity', () => {
    const raw = entityToRawRoad({
      id: 'road_min',
      entityType: 'road',
      sections: [],
      junctionId: null,
    });

    expect(raw).toEqual({
      id: { id: 'road_min' },
      section: [],
    });
  });
});

function curveToRaw(points: Array<{ x: number; y: number; z?: number }>) {
  return {
    segment: [
      {
        line_segment: { point: points },
        s: 3,
        start_position: { x: 4, y: 5 },
        heading: 6,
        length: 7,
      },
    ],
  };
}
