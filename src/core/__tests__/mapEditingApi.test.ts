import { describe, expect, it } from 'vitest';
import type { BezierAnchor } from '@/core/geometry/interpolate';
import type { LngLat } from '@/core/geometry/interpolate';
import { createDrawnEntity, createMapEditingSession, hasDrawableGeometry } from '../mapEditingApi';
import type { MapEntity, PolylineEntity } from '@/types/entities';

const A: LngLat = [0, 0];
const NEAR_A: LngLat = [0.000001, 0];
const B: LngLat = [0.00001, 0];
const C: LngLat = [0.00001, 0.00001];
const FAR: LngLat = [0.001, 0];

const LINE_ANCHORS: BezierAnchor[] = [
  { point: A, handleIn: null, handleOut: null },
  { point: FAR, handleIn: null, handleOut: null },
];

describe('mapEditingApi draw point normalization', () => {
  it('treats near-duplicate polyline points as insufficient geometry', () => {
    expect(hasDrawableGeometry('drawPolyline', [A, NEAR_A], [])).toBe(false);
    expect(createDrawnEntity('drawPolyline', [A, NEAR_A], [], null)).toBeNull();
  });

  it('removes near-duplicate points from primitive polylines before commit', () => {
    const entity = createDrawnEntity('drawPolyline', [A, NEAR_A, B], [], null);

    expect(entity?.entityType).toBe('polyline');
    if (!entity || entity.entityType !== 'polyline') throw new Error('expected polyline');
    expect(entity.points).toEqual([
      { x: A[0], y: A[1] },
      { x: B[0], y: B[1] },
    ]);
  });

  it('creates Apollo line elements with allowed Bezier geometry', () => {
    const entity = createDrawnEntity('drawBezier', [], LINE_ANCHORS, 'lane');

    expect(entity?.entityType).toBe('lane');
    if (!entity || entity.entityType !== 'lane') throw new Error('expected lane');
    const points = entity.centralCurve.segments[0]?.lineSegment.points ?? [];
    expect(points[0]).toEqual({ x: A[0], y: A[1] });
    expect(points.at(-1)).toEqual({ x: FAR[0], y: FAR[1] });
  });

  it('creates Apollo line elements with allowed arc geometry', () => {
    const entity = createDrawnEntity('drawArc', [A, C, B], [], 'lane');

    expect(entity?.entityType).toBe('lane');
    if (!entity || entity.entityType !== 'lane') throw new Error('expected lane');
    const first = entity.centralCurve.segments[0]?.lineSegment.points[0];
    expect(first?.x).toBeCloseTo(A[0], 12);
    expect(first?.y).toBeCloseTo(A[1], 12);
  });

  it('creates every primitive draw entity type and rejects unknown states', () => {
    const anchors: BezierAnchor[] = [
      { point: [0, 0], handleIn: null, handleOut: [0.5, 0] },
      { point: [1, 1], handleIn: [0.5, 1], handleOut: null },
    ];

    expect(createDrawnEntity('drawCatmullRom', [A, B], [], null)).toMatchObject({
      id: 'catmullrom_1',
      entityType: 'catmullRom',
      points: [
        { x: A[0], y: A[1] },
        { x: B[0], y: B[1] },
      ],
    });
    expect(createDrawnEntity('drawBezier', [], anchors, null)).toMatchObject({
      id: 'bezier_1',
      entityType: 'bezier',
      anchors: [
        {
          point: { x: 0, y: 0 },
          handleIn: null,
          handleOut: { x: 0.5, y: 0 },
        },
        {
          point: { x: 1, y: 1 },
          handleIn: { x: 0.5, y: 1 },
          handleOut: null,
        },
      ],
    });
    expect(createDrawnEntity('drawArc', [A, C, B], [], null)).toMatchObject({
      id: 'arc_1',
      entityType: 'arc',
      start: { x: A[0], y: A[1] },
      mid: { x: C[0], y: C[1] },
      end: { x: B[0], y: B[1] },
    });
    expect(
      createDrawnEntity('drawRotatedRect', [A, B, [0.00001, 0.00001]], [], null),
    ).toMatchObject({
      id: 'rect_1',
      entityType: 'rect',
    });
    expect(createDrawnEntity('drawPolygon', [A, B, C], [], null)).toMatchObject({
      id: 'polygon_1',
      entityType: 'polygon',
      points: [
        { x: A[0], y: A[1] },
        { x: B[0], y: B[1] },
        { x: C[0], y: C[1] },
      ],
    });
    expect(createDrawnEntity('idle', [A, B, FAR], anchors, null)).toBeNull();
  });

  it('checks drawable geometry thresholds for all draw states', () => {
    const anchors: BezierAnchor[] = [
      { point: [0, 0], handleIn: null, handleOut: null },
      { point: [1, 1], handleIn: null, handleOut: null },
    ];

    expect(hasDrawableGeometry('drawBezier', [], anchors)).toBe(true);
    expect(hasDrawableGeometry('drawBezier', [], anchors.slice(0, 1))).toBe(false);
    expect(hasDrawableGeometry('drawArc', [A, C, B], [])).toBe(true);
    expect(hasDrawableGeometry('drawRotatedRect', [A, B, C], [])).toBe(true);
    expect(hasDrawableGeometry('drawPolygon', [A, B, C], [])).toBe(true);
    expect(hasDrawableGeometry('drawCatmullRom', [A, B], [])).toBe(true);
    expect(hasDrawableGeometry('drawPolyline', [A], [])).toBe(false);
  });

  it('rejects degenerate arc, rectangle, and polygon geometry', () => {
    expect(
      hasDrawableGeometry(
        'drawBezier',
        [],
        [
          { point: A, handleIn: null, handleOut: null },
          { point: NEAR_A, handleIn: null, handleOut: null },
        ],
      ),
    ).toBe(false);
    expect(hasDrawableGeometry('drawArc', [A, B, FAR], [])).toBe(false);
    expect(hasDrawableGeometry('drawArc', [A, NEAR_A, C], [])).toBe(false);
    expect(hasDrawableGeometry('drawRotatedRect', [A, B, FAR], [])).toBe(false);
    expect(hasDrawableGeometry('drawRotatedRect', [A, A, C], [])).toBe(false);
    expect(hasDrawableGeometry('drawPolygon', [A, B, FAR], [])).toBe(false);
    expect(hasDrawableGeometry('drawPolygon', [A, NEAR_A, B], [])).toBe(false);
  });

  it('uses existing ids when choosing new primitive ids', () => {
    const existing: PolylineEntity = {
      id: 'polyline_1',
      entityType: 'polyline',
      points: [{ x: 10, y: 10 }],
    };
    const entity = createDrawnEntity('drawPolyline', [A, B], [], null, {
      entities: new Map([[existing.id, existing]]),
    });

    expect(entity).toMatchObject({ id: 'polyline_2', entityType: 'polyline' });
  });

  it('passes lane options and existing Apollo ids through drawn element creation', () => {
    const existingLane = createDrawnEntity('drawBezier', [], LINE_ANCHORS, 'lane', {
      entities: new Map(),
    });
    if (!existingLane || existingLane.entityType !== 'lane') throw new Error('expected lane');

    const lane = createDrawnEntity('drawBezier', [], LINE_ANCHORS, 'lane', {
      laneHalfWidth: 4,
      laneSpeedLimit: 12,
      laneBoundaryType: 'SOLID_YELLOW',
      entities: new Map([[existingLane.id, existingLane]]),
    });

    expect(lane).toMatchObject({
      id: 'lane_2',
      entityType: 'lane',
      speedLimit: 12,
      leftSamples: [{ s: 0, width: 4 }],
      rightSamples: [{ s: 0, width: 4 }],
      leftBoundary: { boundaryType: [{ s: 0, types: ['SOLID_YELLOW'] }] },
      rightBoundary: { boundaryType: [{ s: 0, types: ['SOLID_YELLOW'] }] },
    });
  });

  it('rejects Apollo element draw tools that are not in the element tool whitelist', () => {
    expect(createDrawnEntity('drawPolyline', [A, B], [], 'lane')).toBeNull();
    expect(createDrawnEntity('drawPolygon', [A, B, C], [], 'lane')).toBeNull();
    expect(createDrawnEntity('drawPolyline', [A, B], [], 'junction')).toBeNull();
    expect(createDrawnEntity('drawArc', [A, C, B], [], 'signal')).toBeNull();
    expect(createDrawnEntity('drawArc', [A, C, B], [], 'crosswalk')).toBeNull();
  });
});

