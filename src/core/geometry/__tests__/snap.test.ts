/**
 * Snap (吸附) — pure function unit tests.
 *
 * Fixtures use Beijing-area lng/lat (≈ 116.4, 39.9). At that latitude
 * 1m ≈ 1.16e-5° in lng / 9.0e-6° in lat — keep deltas trivially small
 * so the projection round-trip stays sub-cm.
 */
import { describe, it, expect } from 'vitest';
import { collectCandidates, collectSnapGuidePoints, findSnapTarget, pixelsToMeters } from '../snap';
import type { MapEntity } from '@/types/entities';
import type { JunctionEntity, LaneEntity } from '@/types/apollo';
import type { PolygonEntity, RectEntity } from '@/types/entities';

const ORIGIN_LNG = 116.4;
const ORIGIN_LAT = 39.9;

function laneAt(id: string, points: [number, number][]): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: {
      segments: [
        {
          lineSegment: { points: points.map(([x, y]) => ({ x, y })) },
          s: 0,
          startPosition: { x: points[0]![0], y: points[0]![1] },
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
    leftSamples: [],
    rightSamples: [],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

function junctionAt(id: string, points: [number, number][]): JunctionEntity {
  return {
    id,
    entityType: 'junction',
    polygon: { points: points.map(([x, y]) => ({ x, y })) },
    type: 'CROSS_ROAD',
    overlapIds: [],
  };
}

describe('pixelsToMeters', () => {
  it('returns ~0.23m per pixel at zoom 18, mid-latitude (512-px tile)', () => {
    // MapLibre uses 512-px tiles (matches the existing pixelToRadius
    // helper in useMapEventRouter). At z=18, lat=39.9, cosφ ≈ 0.767:
    //   (0.767 · 40075016.686) / (512 · 262144) ≈ 0.229 m/px.
    const m = pixelsToMeters(1, 39.9, 18);
    expect(m).toBeGreaterThan(0.2);
    expect(m).toBeLessThan(0.3);
  });

  it('halves with each zoom step (factor of 2 per level)', () => {
    const a = pixelsToMeters(1, 0, 10);
    const b = pixelsToMeters(1, 0, 11);
    expect(a / b).toBeCloseTo(2, 6);
  });

  it('shrinks toward the poles by cosφ', () => {
    const equator = pixelsToMeters(1, 0, 15);
    const high = pixelsToMeters(1, 60, 15);
    expect(high / equator).toBeCloseTo(Math.cos((60 * Math.PI) / 180), 4);
  });
});

describe('collectCandidates', () => {
  it('emits ONLY lane endpoints (not interior vertices), with role tags', () => {
    // Topology contract: only lane start/end can become predecessor /
    // successor. Interior vertex snapping would create coincident
    // geometry without a topological link, so we exclude it from
    // vertex candidates. Edge segments still cover the full polyline
    // (mid-lane proximity → 'edge' snap, not endpoint snap).
    const lane = laneAt('lane-1', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + 0.0001, ORIGIN_LAT], // interior vertex
      [ORIGIN_LNG + 0.0002, ORIGIN_LAT],
    ]);
    const { vertices, edges } = collectCandidates([lane], null);
    expect(vertices).toHaveLength(2);
    expect(vertices[0]!.endpointRole).toBe('start');
    expect(vertices[1]!.endpointRole).toBe('end');
    expect(edges).toHaveLength(2); // segments preserved for edge snapping
  });

  it('emits closed corners/edges for drawing polygons', () => {
    const polygon: PolygonEntity = {
      id: 'poly-1',
      entityType: 'polygon',
      points: [
        { x: ORIGIN_LNG, y: ORIGIN_LAT },
        { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT },
        { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT + 0.0001 },
        { x: ORIGIN_LNG, y: ORIGIN_LAT + 0.0001 },
      ],
    };
    const { vertices, edges } = collectCandidates([polygon], null);
    expect(vertices).toHaveLength(4);
    expect(edges).toHaveLength(4);
    expect(edges[3]!.a).toEqual(polygon.points[3]);
    expect(edges[3]!.b).toEqual(polygon.points[0]);
  });

  it('emits rotated rectangle corners and edges', () => {
    const rect: RectEntity = {
      id: 'rect-1',
      entityType: 'rect',
      p1: { x: ORIGIN_LNG, y: ORIGIN_LAT },
      p2: { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT + 0.00005 },
      rotation: Math.PI / 6,
    };
    const { vertices, edges } = collectCandidates([rect], null);
    expect(vertices).toHaveLength(4);
    expect(edges).toHaveLength(4);
  });

  it('exposes only control points for object move snapping', () => {
    const rect: RectEntity = {
      id: 'rect-2',
      entityType: 'rect',
      p1: { x: ORIGIN_LNG, y: ORIGIN_LAT },
      p2: { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT + 0.0001 },
      rotation: 0,
    };
    const guides = collectSnapGuidePoints(rect);
    const rightEdgeMidpoint = guides.find(
      (p) =>
        Math.abs(p.x - (ORIGIN_LNG + 0.0001)) < 1e-12 &&
        Math.abs(p.y - (ORIGIN_LAT + 0.00005)) < 1e-12,
    );
    expect(guides).toHaveLength(4);
    expect(guides).toEqual(
      expect.arrayContaining([
        { x: ORIGIN_LNG, y: ORIGIN_LAT },
        { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT },
        { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT + 0.0001 },
        { x: ORIGIN_LNG, y: ORIGIN_LAT + 0.0001 },
      ]),
    );
    expect(rightEdgeMidpoint).toBeUndefined();
  });

  it('closes polygon edges (wraps last → first)', () => {
    const j = junctionAt('j-1', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + 0.0001, ORIGIN_LAT],
      [ORIGIN_LNG + 0.0001, ORIGIN_LAT + 0.0001],
      [ORIGIN_LNG, ORIGIN_LAT + 0.0001],
    ]);
    const { vertices, edges } = collectCandidates([j], null);
    expect(vertices).toHaveLength(4);
    expect(edges).toHaveLength(4); // 4 sides
  });

  it('skips the excluded entity', () => {
    const lane = laneAt('lane-1', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + 0.0001, ORIGIN_LAT],
    ]);
    const { vertices } = collectCandidates([lane], 'lane-1');
    expect(vertices).toHaveLength(0);
  });
});

