/**
 * Snap (吸附) — pure function unit tests.
 *
 * Fixtures use Beijing-area lng/lat (≈ 116.4, 39.9). At that latitude
 * 1m ≈ 1.16e-5° in lng / 9.0e-6° in lat — keep deltas trivially small
 * so the projection round-trip stays sub-cm.
 */
import { describe, it, expect } from 'vitest';
import {
  collectCandidates,
  collectSnapGuidePoints,
  findSnapMatchFromCandidates,
  findSnapTarget,
  pixelsToMeters,
} from '../snap';
import type { MapEntity } from '@/types/entities';
import type { JunctionEntity, LaneEntity, ParkingSpaceEntity, SignalEntity } from '@/types/apollo';
import type { BezierEntity, CatmullRomEntity, PolygonEntity, RectEntity } from '@/types/entities';

const ORIGIN_LNG = 116.4;
const ORIGIN_LAT = 39.9;

function laneAt(id: string, points: [number, number][]): LaneEntity {
  const start = points[0] ?? [ORIGIN_LNG, ORIGIN_LAT];
  return {
    id,
    entityType: 'lane',
    centralCurve: {
      segments: [
        {
          lineSegment: { points: points.map(([x, y]) => ({ x, y })) },
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
  it('ignores empty lane geometry', () => {
    const lane = laneAt('lane-empty', []);
    const { vertices, edges } = collectCandidates([lane], null);
    expect(vertices).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

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

  it('emits all drawing polyline vertices and open edges via generic points fallback', () => {
    const catmull: CatmullRomEntity = {
      id: 'cat-1',
      entityType: 'catmullRom',
      points: [
        { x: ORIGIN_LNG, y: ORIGIN_LAT },
        { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT },
        { x: ORIGIN_LNG + 0.0002, y: ORIGIN_LAT + 0.0001 },
      ],
    };

    const { vertices, edges } = collectCandidates([catmull], null);

    expect(vertices.map((v) => v.vertexIndex)).toEqual([0, 1, 2]);
    expect(vertices.every((v) => v.endpointRole == null)).toBe(true);
    expect(edges).toHaveLength(2);
    expect(edges[1]).toMatchObject({ entityId: 'cat-1', entityType: 'catmullRom' });
  });

  it('emits Bezier anchor points via generic anchors fallback', () => {
    const bezier: BezierEntity = {
      id: 'bezier-1',
      entityType: 'bezier',
      anchors: [
        { point: { x: ORIGIN_LNG, y: ORIGIN_LAT }, handleIn: null, handleOut: null },
        {
          point: { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT + 0.0001 },
          handleIn: null,
          handleOut: null,
        },
      ],
    };

    const { vertices, edges } = collectCandidates([bezier], null);

    expect(vertices.map((v) => v.point)).toEqual(bezier.anchors.map((a) => a.point));
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ entityId: 'bezier-1', entityType: 'bezier' });
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

  it('uses source rectangle corners for Apollo entities drawn as rotated rectangles', () => {
    const parkingSpace: ParkingSpaceEntity = {
      id: 'parking-1',
      entityType: 'parkingSpace',
      polygon: {
        points: [
          { x: ORIGIN_LNG, y: ORIGIN_LAT },
          { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT },
          { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT + 0.0001 },
          { x: ORIGIN_LNG, y: ORIGIN_LAT + 0.0001 },
          { x: ORIGIN_LNG, y: ORIGIN_LAT },
        ],
      },
      heading: 0,
      overlapIds: [],
      _sourceRect: {
        p1: { x: ORIGIN_LNG, y: ORIGIN_LAT },
        p2: { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT + 0.00005 },
        rotation: Math.PI / 6,
      },
    };
    const { vertices, edges } = collectCandidates([parkingSpace], null);
    const guides = collectSnapGuidePoints(parkingSpace);

    expect(vertices).toHaveLength(4);
    expect(edges).toHaveLength(4);
    expect(guides).toHaveLength(4);
    expect(vertices.map((v) => v.point)).not.toContain(parkingSpace.polygon.points[4]);
  });

  it('uses polygon points for Apollo areas without source rectangles', () => {
    const signal: SignalEntity = {
      id: 'signal-1',
      entityType: 'signal',
      boundary: {
        points: [
          { x: ORIGIN_LNG, y: ORIGIN_LAT },
          { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT },
          { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT + 0.0001 },
        ],
      },
      subsignals: [],
      type: 'SINGLE',
      overlapIds: [],
      stopLines: [],
      signInfo: [],
    };

    const { vertices, edges } = collectCandidates([signal], null);

    expect(vertices.map((v) => v.point)).toEqual(signal.boundary.points);
    expect(edges).toHaveLength(3);
    expect(edges[2]!.a).toEqual(signal.boundary.points[2]);
    expect(edges[2]!.b).toEqual(signal.boundary.points[0]);
  });

  it('handles empty generic point and anchor entities without candidates', () => {
    const catmull: CatmullRomEntity = { id: 'cat-empty', entityType: 'catmullRom', points: [] };
    const bezier: BezierEntity = { id: 'bezier-empty', entityType: 'bezier', anchors: [] };

    const { vertices, edges } = collectCandidates([catmull, bezier], null);

    expect(vertices).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it('handles empty polygon collectors without candidates', () => {
    const polygon: PolygonEntity = { id: 'poly-empty', entityType: 'polygon', points: [] };

    const { vertices, edges } = collectCandidates([polygon], null);

    expect(vertices).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it('collects all Apollo polygon-style snap sources and arcs', () => {
    const tri = [
      { x: ORIGIN_LNG, y: ORIGIN_LAT },
      { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT },
      { x: ORIGIN_LNG, y: ORIGIN_LAT + 0.0001 },
    ];
    const entities = [
      { id: 'pnc-1', entityType: 'pncJunction', polygon: { points: tri } },
      { id: 'lot-1', entityType: 'parkingLot', polygon: { points: tri } },
      { id: 'cross-1', entityType: 'crosswalk', polygon: { points: tri } },
      { id: 'clear-1', entityType: 'clearArea', polygon: { points: tri } },
      { id: 'area-1', entityType: 'area', polygon: { points: tri } },
      { id: 'speed-1', entityType: 'speedControl', polygon: { points: tri } },
      {
        id: 'arc-1',
        entityType: 'arc',
        start: tri[0],
        mid: tri[1],
        end: tri[2],
      },
    ] as MapEntity[];

    const { vertices, edges } = collectCandidates(entities, null);

    expect(vertices).toHaveLength(21);
    expect(edges).toHaveLength(20);
    expect(vertices.map((v) => v.entityType)).toEqual(
      expect.arrayContaining([
        'pncJunction',
        'parkingLot',
        'crosswalk',
        'clearArea',
        'area',
        'speedControl',
        'arc',
      ]),
    );
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

  it('returns null for a non-positive search radius', () => {
    const target = findSnapMatchFromCandidates(
      { x: ORIGIN_LNG, y: ORIGIN_LAT },
      {
        vertices: [
          {
            point: { x: ORIGIN_LNG, y: ORIGIN_LAT },
            entityId: 'candidate-1',
            entityType: 'polyline',
            vertexIndex: 0,
          },
        ],
        edges: [],
      },
      0,
    );

    expect(target).toBeNull();
  });

  it('filters near-point candidate collection across all snap source geometry variants', () => {
    const tri = [
      { x: ORIGIN_LNG, y: ORIGIN_LAT },
      { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT },
      { x: ORIGIN_LNG, y: ORIGIN_LAT + 0.0001 },
    ];
    const entities = [
      { id: 'pnc-1', entityType: 'pncJunction', polygon: { points: tri } },
      {
        id: 'parking-1',
        entityType: 'parkingSpace',
        polygon: { points: tri },
      },
      { id: 'lot-1', entityType: 'parkingLot', polygon: { points: tri } },
      { id: 'cross-1', entityType: 'crosswalk', polygon: { points: tri } },
      { id: 'clear-1', entityType: 'clearArea', polygon: { points: tri } },
      { id: 'area-1', entityType: 'area', polygon: { points: tri } },
      { id: 'speed-1', entityType: 'speedControl', polygon: { points: tri } },
      { id: 'signal-1', entityType: 'signal', boundary: { points: tri } },
      { id: 'poly-1', entityType: 'polygon', points: tri },
      {
        id: 'rect-1',
        entityType: 'rect',
        p1: tri[0],
        p2: tri[1],
        rotation: 0,
      },
      { id: 'arc-1', entityType: 'arc', start: tri[0], mid: tri[1], end: tri[2] },
      { id: 'cat-1', entityType: 'catmullRom', points: tri },
      {
        id: 'bezier-1',
        entityType: 'bezier',
        anchors: tri.map((point) => ({ point, handleIn: null, handleOut: null })),
      },
      { id: 'unknown-1', entityType: 'unknownShape' },
    ] as MapEntity[];

    const target = findSnapTarget({ x: ORIGIN_LNG, y: ORIGIN_LAT }, entities, 12, null);

    expect(target).toMatchObject({
      kind: 'vertex',
      entityId: 'pnc-1',
      entityType: 'pncJunction',
    });
  });

  it('uses source rectangle geometry during near-point prefiltering', () => {
    const parkingSpace: ParkingSpaceEntity = {
      id: 'parking-source-rect',
      entityType: 'parkingSpace',
      polygon: {
        points: [
          { x: ORIGIN_LNG + 1, y: ORIGIN_LAT + 1 },
          { x: ORIGIN_LNG + 1.0001, y: ORIGIN_LAT + 1 },
          { x: ORIGIN_LNG + 1.0001, y: ORIGIN_LAT + 1.0001 },
        ],
      },
      heading: 0,
      overlapIds: [],
      _sourceRect: {
        p1: { x: ORIGIN_LNG, y: ORIGIN_LAT },
        p2: { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT + 0.0001 },
        rotation: 0,
      },
    };

    const target = findSnapTarget({ x: ORIGIN_LNG, y: ORIGIN_LAT }, [parkingSpace], 12, null);

    expect(target).toMatchObject({
      kind: 'vertex',
      entityId: 'parking-source-rect',
      entityType: 'parkingSpace',
    });
    expect(target!.point).toEqual({ x: ORIGIN_LNG, y: ORIGIN_LAT });
  });

  it('applies excludeId before near-point prefiltering and still considers matching neighbors', () => {
    const laneA = laneAt('lane-a', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + 0.001, ORIGIN_LAT],
    ]);
    const laneB = laneAt('lane-b', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + 0.001, ORIGIN_LAT],
    ]);

    const target = findSnapTarget(
      { x: ORIGIN_LNG + FIVE_M_LNG, y: ORIGIN_LAT },
      [laneA, laneB],
      12,
      'lane-a',
    );

    expect(target).toMatchObject({
      kind: 'vertex',
      entityId: 'lane-b',
      endpointRole: 'start',
    });
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

  it('returns distance in meters from candidate matches', () => {
    const offsetLat = 3 / 111320;
    const match = findSnapMatchFromCandidates(
      { x: ORIGIN_LNG, y: ORIGIN_LAT + offsetLat },
      {
        vertices: [],
        edges: [
          {
            a: { x: ORIGIN_LNG - 0.0001, y: ORIGIN_LAT },
            b: { x: ORIGIN_LNG + 0.0001, y: ORIGIN_LAT },
            entityId: 'edge-1',
            entityType: 'polyline',
          },
        ],
      },
      12,
    );

    expect(match).not.toBeNull();
    expect(match!.target.kind).toBe('edge');
    expect(match!.distanceMeters).toBeCloseTo(3, 6);
  });

  it('projects degenerate edge candidates as point snaps in edge pass', () => {
    const match = findSnapMatchFromCandidates(
      { x: ORIGIN_LNG, y: ORIGIN_LAT + 1 / 111320 },
      {
        vertices: [],
        edges: [
          {
            a: { x: ORIGIN_LNG, y: ORIGIN_LAT },
            b: { x: ORIGIN_LNG, y: ORIGIN_LAT },
            entityId: 'edge-1',
            entityType: 'polyline',
          },
        ],
      },
      2,
    );

    expect(match).not.toBeNull();
    expect(match!.target).toMatchObject({
      kind: 'edge',
      entityId: 'edge-1',
      entityType: 'polyline',
    });
    expect(match!.target.point.x).toBeCloseTo(ORIGIN_LNG, 12);
    expect(match!.target.point.y).toBeCloseTo(ORIGIN_LAT, 12);
  });

  it('clamps edge projection to segment endpoints', () => {
    const lane = laneAt('lane-1', [
      [ORIGIN_LNG, ORIGIN_LAT],
      [ORIGIN_LNG + FIVE_M_LNG * 10, ORIGIN_LAT],
    ]);

    const target = findSnapTarget(
      { x: ORIGIN_LNG + FIVE_M_LNG * 12, y: ORIGIN_LAT },
      [lane],
      12,
      null,
    );

    expect(target).not.toBeNull();
    expect(target!.kind).toBe('vertex');
    expect(target!.endpointRole).toBe('end');
    expect(target!.point.x).toBeCloseTo(ORIGIN_LNG + FIVE_M_LNG * 10, 12);
  });

  it('clamps edge-only projections before the start and after the end', () => {
    const before = findSnapMatchFromCandidates(
      { x: ORIGIN_LNG - FIVE_M_LNG, y: ORIGIN_LAT },
      {
        vertices: [],
        edges: [
          {
            a: { x: ORIGIN_LNG, y: ORIGIN_LAT },
            b: { x: ORIGIN_LNG + FIVE_M_LNG * 2, y: ORIGIN_LAT },
            entityId: 'edge-1',
            entityType: 'polyline',
          },
        ],
      },
      12,
    );
    expect(before).not.toBeNull();
    expect(before!.target.point.x).toBeCloseTo(ORIGIN_LNG, 12);

    const after = findSnapMatchFromCandidates(
      { x: ORIGIN_LNG + FIVE_M_LNG * 3, y: ORIGIN_LAT },
      {
        vertices: [],
        edges: [
          {
            a: { x: ORIGIN_LNG, y: ORIGIN_LAT },
            b: { x: ORIGIN_LNG + FIVE_M_LNG * 2, y: ORIGIN_LAT },
            entityId: 'edge-1',
            entityType: 'polyline',
          },
        ],
      },
      12,
    );
    expect(after).not.toBeNull();
    expect(after!.target.point.x).toBeCloseTo(ORIGIN_LNG + FIVE_M_LNG * 2, 12);
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
