/**
 * Tests for `planConnection` + `applyLaneConnection`.
 *
 * Fixtures use round meters → close-to-round lng/lat at the equator
 * (cosLat = 1) for simple distance arithmetic.
 */
import { describe, it, expect } from 'vitest';
import { applyLaneConnection, planConnection } from '../connectLanes';
import type { LaneEntity, SourceDrawInfo } from '@/types/apollo';
import { getSource } from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';

function laneAt(id: string, start: [number, number], end: [number, number]): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: {
      segments: [
        {
          lineSegment: {
            points: [
              { x: start[0], y: start[1] },
              { x: end[0], y: end[1] },
            ],
          },
          s: 0,
          startPosition: { x: start[0], y: start[1] },
          heading: 0,
          length: 0,
        },
      ],
    },
    leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    length: 0,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 0,
    predecessorIds: [],
    successorIds: [],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId: null,
    overlapIds: [],
    leftSamples: [{ s: 0, width: 1.75 }],
    rightSamples: [{ s: 0, width: 1.75 }],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

describe('planConnection', () => {
  it('always plans click-order connection: A.end -> B.start', () => {
    const a = laneAt('a', [0, 0], [0.001, 0]); // east
    const b = laneAt('b', [0.001, 0.0001], [0.002, 0.0001]); // east, north of A.end
    const plan = planConnection(a, b);
    expect(plan!.mode).toBe('AendToBstart');
    expect(plan!.isContinuous).toBe(true);
    expect(plan!.indexToMove).toBe(1);
    expect(plan!.target).toEqual({ x: 0.001, y: 0.0001 });
  });

  it('does not pick the nearest endpoint pair when click order says A -> B', () => {
    const a = laneAt('a', [0.001, 0], [0.002, 0]);
    const b = laneAt('b', [0, 0.0001], [0.001, 0.0001]); // B.end is nearest A.start
    const plan = planConnection(a, b);
    expect(plan!.mode).toBe('AendToBstart');
    expect(plan!.isContinuous).toBe(true);
    expect(plan!.indexToMove).toBe(1);
    expect(plan!.target).toEqual({ x: 0, y: 0.0001 });
  });

  it('does not treat same-start geometry as fork in connect mode', () => {
    const a = laneAt('a', [0, 0], [0.001, 0]);
    const b = laneAt('b', [0.0001, 0.0001], [-0.001, 0.0001]); // both start near (0,0)
    const plan = planConnection(a, b);
    expect(plan!.mode).toBe('AendToBstart');
    expect(plan!.isContinuous).toBe(true);
  });

  it('does not treat same-end geometry as merge in connect mode', () => {
    const a = laneAt('a', [0, 0], [0.001, 0]);
    const b = laneAt('b', [0.002, 0.0001], [0.001, 0.0001]); // both end near (0.001, 0)
    const plan = planConnection(a, b);
    expect(plan!.mode).toBe('AendToBstart');
    expect(plan!.isContinuous).toBe(true);
  });

  it('reports distance in meters (≈ 11m for 0.0001° at equator)', () => {
    const a = laneAt('a', [0, 0], [0.001, 0]);
    const b = laneAt('b', [0.001, 0.0001], [0.002, 0.0001]);
    const plan = planConnection(a, b);
    // 0.0001° lat ≈ 11.13m
    expect(plan!.distanceMeters).toBeCloseTo(11.13, 1);
  });
});

