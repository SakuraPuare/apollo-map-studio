import { describe, expect, it } from 'vitest';
import type {
  ApolloEntity,
  ApolloPolygon,
  BarrierGateEntity,
  BoundaryEdge,
  Curve,
  CurveSegment,
  LaneBoundary,
  LaneEntity,
  RoadEntity,
  SignalEntity,
  SpeedBumpEntity,
  StopSignEntity,
  YieldSignEntity,
} from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';
import {
  apolloEntityCoords,
  deleteApolloVertex,
  getApolloEditPoints,
  isApolloAreaEntity,
  isApolloPolygonEditPoints,
  moveApolloEntity,
  setAllApolloEditPoints,
  setApolloEditPoint,
} from '../apolloCompile/editPoints';

const pt = (x: number, y: number, z?: number): GeoPoint =>
  z === undefined ? { x, y } : { x, y, z };

const polygon = (points: GeoPoint[]): ApolloPolygon => ({ points });

function segment(points: GeoPoint[], startPosition?: GeoPoint): CurveSegment {
  return {
    lineSegment: { points },
    ...(startPosition ? { startPosition } : {}),
  };
}

function curve(...segments: GeoPoint[][]): Curve {
  return { segments: segments.map((points) => segment(points, points[0])) };
}

function sparseCurve(...segments: CurveSegment[]): Curve {
  return { segments };
}

function laneBoundary(points: GeoPoint[] = [], length = 0): LaneBoundary {
  return {
    curve: points.length > 0 ? curve(points) : { segments: [] },
    length,
    boundaryType: [],
  };
}