describe('createMapEditingSession', () => {
  function polyline(id = 'polyline_1'): PolylineEntity {
    return {
      id,
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    };
  }

  it('stores seed entities, adds entities, and returns an insertion-ordered array', () => {
    const seed = polyline('polyline_1');
    const added = polyline('polyline_2');
    const session = createMapEditingSession([seed]);

    expect(session.entities.get(seed.id)).toBe(seed);
    expect(session.addEntity(added)).toBe(added);
    expect(session.toEntitiesArray()).toEqual([seed, added]);
  });

  it('imports and exports raw Apollo elements through the entity bridge', () => {
    const session = createMapEditingSession();
    const rawLane = {
      id: { id: 'lane_1' },
      centralCurve: {
        segment: [
          {
            lineSegment: {
              point: [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
              ],
            },
          },
        ],
      },
    };

    const lane = session.addApolloRawElement('lane', rawLane);

    expect(lane).toMatchObject({ id: 'lane_1', entityType: 'lane' });
    expect(session.exportApolloRawElement(lane!)).toMatchObject({
      id: { id: 'lane_1' },
      central_curve: expect.any(Object),
    });
    expect(session.exportApolloRawElement(polyline() as MapEntity)).toBeNull();
  });

  it('returns null for unsupported raw imports and exports a complete Apollo map', () => {
    const session = createMapEditingSession();
    const lane = createDrawnEntity('drawBezier', [], LINE_ANCHORS, 'lane');
    if (!lane) throw new Error('expected lane');
    session.addEntity(lane);

    expect(session.addApolloRawElement('lane', {})).toBeNull();
    const map = session.exportApolloMap({ header: { version: 'base' } });

    expect(map.header).toEqual({ version: 'base' });
    expect(Array.isArray(map.lane)).toBe(true);
    expect(map.lane as unknown[]).toHaveLength(1);
  });
});
