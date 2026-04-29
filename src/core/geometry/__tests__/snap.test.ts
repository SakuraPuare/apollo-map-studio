/**
 * Snap (吸附) — pure function unit tests.
 *
 * Fixtures use Beijing-area lng/lat (≈ 116.4, 39.9). At that latitude
 * 1m ≈ 1.16e-5° in lng / 9.0e-6° in lat — keep deltas trivially small
 * so the projection round-trip stays sub-cm.
 */
import { describe, it, expect } from 'vitest';
import { findSnapTarget, pixelsToMeters, collectCandidates } from '../snap';
import type { MapEntity } from '@/types/entities';
import type { JunctionEntity, LaneEntity } from '@/types/apollo';

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
  it('emits one vertex per polyline point and N-1 edges', () => {
    const lane = laneAt('lane-1', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + 0.0001, ORIGIN_LAT],
      [ORIGIN_LNG + 0.0002, ORIGIN_LAT],
    ]);
    const { vertices, edges } = collectCandidates([lane], null);
    expect(vertices).toHaveLength(3);
    expect(edges).toHaveLength(2);
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
});

// Type-only sanity: the public surface only depends on MapEntity.
// (Compile-time check; no runtime expectation.)
const _typeCheck: (e: MapEntity[]) => unknown = (e) => findSnapTarget({ x: 0, y: 0 }, e, 1);
void _typeCheck;