function makeLane(points: GeoPoint[] = [pt(0, 0), pt(1, 0)]): LaneEntity {
  return {
    id: 'lane_1',
    entityType: 'lane',
    centralCurve: curve(points),
    leftBoundary: laneBoundary(),
    rightBoundary: laneBoundary(),
    length: 0,
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
    leftSamples: [{ s: 0, width: 1 }],
    rightSamples: [{ s: 0, width: 1 }],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

function makeRoad(edges: BoundaryEdge[] = [roadEdge([pt(0, 0), pt(1, 0)])]): RoadEntity {
  return {
    id: 'road_1',
    entityType: 'road',
    sections: [
      {
        id: 'section_1',
        laneIds: [],
        boundary: {
          outerPolygon: { edges },
          holes: [],
        },
      },
    ],
    junctionId: null,
    type: 'CITY_ROAD',
  };
}

function makeRoadWithoutBoundary(): RoadEntity {
  return {
    id: 'road_empty',
    entityType: 'road',
    sections: [{ id: 'section_1', laneIds: [] }],
    junctionId: null,
    type: 'CITY_ROAD',
  };
}

function roadEdge(points: GeoPoint[], extraSegments: GeoPoint[][] = []): BoundaryEdge {
  return {
    type: 'LEFT_BOUNDARY',
    curve: curve(points, ...extraSegments),
  };
}

function makeSignal(stopLines: Curve[] = [curve([pt(0, 0), pt(1, 0)])]): SignalEntity {
  return {
    id: 'signal_1',
    entityType: 'signal',
    boundary: polygon([pt(10, 10), pt(11, 10), pt(11, 11)]),
    subsignals: [],
    type: 'MIX_3_VERTICAL',
    overlapIds: [],
    stopLines,
    signInfo: [],
  };
}

function makeBarrierGate(stopLines: Curve[] = [curve([pt(0, 0), pt(1, 0)])]): BarrierGateEntity {
  return {
    id: 'barrier_1',
    entityType: 'barrierGate',
    type: 'ROD',
    polygon: polygon([pt(5, 5), pt(6, 5), pt(6, 6)]),
    stopLines,
    overlapIds: [],
  };
}

function makeStopSign(stopLines: Curve[] = [curve([pt(0, 0), pt(1, 0)])]): StopSignEntity {
  return {
    id: 'stop_1',
    entityType: 'stopSign',
    stopLines,
    type: 'ONE_WAY',
    overlapIds: [],
  };
}

function makeYieldSign(stopLines: Curve[] = [curve([pt(0, 0), pt(1, 0)])]): YieldSignEntity {
  return {
    id: 'yield_1',
    entityType: 'yieldSign',
    stopLines,
    overlapIds: [],
  };
}

function makeSpeedBump(position: Curve[] = [curve([pt(0, 0), pt(1, 0)])]): SpeedBumpEntity {
  return {
    id: 'speed_bump_1',
    entityType: 'speedBump',
    position,
    overlapIds: [],
  };
}

describe('edit point readers', () => {
  it('flattens multi-segment lane centerlines and de-duplicates shared vertices', () => {
    const lane = makeLane();
    lane.centralCurve = curve([pt(0, 0), pt(1, 0)], [pt(1, 0), pt(2, 0)]);

    expect(getApolloEditPoints(lane)).toEqual([pt(0, 0), pt(1, 0), pt(2, 0)]);
  });

  it('uses line fallbacks and empty curves for non-polygon entities', () => {
    expect(getApolloEditPoints(makeBarrierGate([curve([pt(1, 1), pt(2, 2)])]))).toEqual([
      pt(1, 1),
      pt(2, 2),
    ]);
    expect(getApolloEditPoints(makeBarrierGate([]))).toEqual([pt(5, 5), pt(6, 5), pt(6, 6)]);
    expect(getApolloEditPoints(makeSignal([]))).toEqual([pt(10, 10), pt(11, 10), pt(11, 11)]);
    expect(getApolloEditPoints(makeStopSign([]))).toEqual([]);
    expect(getApolloEditPoints(makeYieldSign([]))).toEqual([]);
    expect(getApolloEditPoints(makeSpeedBump([]))).toEqual([]);
  });

  it('returns road outer edge points or an empty array for missing road geometry', () => {
    expect(getApolloEditPoints(makeRoad([roadEdge([pt(0, 0), pt(1, 0)])]))).toEqual([
      pt(0, 0),
      pt(1, 0),
    ]);
    expect(getApolloEditPoints(makeRoadWithoutBoundary())).toEqual([]);
    expect(getApolloEditPoints(makeRoad([]))).toEqual([]);
    expect(
      getApolloEditPoints(makeRoad([{ type: 'LEFT_BOUNDARY', curve: { segments: [] } }])),
    ).toEqual([]);
  });

  it('ignores malformed polygon-like entities and unsupported Apollo entities', () => {
    const malformedArea: ApolloEntity = {
      id: 'area_missing_polygon',
      entityType: 'area',
      type: 'Driveable',
      overlapIds: [],
      polygon: undefined as never,
    };
    const rsu: ApolloEntity = {
      id: 'rsu_1',
      entityType: 'rsu',
      junctionId: null,
      overlapIds: [],
    };

    expect(getApolloEditPoints(malformedArea)).toEqual([]);
    expect(getApolloEditPoints(rsu)).toEqual([]);
  });
});

describe('edit point writers', () => {
  it('updates polygon entities before falling through to line handlers', () => {
    const area: ApolloEntity = {
      id: 'area_1',
      entityType: 'area',
      type: 'Driveable',
      polygon: polygon([pt(0, 0), pt(1, 0), pt(1, 1)]),
      overlapIds: [],
    };

    const next = setAllApolloEditPoints(area, [pt(2, 2), pt(3, 2), pt(3, 3)]);

    expect(next).not.toBe(area);
    expect(getApolloEditPoints(next)).toEqual([pt(2, 2), pt(3, 2), pt(3, 3)]);
  });

  it('updates barrier gate and signal stop lines or their fallback polygons', () => {
    const line = sparseCurve(segment([pt(0, 0), pt(1, 0)]), segment([pt(2, 0), pt(3, 0)]));
    const barrierWithLine = setAllApolloEditPoints(makeBarrierGate([line]), [pt(9, 9), pt(10, 9)]);
    const barrierWithoutLine = setAllApolloEditPoints(makeBarrierGate([]), [
      pt(4, 4),
      pt(5, 4),
      pt(5, 5),
    ]);
    const signalWithLine = setAllApolloEditPoints(makeSignal([line]), [pt(7, 7), pt(8, 7)]);
    const signalWithoutLine = setAllApolloEditPoints(makeSignal([]), [
      pt(1, 1),
      pt(2, 1),
      pt(2, 2),
    ]);

    expect(
      (barrierWithLine as BarrierGateEntity).stopLines[0]?.segments[0]?.lineSegment.points,
    ).toEqual([pt(9, 9), pt(10, 9)]);
    expect(
      (barrierWithLine as BarrierGateEntity).stopLines[0]?.segments[1]?.lineSegment.points,
    ).toEqual([pt(2, 0), pt(3, 0)]);
    expect((barrierWithoutLine as BarrierGateEntity).polygon.points).toEqual([
      pt(4, 4),
      pt(5, 4),
      pt(5, 5),
    ]);
    expect((signalWithLine as SignalEntity).stopLines[0]?.segments[0]?.lineSegment.points).toEqual([
      pt(7, 7),
      pt(8, 7),
    ]);
    expect((signalWithoutLine as SignalEntity).boundary.points).toEqual([
      pt(1, 1),
      pt(2, 1),
      pt(2, 2),
    ]);
  });

  it('updates lane centerlines, preserves later segments, and clears derived boundaries', () => {
    const lane = makeLane();
    lane.centralCurve = sparseCurve(segment([pt(0, 0), pt(1, 0)]), segment([pt(2, 0), pt(3, 0)]));
    lane.leftBoundary = laneBoundary([pt(0, 1), pt(1, 1)], 12);
    lane.rightBoundary = laneBoundary([pt(0, -1), pt(1, -1)], 13);

    const next = setAllApolloEditPoints(lane, [pt(10, 10), pt(11, 10), pt(12, 10)]) as LaneEntity;

    expect(next.centralCurve.segments[0]?.lineSegment.points).toEqual([
      pt(10, 10),
      pt(11, 10),
      pt(12, 10),
    ]);
    expect(next.centralCurve.segments[1]?.lineSegment.points).toEqual([pt(2, 0), pt(3, 0)]);
    expect(next.leftBoundary.curve.segments).toEqual([]);
    expect(next.rightBoundary.curve.segments).toEqual([]);
    expect(next.leftBoundary.length).toBe(0);
    expect(next.rightBoundary.length).toBe(0);
    expect(next.length).toBeGreaterThan(0);
  });

  it('creates a first lane segment when setting an empty center curve', () => {
    const lane = makeLane([]);
    lane.centralCurve = { segments: [] };

    const next = setAllApolloEditPoints(lane, [pt(1, 1), pt(2, 2)]) as LaneEntity;

    expect(next.centralCurve.segments[0]?.lineSegment.points).toEqual([pt(1, 1), pt(2, 2)]);
  });

  it('updates road first edges and no-ops when editable road geometry is absent', () => {
    const secondSegment = [pt(2, 0), pt(3, 0)];
    const road = makeRoad([roadEdge([pt(0, 0), pt(1, 0)], [secondSegment])]);
    const noBoundary = makeRoadWithoutBoundary();
    const noEdges = makeRoad([]);
    const emptyEdge = makeRoad([{ type: 'LEFT_BOUNDARY', curve: { segments: [] } }]);

    const updated = setAllApolloEditPoints(road, [pt(10, 0), pt(11, 0)]) as RoadEntity;
    const filledEmptyEdge = setAllApolloEditPoints(emptyEdge, [pt(4, 4), pt(5, 5)]) as RoadEntity;

    expect(setAllApolloEditPoints(noBoundary, [pt(1, 1)])).toBe(noBoundary);
    expect(setAllApolloEditPoints(noEdges, [pt(1, 1)])).toBe(noEdges);
    expect(
      updated.sections[0]?.boundary?.outerPolygon.edges[0]?.curve.segments[0]?.lineSegment.points,
    ).toEqual([pt(10, 0), pt(11, 0)]);
    expect(
      updated.sections[0]?.boundary?.outerPolygon.edges[0]?.curve.segments[1]?.lineSegment.points,
    ).toEqual(secondSegment);
    expect(
      filledEmptyEdge.sections[0]?.boundary?.outerPolygon.edges[0]?.curve.segments[0]?.lineSegment
        .points,
    ).toEqual([pt(4, 4), pt(5, 5)]);
  });

  it('updates stop sign, yield sign, and speed bump first curves', () => {
    const stop = setAllApolloEditPoints(makeStopSign(), [pt(1, 2), pt(3, 4)]) as StopSignEntity;
    const yieldSign = setAllApolloEditPoints(makeYieldSign(), [
      pt(5, 6),
      pt(7, 8),
    ]) as YieldSignEntity;
    const speedBump = setAllApolloEditPoints(makeSpeedBump(), [
      pt(9, 10),
      pt(11, 12),
    ]) as SpeedBumpEntity;

    expect(stop.stopLines[0]?.segments[0]?.lineSegment.points).toEqual([pt(1, 2), pt(3, 4)]);
    expect(yieldSign.stopLines[0]?.segments[0]?.lineSegment.points).toEqual([pt(5, 6), pt(7, 8)]);
    expect(speedBump.position[0]?.segments[0]?.lineSegment.points).toEqual([pt(9, 10), pt(11, 12)]);
  });

  it('leaves empty stop sign, yield sign, and speed bump curve arrays unchanged', () => {
    const stop = makeStopSign([]);
    const yieldSign = makeYieldSign([{ segments: [] }]);
    const speedBump = makeSpeedBump([]);

    expect(setAllApolloEditPoints(stop, [pt(1, 2), pt(3, 4)])).toBe(stop);
    expect(setAllApolloEditPoints(yieldSign, [pt(5, 6), pt(7, 8)])).toBe(yieldSign);
    expect(setAllApolloEditPoints(speedBump, [pt(9, 10), pt(11, 12)])).toBe(speedBump);
  });

  it('returns unsupported Apollo entities unchanged', () => {
    const rsu: ApolloEntity = {
      id: 'rsu_2',
      entityType: 'rsu',
      junctionId: null,
      overlapIds: [],
    };

    expect(setAllApolloEditPoints(rsu, [pt(1, 1)])).toBe(rsu);
  });

  it('leaves malformed polygon-like entities unchanged when writing or moving', () => {
    const malformedArea: ApolloEntity = {
      id: 'area_missing_polygon',
      entityType: 'area',
      type: 'Driveable',
      overlapIds: [],
      polygon: undefined as never,
    };

    expect(setAllApolloEditPoints(malformedArea, [pt(1, 1)])).toBe(malformedArea);
    expect(setApolloEditPoint(malformedArea, 0, pt(2, 2))).toBe(malformedArea);
    expect(moveApolloEntity(malformedArea, 1, 1)).toBe(malformedArea);
    expect(deleteApolloVertex(malformedArea, 0)).toBeNull();
  });
});

describe('single point updates and moves', () => {
  it('updates one point and returns the original entity for lower and upper index bounds', () => {
    const area: ApolloEntity = {
      id: 'area_2',
      entityType: 'area',
      type: 'Driveable',
      polygon: polygon([pt(0, 0), pt(1, 0), pt(1, 1)]),
      overlapIds: [],
    };

    const updated = setApolloEditPoint(area, 1, pt(9, 9));

    expect(getApolloEditPoints(updated)).toEqual([pt(0, 0), pt(9, 9), pt(1, 1)]);
    expect(setApolloEditPoint(area, -1, pt(5, 5))).toBe(area);
    expect(setApolloEditPoint(area, 3, pt(5, 5))).toBe(area);
  });

  it('moves non-lane edit points and preserves z values', () => {
    const signal = makeSignal([]);
    signal.boundary = polygon([pt(1, 1, 4), pt(2, 1), pt(2, 2)]);

    const moved = moveApolloEntity(signal, 10, -1) as SignalEntity;

    expect(moved.boundary.points).toEqual([pt(11, 0, 4), pt(12, 0), pt(12, 1)]);
  });

  it('moves lane curves, boundaries, and missing startPosition fallbacks', () => {
    const lane = makeLane();
    lane.centralCurve = sparseCurve(
      segment([pt(0, 0, 5), pt(1, 0)], pt(-1, -1, 7)),
      segment([pt(1, 0), pt(2, 0)]),
      segment([]),
    );
    lane.leftBoundary = {
      ...lane.leftBoundary,
      curve: sparseCurve(segment([pt(0, 1)], pt(0, 1))),
    };
    lane.rightBoundary = {
      ...lane.rightBoundary,
      curve: sparseCurve(segment([pt(0, -1)])),
    };

    const moved = moveApolloEntity(lane, 10, -2) as LaneEntity;

    expect(moved.centralCurve.segments[0]?.startPosition).toEqual(pt(9, -3, 7));
    expect(moved.centralCurve.segments[0]?.lineSegment.points).toEqual([pt(10, -2, 5), pt(11, -2)]);
    expect(moved.centralCurve.segments[1]?.startPosition).toEqual(pt(11, -2));
    expect(moved.centralCurve.segments[1]?.lineSegment.points).toEqual([pt(11, -2), pt(12, -2)]);
    expect(moved.centralCurve.segments[2]?.startPosition).toEqual(pt(10, -2));
    expect(moved.leftBoundary.curve.segments[0]?.startPosition).toEqual(pt(10, -1));
    expect(moved.rightBoundary.curve.segments[0]?.startPosition).toEqual(pt(10, -3));
  });

  it('does not move entities without edit points', () => {
    const road = makeRoadWithoutBoundary();

    expect(moveApolloEntity(road, 1, 1)).toBe(road);
  });
});

describe('vertex deletion', () => {
  it('uses polygon minimums for polygon edit points', () => {
    const triangle: ApolloEntity = {
      id: 'area_3',
      entityType: 'area',
      type: 'Driveable',
      polygon: polygon([pt(0, 0), pt(1, 0), pt(1, 1)]),
      overlapIds: [],
    };
    const quad: ApolloEntity = {
      ...triangle,
      id: 'area_4',
      polygon: polygon([pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 1)]),
    };

    expect(deleteApolloVertex(triangle, 1)).toBeNull();
    expect(getApolloEditPoints(deleteApolloVertex(quad, 1)!)).toEqual([
      pt(0, 0),
      pt(1, 1),
      pt(0, 1),
    ]);
    expect(getApolloEditPoints(deleteApolloVertex(quad, 99)!)).toEqual([
      pt(0, 0),
      pt(1, 0),
      pt(1, 1),
      pt(0, 1),
    ]);
  });

  it('uses polyline minimums for lanes even though lanes are area hit entities', () => {
    expect(deleteApolloVertex(makeLane([pt(0, 0), pt(1, 0)]), 0)).toBeNull();

    const next = deleteApolloVertex(makeLane([pt(0, 0), pt(1, 0), pt(2, 0)]), 1) as LaneEntity;

    expect(next.centralCurve.segments[0]?.lineSegment.points).toEqual([pt(0, 0), pt(2, 0)]);
  });
});

describe('entity coordinate conversion and type predicates', () => {
  it('returns empty coordinates for entities without edit points', () => {
    expect(apolloEntityCoords(makeSpeedBump([]))).toEqual([]);
  });

  it('converts non-lane edit points directly to coordinates', () => {
    const area: ApolloEntity = {
      id: 'area_5',
      entityType: 'area',
      type: 'Driveable',
      polygon: polygon([pt(0, 0), pt(1, 0), pt(1, 1)]),
      overlapIds: [],
    };

    expect(apolloEntityCoords(area)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
  });

  it('builds synthetic lane rings with default widths when samples are absent', () => {
    const lane = makeLane([pt(116, 39.9), pt(116.001, 39.9)]);
    lane.leftSamples = [];
    lane.rightSamples = [];

    const coords = apolloEntityCoords(lane);

    expect(coords.length).toBeGreaterThanOrEqual(4);
    expect(coords[0]).not.toEqual(coords[coords.length - 1]);
  });

  it('uses explicit lane boundary edges when both sides are present', () => {
    const lane = makeLane([pt(0, 0), pt(2, 0)]);
    lane.leftBoundary = laneBoundary([pt(0, 1), pt(2, 1)]);
    lane.rightBoundary = laneBoundary([pt(0, -1), pt(2, -1)]);

    expect(apolloEntityCoords(lane)).toEqual([
      [0, 1],
      [2, 1],
      [2, -1],
      [0, -1],
    ]);
  });

  it('distinguishes area hit-testing from polygon edit point topology', () => {
    expect(isApolloAreaEntity({ entityType: 'lane' })).toBe(true);
    expect(isApolloAreaEntity({ entityType: 'signal' })).toBe(false);
    expect(isApolloPolygonEditPoints({ entityType: 'area' })).toBe(true);
    expect(isApolloPolygonEditPoints({ entityType: 'lane' })).toBe(false);
  });
});