describe('planConnection — indexToMove / target details', () => {
  // The plan tells the caller WHICH endpoint of A to move and WHERE.
  // Connect mode is click-order driven, so this is always A.last -> B.start.

  it('AendToBstart picks A.last + B.start as target', () => {
    const a = laneAt('a', [0, 0], [0.001, 0]);
    const b = laneAt('b', [0.0011, 0.00005], [0.002, 0]);
    const plan = planConnection(a, b)!;
    expect(plan.mode).toBe('AendToBstart');
    expect(plan.indexToMove).toBe(1); // last point in 2-point polyline
    expect(plan.target.x).toBe(0.0011);
    expect(plan.target.y).toBe(0.00005);
  });

  it('still picks A.last + B.start when A.start is closer to B.end', () => {
    const a = laneAt('a', [0.001, 0], [0.002, 0]);
    const b = laneAt('b', [0, 0], [0.0009, 0.00005]);
    const plan = planConnection(a, b)!;
    expect(plan.mode).toBe('AendToBstart');
    expect(plan.indexToMove).toBe(1);
    expect(plan.target.x).toBe(0);
    expect(plan.target.y).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyLaneConnection — endpoint move across source-aware geometry flavors.
// Regression for the bezier-anchor index out-of-bounds crash that surfaced
// as "Cannot read properties of undefined (reading 'x')" in connect mode.
// ---------------------------------------------------------------------------

function laneWithCenterline(id: string, points: GeoPoint[]): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: {
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
    leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    length: 0,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 0,
    predecessorIds: [],
    successorIds: [],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId: null,
    overlapIds: [],
    leftSamples: [{ s: 0, width: 1.75 }],
    rightSamples: [{ s: 0, width: 1.75 }],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

function withSource<T extends LaneEntity>(lane: T, source: SourceDrawInfo): T {
  return { ...lane, _source: source } as T & { _source: SourceDrawInfo };
}

describe('applyLaneConnection — polyline source', () => {
  it('moves the centerline last point to target (AendToBstart)', () => {
    const lane = laneWithCenterline('a', [
      { x: 0, y: 0 },
      { x: 0.001, y: 0 },
    ]);
    const target: GeoPoint = { x: 0.0011, y: 0.00005 };
    const out = applyLaneConnection(lane, {
      mode: 'AendToBstart',
      indexToMove: 1,
      target,
      distanceMeters: 0,
      isContinuous: true,
    });
    const pts = out.centralCurve.segments[0]!.lineSegment.points;
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[1]).toEqual(expect.objectContaining(target));
  });

  it('moves the centerline first point to target (AstartToBend)', () => {
    const lane = laneWithCenterline('a', [
      { x: 0.001, y: 0 },
      { x: 0.002, y: 0 },
    ]);
    const target: GeoPoint = { x: 0.0009, y: 0.00005 };
    const out = applyLaneConnection(lane, {
      mode: 'AstartToBend',
      indexToMove: 0,
      target,
      distanceMeters: 0,
      isContinuous: true,
    });
    const pts = out.centralCurve.segments[0]!.lineSegment.points;
    expect(pts[0]).toEqual(expect.objectContaining(target));
    expect(pts[1]).toEqual({ x: 0.002, y: 0 });
  });
});

describe('applyLaneConnection — bezier source', () => {
  // Centerline sampled to many points, but anchors are sparse (2). The
  // pre-fix code indexed anchors[centerlineLastIndex] and crashed.
  it('shifts the LAST anchor (and its handles) when moving end endpoint', () => {
    const samplePts: GeoPoint[] = Array.from({ length: 20 }, (_, i) => ({
      x: i * 0.00005,
      y: 0,
    }));
    const lane = withSource(laneWithCenterline('a', samplePts), {
      drawTool: 'drawBezier',
      anchors: [
        { point: { x: 0, y: 0 }, handleIn: null, handleOut: { x: 0.0001, y: 0.0001 } },
        {
          point: { x: 0.001, y: 0 },
          handleIn: { x: 0.0009, y: -0.0001 },
          handleOut: null,
        },
      ],
    });

    const target: GeoPoint = { x: 0.0011, y: 0.00005 };
    const out = applyLaneConnection(lane, {
      mode: 'AendToBstart',
      indexToMove: samplePts.length - 1,
      target,
      distanceMeters: 0,
      isContinuous: true,
    });

    const newSource = getSource(out)!;
    const lastAnchor = newSource.anchors![1]!;
    expect(lastAnchor.point).toEqual(expect.objectContaining(target));
    // handleIn shifted by the same dx/dy (0.0001, 0.00005)
    expect(lastAnchor.handleIn!.x).toBeCloseTo(0.0009 + 0.0001, 12);
    expect(lastAnchor.handleIn!.y).toBeCloseTo(-0.0001 + 0.00005, 12);
    // first anchor untouched
    expect(newSource.anchors![0]!.point).toEqual({ x: 0, y: 0 });
    // re-sampled centerline picks up the new endpoint
    const pts = out.centralCurve.segments[0]!.lineSegment.points;
    expect(pts[pts.length - 1]).toEqual(expect.objectContaining(target));
  });

  it('shifts the FIRST anchor when moving start endpoint', () => {
    const samplePts: GeoPoint[] = Array.from({ length: 20 }, (_, i) => ({
      x: i * 0.00005,
      y: 0,
    }));
    const lane = withSource(laneWithCenterline('a', samplePts), {
      drawTool: 'drawBezier',
      anchors: [
        { point: { x: 0, y: 0 }, handleIn: null, handleOut: { x: 0.0001, y: 0.0001 } },
        { point: { x: 0.001, y: 0 }, handleIn: { x: 0.0009, y: 0 }, handleOut: null },
      ],
    });

    const target: GeoPoint = { x: -0.0001, y: 0 };
    const out = applyLaneConnection(lane, {
      mode: 'AstartToBend',
      indexToMove: 0,
      target,
      distanceMeters: 0,
      isContinuous: true,
    });

    const newSource = getSource(out)!;
    expect(newSource.anchors![0]!.point).toEqual(expect.objectContaining(target));
    // handleOut shifted by dx = -0.0001, dy = 0
    expect(newSource.anchors![0]!.handleOut!.x).toBeCloseTo(0.0001 - 0.0001, 12);
    expect(newSource.anchors![1]!.point).toEqual({ x: 0.001, y: 0 });
  });
});

describe('applyLaneConnection — arc source', () => {
  it('rewrites arcPoints[2] when moving end endpoint', () => {
    const samplePts: GeoPoint[] = Array.from({ length: 30 }, (_, i) => ({
      x: i * 0.00003,
      y: 0,
    }));
    const lane = withSource(laneWithCenterline('a', samplePts), {
      drawTool: 'drawArc',
      arcPoints: [
        { x: 0, y: 0 },
        { x: 0.0005, y: 0.0002 },
        { x: 0.001, y: 0 },
      ],
    });

    const target: GeoPoint = { x: 0.0012, y: 0 };
    const out = applyLaneConnection(lane, {
      mode: 'AendToBstart',
      indexToMove: samplePts.length - 1,
      target,
      distanceMeters: 0,
      isContinuous: true,
    });

    const newSource = getSource(out)!;
    expect(newSource.arcPoints![2]).toEqual(expect.objectContaining(target));
    expect(newSource.arcPoints![0]).toEqual({ x: 0, y: 0 });
  });

  it('rewrites arcPoints[0] when moving start endpoint', () => {
    const samplePts: GeoPoint[] = Array.from({ length: 30 }, (_, i) => ({
      x: i * 0.00003,
      y: 0,
    }));
    const lane = withSource(laneWithCenterline('a', samplePts), {
      drawTool: 'drawArc',
      arcPoints: [
        { x: 0, y: 0 },
        { x: 0.0005, y: 0.0002 },
        { x: 0.001, y: 0 },
      ],
    });

    const target: GeoPoint = { x: -0.0001, y: 0 };
    const out = applyLaneConnection(lane, {
      mode: 'AstartToBend',
      indexToMove: 0,
      target,
      distanceMeters: 0,
      isContinuous: true,
    });

    const newSource = getSource(out)!;
    expect(newSource.arcPoints![0]).toEqual(expect.objectContaining(target));
    expect(newSource.arcPoints![2]).toEqual({ x: 0.001, y: 0 });
  });
});

describe('applyLaneConnection — catmullRom source', () => {
  it('rewrites the LAST control point when moving end endpoint', () => {
    const samplePts: GeoPoint[] = Array.from({ length: 40 }, (_, i) => ({
      x: i * 0.00003,
      y: i % 2 === 0 ? 0 : 0.00001,
    }));
    const lane = withSource(laneWithCenterline('a', samplePts), {
      drawTool: 'drawCatmullRom',
      points: [
        { x: 0, y: 0 },
        { x: 0.0005, y: 0.0002 },
        { x: 0.001, y: 0 },
      ],
    });

    const target: GeoPoint = { x: 0.0012, y: 0.00005 };
    const out = applyLaneConnection(lane, {
      mode: 'AendToBstart',
      indexToMove: samplePts.length - 1,
      target,
      distanceMeters: 0,
      isContinuous: true,
    });

    const newSource = getSource(out)!;
    expect(newSource.drawTool).toBe('drawCatmullRom');
    if (newSource.drawTool === 'drawCatmullRom') {
      expect(newSource.points[2]).toEqual(expect.objectContaining(target));
      expect(newSource.points[0]).toEqual({ x: 0, y: 0 });
    }
    const pts = out.centralCurve.segments[0]!.lineSegment.points;
    expect(pts[pts.length - 1]).toEqual(expect.objectContaining(target));
  });

  it('rewrites the FIRST control point when moving start endpoint', () => {
    const samplePts: GeoPoint[] = Array.from({ length: 40 }, (_, i) => ({
      x: i * 0.00003,
      y: i % 2 === 0 ? 0 : 0.00001,
    }));
    const lane = withSource(laneWithCenterline('a', samplePts), {
      drawTool: 'drawCatmullRom',
      points: [
        { x: 0, y: 0 },
        { x: 0.0005, y: 0.0002 },
        { x: 0.001, y: 0 },
      ],
    });

    const target: GeoPoint = { x: -0.0001, y: 0 };
    const out = applyLaneConnection(lane, {
      mode: 'AstartToBend',
      indexToMove: 0,
      target,
      distanceMeters: 0,
      isContinuous: true,
    });

    const newSource = getSource(out)!;
    expect(newSource.drawTool).toBe('drawCatmullRom');
    if (newSource.drawTool === 'drawCatmullRom') {
      expect(newSource.points[0]).toEqual(expect.objectContaining(target));
      expect(newSource.points[2]).toEqual({ x: 0.001, y: 0 });
    }
    const pts = out.centralCurve.segments[0]!.lineSegment.points;
    expect(pts[0]).toEqual(expect.objectContaining(target));
  });
});
