import { describe, expect, it } from 'vitest';
import { boundsCenter, boundsForEntity, isTinyBounds } from '../entityBounds';
import type {
  ApolloEntity,
  ApolloPolygon,
  BarrierGateEntity,
  ClearAreaEntity,
  CrosswalkEntity,
  Curve,
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
import type {
  ArcEntity,
  BezierEntity,
  CatmullRomEntity,
  PolygonEntity,
  PolylineEntity,
  RectEntity,
} from '@/types/entities';

const pt = (x: number, y: number) => ({ x, y });

function curve(points: { x: number; y: number }[]): Curve {
  return { segments: [{ lineSegment: { points } }] };
}

function polygon(points: { x: number; y: number }[]): ApolloPolygon {
  return { points };
}

describe('entityBounds', () => {
  it('uses road section boundary edges for road bounds', () => {
    const road: RoadEntity = {
      id: 'road_1',
      entityType: 'road',
      junctionId: null,
      sections: [
        {
          id: 'section_1',
          laneIds: [],
          boundary: {
            outerPolygon: {
              edges: [
                { type: 'LEFT_BOUNDARY', curve: curve([pt(116.1, 39.1), pt(116.4, 39.2)]) },
                { type: 'RIGHT_BOUNDARY', curve: curve([pt(116.2, 39.3), pt(116.5, 39.4)]) },
              ],
            },
            holes: [],
          },
        },
      ],
    };

    expect(boundsForEntity(road)).toEqual({
      minX: 116.1,
      minY: 39.1,
      maxX: 116.5,
      maxY: 39.4,
    });
  });

  it('uses rotated rectangle corners instead of just diagonal control points', () => {
    const rect: RectEntity = {
      id: 'rect_1',
      entityType: 'rect',
      p1: pt(0, 0),
      p2: pt(2, 1),
      rotation: Math.PI / 2,
    };

    const bounds = boundsForEntity(rect);
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBeCloseTo(0.5);
    expect(bounds!.maxX).toBeCloseTo(1.5);
    expect(bounds!.minY).toBeCloseTo(-0.5);
    expect(bounds!.maxY).toBeCloseTo(1.5);
  });

  it('computes center and tiny-state for degenerate bounds', () => {
    const bounds = boundsForEntity({
      id: 'polyline_1',
      entityType: 'polyline',
      points: [pt(116, 39)],
    });

    expect(bounds).toEqual({ minX: 116, minY: 39, maxX: 116, maxY: 39 });
    expect(boundsCenter(bounds!)).toEqual([116, 39]);
    expect(isTinyBounds(bounds!)).toBe(true);
  });

  it('covers drawing primitive bounds and skips non-finite drawing points', () => {
    const polyline: PolylineEntity = {
      id: 'polyline_invalid',
      entityType: 'polyline',
      points: [pt(1, 2), { x: Number.NaN, y: 99 }, pt(-3, 4)],
    };
    const catmullRom: CatmullRomEntity = {
      id: 'catmull_1',
      entityType: 'catmullRom',
      points: [pt(5, -1), pt(6, 2)],
    };
    const polygonEntity: PolygonEntity = {
      id: 'polygon_empty',
      entityType: 'polygon',
      points: [],
    };
    const bezier: BezierEntity = {
      id: 'bezier_1',
      entityType: 'bezier',
      anchors: [
        { point: pt(0, 0), handleIn: null, handleOut: pt(2, -4) },
        { point: pt(10, 1), handleIn: pt(-5, 3), handleOut: null },
      ],
    };
    const arc: ArcEntity = {
      id: 'arc_1',
      entityType: 'arc',
      start: pt(1, 9),
      mid: pt(-2, 4),
      end: pt(3, -6),
    };

    expect(boundsForEntity(polyline)).toEqual({ minX: -3, minY: 2, maxX: 1, maxY: 4 });
    expect(boundsForEntity(catmullRom)).toEqual({ minX: 5, minY: -1, maxX: 6, maxY: 2 });
    expect(boundsForEntity(polygonEntity)).toBeNull();
    expect(boundsForEntity(bezier)).toEqual({ minX: -5, minY: -4, maxX: 10, maxY: 3 });
    expect(boundsForEntity(arc)).toEqual({ minX: -2, minY: -6, maxX: 3, maxY: 9 });
  });

  it('uses lane boundaries and center curves for Apollo lane bounds', () => {
    const lane: LaneEntity = {
      id: 'lane_1',
      entityType: 'lane',
      centralCurve: curve([pt(0, 0), { x: Infinity, y: 3 }, pt(3, 3)]),
      leftBoundary: { curve: curve([pt(-2, 1)]), boundaryType: [] },
      rightBoundary: { curve: curve([pt(4, -4)]), boundaryType: [] },
      type: 'CITY_DRIVING',
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
    };

    expect(boundsForEntity(lane)).toEqual({ minX: -2, minY: -4, maxX: 4, maxY: 3 });
  });

  it('uses signal polygons, stop lines, and subsignal locations for bounds', () => {
    const signal: SignalEntity = {
      id: 'signal_1',
      entityType: 'signal',
      boundary: polygon([pt(0, 0), pt(1, 1)]),
      subsignals: [
        { id: 'subsignal_1', type: 'CIRCLE', location: pt(2, -6) },
        { id: 'subsignal_2', type: 'ARROW_LEFT' },
      ],
      type: 'MIX_3_VERTICAL',
      overlapIds: [],
      stopLines: [curve([pt(-5, 2), pt(-4, 3)])],
      signInfo: [],
    };

    expect(boundsForEntity(signal)).toEqual({ minX: -5, minY: -6, maxX: 2, maxY: 3 });
  });

  it('uses line-only Apollo sign and speed bump variants', () => {
    const stopSign: StopSignEntity = {
      id: 'stop_1',
      entityType: 'stopSign',
      stopLines: [curve([pt(1, 1), pt(3, -1)])],
      overlapIds: [],
    };
    const yieldSign: YieldSignEntity = {
      id: 'yield_1',
      entityType: 'yieldSign',
      stopLines: [curve([pt(-3, 5), pt(-1, 7)])],
      overlapIds: [],
    };
    const speedBump: SpeedBumpEntity = {
      id: 'bump_1',
      entityType: 'speedBump',
      position: [curve([pt(10, 4), pt(12, 6)])],
      overlapIds: [],
    };

    expect(boundsForEntity(stopSign)).toEqual({ minX: 1, minY: -1, maxX: 3, maxY: 1 });
    expect(boundsForEntity(yieldSign)).toEqual({ minX: -3, minY: 5, maxX: -1, maxY: 7 });
    expect(boundsForEntity(speedBump)).toEqual({ minX: 10, minY: 4, maxX: 12, maxY: 6 });
  });

  it('uses polygon-based Apollo variant bounds', () => {
    const polyBounds = { minX: -1, minY: -2, maxX: 5, maxY: 6 };
    const poly = polygon([pt(-1, 6), pt(5, -2), pt(2, 3)]);
    const cases: Array<[string, ApolloEntity]> = [
      [
        'junction',
        {
          id: 'junction_1',
          entityType: 'junction',
          polygon: poly,
          overlapIds: [],
        } satisfies JunctionEntity,
      ],
      [
        'parkingSpace',
        {
          id: 'parking_space_1',
          entityType: 'parkingSpace',
          polygon: poly,
          heading: 0,
          overlapIds: [],
        } satisfies ParkingSpaceEntity,
      ],
      [
        'parkingLot',
        {
          id: 'parking_lot_1',
          entityType: 'parkingLot',
          polygon: poly,
          overlapIds: [],
        } satisfies ParkingLotEntity,
      ],
      [
        'crosswalk',
        {
          id: 'crosswalk_1',
          entityType: 'crosswalk',
          polygon: poly,
          overlapIds: [],
        } satisfies CrosswalkEntity,
      ],
      [
        'clearArea',
        {
          id: 'clear_area_1',
          entityType: 'clearArea',
          polygon: poly,
          overlapIds: [],
        } satisfies ClearAreaEntity,
      ],
      [
        'pncJunction',
        {
          id: 'pnc_junction_1',
          entityType: 'pncJunction',
          polygon: poly,
          overlapIds: [],
          passageGroups: [],
        } satisfies PNCJunctionEntity,
      ],
      [
        'barrierGate',
        {
          id: 'barrier_gate_1',
          entityType: 'barrierGate',
          type: 'ROD',
          polygon: poly,
          stopLines: [curve([pt(-99, -99), pt(99, 99)])],
          overlapIds: [],
        } satisfies BarrierGateEntity,
      ],
      [
        'area',
        {
          id: 'area_1',
          entityType: 'area',
          type: 'Driveable',
          polygon: poly,
          overlapIds: [],
        },
      ],
      [
        'speedControl',
        {
          id: 'speed_control_1',
          entityType: 'speedControl',
          name: 'school_zone',
          polygon: poly,
          speedLimit: 8,
        } satisfies SpeedControlEntity,
      ],
    ];

    for (const [name, entity] of cases) {
      expect(boundsForEntity(entity), name).toEqual(polyBounds);
    }
  });

  it('uses road holes as well as outer road boundary edges', () => {
    const road: RoadEntity = {
      id: 'road_with_hole',
      entityType: 'road',
      junctionId: null,
      sections: [
        {
          id: 'section_1',
          laneIds: [],
          boundary: {
            outerPolygon: {
              edges: [{ type: 'NORMAL', curve: curve([pt(0, 0), pt(2, 2)]) }],
            },
            holes: [
              {
                edges: [{ type: 'UNKNOWN', curve: curve([pt(-5, 3), pt(1, 9)]) }],
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

    expect(boundsForEntity(road)).toEqual({ minX: -5, minY: 0, maxX: 2, maxY: 9 });
  });

  it('returns null for unsupported or empty Apollo variants', () => {
    const overlap: OverlapEntity = {
      id: 'overlap_1',
      entityType: 'overlap',
      objects: [],
      regionOverlaps: [],
    };
    const rsu: RSUEntity = {
      id: 'rsu_1',
      entityType: 'rsu',
      junctionId: null,
      overlapIds: [],
    };
    const emptyBarrierGate: BarrierGateEntity = {
      id: 'barrier_gate_empty',
      entityType: 'barrierGate',
      type: 'FENCE',
      polygon: polygon([]),
      stopLines: [curve([pt(-1, -1), pt(1, 1)])],
      overlapIds: [],
    };

    expect(boundsForEntity(overlap)).toBeNull();
    expect(boundsForEntity(rsu)).toBeNull();
    expect(boundsForEntity(emptyBarrierGate)).toBeNull();
  });
});