describe('findSnapTarget', () => {
  // ~0.5m offset in lng at lat 39.9: 0.5 / (cos(39.9°) · 111320) ≈ 5.85e-6
  const FIVE_M_LNG = 5 / (Math.cos((ORIGIN_LAT * Math.PI) / 180) * 111320);

  it('returns null when nothing is within radius', () => {
    const lane = laneAt('lane-1', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + 0.001, ORIGIN_LAT],
    ]);
    // Cursor 100m north — way out of a 12m radius.
    const target = findSnapTarget({ x: ORIGIN_LNG, y: ORIGIN_LAT + 0.001 }, [lane], 12, null);
    expect(target).toBeNull();
  });

  it('snaps to a nearby endpoint', () => {
    const lane = laneAt('lane-1', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + 0.001, ORIGIN_LAT],
    ]);
    // Cursor 5m east of the start vertex — within 12m radius.
    const target = findSnapTarget({ x: ORIGIN_LNG + FIVE_M_LNG, y: ORIGIN_LAT }, [lane], 12, null);
    expect(target).not.toBeNull();
    expect(target!.kind).toBe('vertex');
    expect(target!.entityId).toBe('lane-1');
    expect(target!.point.x).toBe(ORIGIN_LNG);
    expect(target!.point.y).toBe(ORIGIN_LAT);
  });

  it('falls back to edge projection when no vertex is in range', () => {
    // Lane endpoints 50m apart (well past 12m), cursor near midpoint.
    const lane = laneAt('lane-1', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + FIVE_M_LNG * 10, ORIGIN_LAT],
    ]);
    // Cursor at midpoint, 3m off the line.
    const offsetLat = 3 / 111320;
    const midLng = ORIGIN_LNG + FIVE_M_LNG * 5;
    const target = findSnapTarget({ x: midLng, y: ORIGIN_LAT + offsetLat }, [lane], 12, null);
    expect(target).not.toBeNull();
    expect(target!.kind).toBe('edge');
    // Snapped point should land back on the segment (lat == origin).
    expect(target!.point.y).toBeCloseTo(ORIGIN_LAT, 7);
    expect(target!.point.x).toBeCloseTo(midLng, 7);
  });

  it('vertex wins over edge when both are in range', () => {
    // Build a lane where the cursor is 4m from a vertex AND 4m from an
    // adjacent edge (geometrically the vertex IS on the edge so the
    // vertex distance ≤ edge distance — we want the vertex tag).
    const lane = laneAt('lane-1', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + FIVE_M_LNG * 10, ORIGIN_LAT],
    ]);
    const target = findSnapTarget(
      { x: ORIGIN_LNG + FIVE_M_LNG * 0.5, y: ORIGIN_LAT },
      [lane],
      12,
      null,
    );
    expect(target).not.toBeNull();
    expect(target!.kind).toBe('vertex');
  });

  it('honors excludeId so dragged entity does not snap to itself', () => {
    const lane = laneAt('lane-1', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + 0.001, ORIGIN_LAT],
    ]);
    const target = findSnapTarget(
      { x: ORIGIN_LNG + FIVE_M_LNG, y: ORIGIN_LAT },
      [lane],
      12,
      'lane-1',
    );
    expect(target).toBeNull();
  });

  it('picks the closest vertex among multiple candidates', () => {
    const lane1 = laneAt('lane-near', [
      [ORIGIN_LNG + FIVE_M_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + FIVE_M_LNG * 2, ORIGIN_LAT],
    ]);
    const lane2 = laneAt('lane-far', [
      [ORIGIN_LNG + FIVE_M_LNG * 1.6, ORIGIN_LAT],
      [ORIGIN_LNG + FIVE_M_LNG * 3, ORIGIN_LAT],
    ]);
    // Cursor at +5m: lane-near's start is 0m away, lane-far's start is 3m away.
    const target = findSnapTarget(
      { x: ORIGIN_LNG + FIVE_M_LNG, y: ORIGIN_LAT },
      [lane1, lane2],
      12,
      null,
    );
    expect(target!.entityId).toBe('lane-near');
  });

  it('endpointRole propagates: snap to lane start tags "start"', () => {
    const lane = laneAt('lane-1', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + 0.001, ORIGIN_LAT],
    ]);
    const target = findSnapTarget({ x: ORIGIN_LNG + FIVE_M_LNG, y: ORIGIN_LAT }, [lane], 12, null);
    expect(target!.kind).toBe('vertex');
    expect(target!.endpointRole).toBe('start');
  });

  it('endpointRole "end" when snapping to the lane terminus', () => {
    const lane = laneAt('lane-1', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + FIVE_M_LNG * 10, ORIGIN_LAT],
    ]);
    const target = findSnapTarget(
      { x: ORIGIN_LNG + FIVE_M_LNG * 10, y: ORIGIN_LAT },
      [lane],
      12,
      null,
    );
    expect(target!.kind).toBe('vertex');
    expect(target!.endpointRole).toBe('end');
  });

  it('cursor near a lane interior vertex falls through to "edge" snap (no endpointRole)', () => {
    // 3-point lane with an interior vertex at the midpoint. Cursor sits
    // exactly on the interior vertex. With endpoints-only candidates,
    // this should be classified as an edge snap instead of vertex.
    const lane = laneAt('lane-1', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + FIVE_M_LNG * 5, ORIGIN_LAT],
      [ORIGIN_LNG + FIVE_M_LNG * 10, ORIGIN_LAT],
    ]);
    const target = findSnapTarget(
      { x: ORIGIN_LNG + FIVE_M_LNG * 5, y: ORIGIN_LAT },
      [lane],
      12,
      null,
    );
    expect(target!.kind).toBe('edge');
    expect(target!.endpointRole).toBeUndefined();
  });

  it('polygon vertex snap has no endpointRole (lane-only concept)', () => {
    const j: JunctionEntity = {
      id: 'j-1',
      entityType: 'junction',
      polygon: {
        points: [
          { x: ORIGIN_LNG, y: ORIGIN_LAT },
          { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT },
          { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT + 0.0001 },
        ],
      },
      type: 'CROSS_ROAD',
      overlapIds: [],
    };
    const target = findSnapTarget({ x: ORIGIN_LNG + FIVE_M_LNG, y: ORIGIN_LAT }, [j], 12, null);
    expect(target!.kind).toBe('vertex');
    expect(target!.entityType).toBe('junction');
    expect(target!.endpointRole).toBeUndefined();
  });

  it('snaps to a rectangle corner', () => {
    const rect: RectEntity = {
      id: 'rect-1',
      entityType: 'rect',
      p1: { x: ORIGIN_LNG, y: ORIGIN_LAT },
      p2: { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT + 0.0001 },
      rotation: 0,
    };
    const target = findSnapTarget(
      { x: ORIGIN_LNG + FIVE_M_LNG, y: ORIGIN_LAT + FIVE_M_LNG },
      [rect],
      12,
      null,
    );
    expect(target).not.toBeNull();
    expect(target!.entityType).toBe('rect');
    expect(target!.kind).toBe('vertex');
  });
});

// Type-only sanity: the public surface only depends on MapEntity.
// (Compile-time check; no runtime expectation.)
const _typeCheck: (e: MapEntity[]) => unknown = (e) => findSnapTarget({ x: 0, y: 0 }, e, 1);
void _typeCheck;
