/**
 * Unit tests for useOverlayLayer pure helpers.
 *
 * Private pure functions under test (replicated inline):
 *   samePoint                — LngLat | null equality (same as in useHotLayer)
 *   sameOverlayRenderState   — memoization equality for overlay render state
 *   buildOverlayFeatures     — constructs GeoJSON features for the active draw state
 *
 * buildOverlayFeatures is the largest testable chunk — it maps draw state +
 * drawPoints + previewPoint + bezierAnchors to a features array. Testing it
 * validates the overlay preview geometry for every draw tool without needing
 * MapLibre or React.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { LngLat, BezierAnchor } from '@/core/geometry/interpolate';
import {
  applySnapIndicatorSource,
  installOverlayLayer,
  installSnapIndicatorLayer,
  renderOverlayFrame,
  samePoint,
  sameOverlayRenderState,
  snapTargetFeatureCollection,
  buildOverlayFeatures,
  type OverlayRenderState,
} from '../useOverlayLayer';
import { useUIStore } from '@/store/uiStore';

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const P = (x: number, y: number): LngLat => [x, y];
const A = (x: number, y: number): BezierAnchor => ({
  point: [x, y],
  handleIn: null,
  handleOut: null,
});

const initialUIState = useUIStore.getState();

class FakeGeoJSONSource {
  setData = vi.fn();
}

function actorSnapshot(
  overrides: Partial<OverlayRenderState> & { activeElement?: string | null } = {},
) {
  const state = makeOverlayState(overrides);
  return {
    value: state.currentState,
    context: {
      drawPoints: state.drawPoints,
      previewPoint: state.previewPoint,
      bezierAnchors: state.bezierAnchors,
      activeElement: overrides.activeElement ?? null,
    },
  };
}

function actorRef(snapshot: ReturnType<typeof actorSnapshot>) {
  return { getSnapshot: vi.fn(() => snapshot) };
}

function subscribableActor(snapshot: ReturnType<typeof actorSnapshot>) {
  const listeners: Array<() => void> = [];
  const subscription = { unsubscribe: vi.fn() };
  return {
    getSnapshot: vi.fn(() => snapshot),
    subscribe: vi.fn((listener: () => void) => {
      listeners.push(listener);
      return subscription;
    }),
    emit() {
      for (const listener of listeners) listener();
    },
    subscription,
  };
}

function mapWithSource(source: FakeGeoJSONSource | null = new FakeGeoJSONSource()) {
  return {
    getSource: vi.fn((id: string) => (id === 'overlay' || id === 'snap' ? source : undefined)),
    once: vi.fn(),
    off: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useUIStore.setState(initialUIState, true);
});

// ---------------------------------------------------------------------------
// samePoint (same logic as in useHotLayer — tests here are for overlay copy)
// ---------------------------------------------------------------------------

describe('samePoint (useOverlayLayer)', () => {
  it('null, null → true', () => expect(samePoint(null, null)).toBe(true));
  it('same reference → true', () => {
    const p: LngLat = [1, 2];
    expect(samePoint(p, p)).toBe(true);
  });
  it('equal coords different ref → true', () => expect(samePoint([1, 2], [1, 2])).toBe(true));
  it('null vs point → false', () => expect(samePoint(null, [0, 0])).toBe(false));
  it('different coords → false', () => expect(samePoint([1, 2], [1, 3])).toBe(false));
});

// ---------------------------------------------------------------------------
// sameOverlayRenderState
// ---------------------------------------------------------------------------

const makeOverlayState = (overrides: Partial<OverlayRenderState> = {}): OverlayRenderState => ({
  currentState: 'drawPolyline',
  drawPoints: [],
  previewPoint: null,
  bezierAnchors: [],
  canRenderOverlay: true,
  ...overrides,
});

describe('sameOverlayRenderState', () => {
  it('returns false when a is null', () => {
    expect(sameOverlayRenderState(null, makeOverlayState())).toBe(false);
  });

  it('returns true for identical state', () => {
    const s = makeOverlayState();
    expect(sameOverlayRenderState(s, s)).toBe(true);
  });

  it('returns false when currentState differs', () => {
    expect(
      sameOverlayRenderState(
        makeOverlayState({ currentState: 'drawPolyline' }),
        makeOverlayState({ currentState: 'drawBezier' }),
      ),
    ).toBe(false);
  });

  it('returns false when drawPoints reference differs', () => {
    expect(
      sameOverlayRenderState(
        makeOverlayState({ drawPoints: [] }),
        makeOverlayState({ drawPoints: [] }), // different array instances
      ),
    ).toBe(false);
  });

  it('returns true when drawPoints and bezierAnchors are the same references', () => {
    // sameOverlayRenderState checks reference equality for both drawPoints and bezierAnchors.
    const pts: LngLat[] = [];
    const anchors: BezierAnchor[] = [];
    const a = makeOverlayState({ drawPoints: pts, bezierAnchors: anchors });
    const b = makeOverlayState({ drawPoints: pts, bezierAnchors: anchors });
    expect(sameOverlayRenderState(a, b)).toBe(true);
  });

  it('returns false when previewPoint coords differ', () => {
    const pts: LngLat[] = [];
    expect(
      sameOverlayRenderState(
        makeOverlayState({ drawPoints: pts, previewPoint: [1, 2] }),
        makeOverlayState({ drawPoints: pts, previewPoint: [1, 3] }),
      ),
    ).toBe(false);
  });

  it('returns true when previewPoint coords are equal', () => {
    const pts: LngLat[] = [];
    const anchors: BezierAnchor[] = [];
    expect(
      sameOverlayRenderState(
        makeOverlayState({ drawPoints: pts, bezierAnchors: anchors, previewPoint: [5, 6] }),
        makeOverlayState({ drawPoints: pts, bezierAnchors: anchors, previewPoint: [5, 6] }),
      ),
    ).toBe(true);
  });

  it('returns false when layer render guard differs', () => {
    const pts: LngLat[] = [];
    const anchors: BezierAnchor[] = [];
    expect(
      sameOverlayRenderState(
        makeOverlayState({ drawPoints: pts, bezierAnchors: anchors, canRenderOverlay: true }),
        makeOverlayState({ drawPoints: pts, bezierAnchors: anchors, canRenderOverlay: false }),
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildOverlayFeatures — per draw state
// ---------------------------------------------------------------------------

describe('buildOverlayFeatures — idle/selected/unknown', () => {
  it('returns empty array for idle state', () => {
    expect(buildOverlayFeatures(makeOverlayState({ currentState: 'idle' }))).toHaveLength(0);
  });

  it('returns empty array for selected state', () => {
    expect(buildOverlayFeatures(makeOverlayState({ currentState: 'selected' }))).toHaveLength(0);
  });

  it('returns empty array for unknown state', () => {
    expect(buildOverlayFeatures(makeOverlayState({ currentState: 'editingPoint' }))).toHaveLength(
      0,
    );
  });
});

describe('buildOverlayFeatures — drawPolyline', () => {
  it('0 points → no features', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({ currentState: 'drawPolyline', drawPoints: [] }),
    );
    expect(f).toHaveLength(0);
  });

  it('1 point + no preview → 1 vertex point, no line', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawPolyline',
        drawPoints: [P(0, 0)],
      }),
    );
    // Only vertex point features, no line (need >=2 total)
    expect(f).toHaveLength(1);
    expect(f[0]!.geometry.type).toBe('Point');
  });

  it('2 points → 1 line + 2 vertex points', () => {
    const pts = [P(0, 0), P(1, 1)];
    const f = buildOverlayFeatures(
      makeOverlayState({ currentState: 'drawPolyline', drawPoints: pts }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    const points = f.filter((x) => x.geometry.type === 'Point');
    expect(lines).toHaveLength(1);
    expect(points).toHaveLength(2);
  });

  it('1 point + previewPoint → line + vertex point', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawPolyline',
        drawPoints: [P(0, 0)],
        previewPoint: P(5, 5),
      }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    expect(lines).toHaveLength(1);
  });
});

describe('buildOverlayFeatures — drawCatmullRom', () => {
  it('2 points → 1 (interpolated) line + 2 vertex points', () => {
    const pts = [P(0, 0), P(1, 1)];
    const f = buildOverlayFeatures(
      makeOverlayState({ currentState: 'drawCatmullRom', drawPoints: pts }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    expect(lines).toHaveLength(1);
  });
});

describe('buildOverlayFeatures — drawBezier', () => {
  it('0 anchors → empty', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({ currentState: 'drawBezier', bezierAnchors: [] }),
    );
    expect(f).toHaveLength(0);
  });

  it('1 anchor + no preview → only vertex point (1 anchor insufficient for line)', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawBezier',
        bezierAnchors: [A(0, 0)],
      }),
    );
    // 1 anchor = 1 vertex point, no line
    expect(f.filter((x) => x.geometry.type === 'LineString')).toHaveLength(0);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(1);
  });

  it('2 anchors → 1 bezier line + 2 vertex points', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawBezier',
        bezierAnchors: [A(0, 0), A(1, 1)],
      }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    const points = f.filter((x) => x.geometry.type === 'Point');
    expect(lines).toHaveLength(1);
    expect(points).toHaveLength(2);
  });

  it('1 anchor + preview → bezier line preview', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawBezier',
        bezierAnchors: [A(0, 0)],
        previewPoint: P(1, 1),
      }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    expect(lines).toHaveLength(1);
  });

  it('anchor with handles emits handle lines and handle points', () => {
    const anchorWithHandles: BezierAnchor = {
      point: P(0, 0),
      handleIn: P(-0.5, 0),
      handleOut: P(0.5, 0),
    };
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawBezier',
        bezierAnchors: [anchorWithHandles, A(1, 0)],
      }),
    );
    // Should include handle lines and handle points
    const handlePoints = f.filter(
      (x) =>
        x.geometry.type === 'Point' && (x.properties as Record<string, unknown>)?.role === 'handle',
    );
    expect(handlePoints.length).toBeGreaterThanOrEqual(2);
  });
});

describe('buildOverlayFeatures — drawArc', () => {
  it('1 point → 1 vertex, no line', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawArc',
        drawPoints: [P(0, 0)],
      }),
    );
    expect(f.filter((x) => x.geometry.type === 'LineString')).toHaveLength(0);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(1);
  });

  it('2 points → straight line + 2 vertices', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawArc',
        drawPoints: [P(0, 0), P(1, 0)],
      }),
    );
    expect(f.filter((x) => x.geometry.type === 'LineString')).toHaveLength(1);
  });

  it('3 points → arc line + 3 vertices', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawArc',
        drawPoints: [P(0, 0), P(0.005, 0.005), P(0.01, 0)],
      }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    expect(lines).toHaveLength(1);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(3);
  });

  it('2 points + preview → 3-point arc', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawArc',
        drawPoints: [P(0, 0), P(0.005, 0.005)],
        previewPoint: P(0.01, 0),
      }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    expect(lines).toHaveLength(1);
  });
});

describe('buildOverlayFeatures — drawRotatedRect', () => {
  it('0 points → empty', () => {
    expect(
      buildOverlayFeatures(makeOverlayState({ currentState: 'drawRotatedRect' })),
    ).toHaveLength(0);
  });

  it('1 point + preview → line preview (axis)', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawRotatedRect',
        drawPoints: [P(0, 0)],
        previewPoint: P(1, 0),
      }),
    );
    // 1 point drawn + preview: show axis line. No vertex point for the point yet
    // (the point vertex is pushed only for drawPoints, not preview)
    expect(f.filter((x) => x.geometry.type === 'LineString')).toHaveLength(1);
  });

  it('2 points → axis line + 2 vertices', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawRotatedRect',
        drawPoints: [P(0, 0), P(1, 0)],
      }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    expect(lines).toHaveLength(1);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(2);
  });

  it('3 points → polygon + 3 vertices', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawRotatedRect',
        drawPoints: [P(0, 0), P(0.01, 0), P(0.01, 0.005)],
      }),
    );
    const polygons = f.filter((x) => x.geometry.type === 'Polygon');
    expect(polygons).toHaveLength(1);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(3);
  });
});

describe('buildOverlayFeatures — drawPolygon', () => {
  it('1 point → 1 vertex, no line, no polygon', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawPolygon',
        drawPoints: [P(0, 0)],
      }),
    );
    expect(f.filter((x) => x.geometry.type === 'Polygon')).toHaveLength(0);
    expect(f.filter((x) => x.geometry.type === 'LineString')).toHaveLength(0);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(1);
  });

  it('2 points → line + 2 vertices', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawPolygon',
        drawPoints: [P(0, 0), P(1, 0)],
      }),
    );
    expect(f.filter((x) => x.geometry.type === 'LineString')).toHaveLength(1);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(2);
  });

  it('3 points → polygon + 3 vertices', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawPolygon',
        drawPoints: [P(0, 0), P(1, 0), P(0.5, 1)],
      }),
    );
    expect(f.filter((x) => x.geometry.type === 'Polygon')).toHaveLength(1);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(3);
  });

  it('2 points + preview → polygon (3 total)', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawPolygon',
        drawPoints: [P(0, 0), P(1, 0)],
        previewPoint: P(0.5, 1),
      }),
    );
    expect(f.filter((x) => x.geometry.type === 'Polygon')).toHaveLength(1);
  });
});

describe('overlay frame rendering', () => {
  it('writes overlay feature collections for drawing states', () => {
    const source = new FakeGeoJSONSource();
    const map = mapWithSource(source);
    const last = renderOverlayFrame({
      map: map as never,
      mapLoaded: true,
      actorRef: actorRef(
        actorSnapshot({
          currentState: 'drawPolyline',
          drawPoints: [P(0, 0)],
          previewPoint: P(1, 1),
        }),
      ) as never,
      lastRenderState: null,
    });

    expect(last?.currentState).toBe('drawPolyline');
    expect(source.setData).toHaveBeenCalledWith({
      type: 'FeatureCollection',
      features: expect.arrayContaining([expect.objectContaining({ type: 'Feature' })]),
    });
  });

  it('clears overlay data for non-drawing states and locked active elements', () => {
    const source = new FakeGeoJSONSource();
    const idleMap = mapWithSource(source);

    renderOverlayFrame({
      map: idleMap as never,
      mapLoaded: true,
      actorRef: actorRef(actorSnapshot({ currentState: 'selected' })) as never,
      lastRenderState: null,
    });

    expect(source.setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });

    source.setData.mockClear();
    useUIStore.getState().setLayerLocked('lane', true);
    const lockedSnapshot = {
      ...actorSnapshot({
        currentState: 'drawPolyline',
        drawPoints: [P(0, 0)],
        previewPoint: P(1, 1),
      }),
      context: {
        ...actorSnapshot({
          currentState: 'drawPolyline',
          drawPoints: [P(0, 0)],
          previewPoint: P(1, 1),
        }).context,
        activeElement: 'lane',
      },
    };

    const next = renderOverlayFrame({
      map: mapWithSource(source) as never,
      mapLoaded: true,
      actorRef: actorRef(lockedSnapshot) as never,
      lastRenderState: null,
    });

    expect(next?.canRenderOverlay).toBe(false);
    expect(source.setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });
  });

  it('skips map writes when map is unloaded, source is missing, or state is unchanged', () => {
    const source = new FakeGeoJSONSource();
    const snapshot = actorSnapshot({
      currentState: 'drawPolyline',
      drawPoints: [P(0, 0)],
      previewPoint: P(1, 1),
    });

    expect(
      renderOverlayFrame({
        map: mapWithSource(source) as never,
        mapLoaded: false,
        actorRef: actorRef(snapshot) as never,
        lastRenderState: null,
      }),
    ).toBeNull();
    expect(source.setData).not.toHaveBeenCalled();

    expect(
      renderOverlayFrame({
        map: mapWithSource(null) as never,
        mapLoaded: true,
        actorRef: actorRef(snapshot) as never,
        lastRenderState: null,
      }),
    ).toBeNull();

    const rendered = renderOverlayFrame({
      map: mapWithSource(source) as never,
      mapLoaded: true,
      actorRef: actorRef(snapshot) as never,
      lastRenderState: null,
    });
    source.setData.mockClear();
    const skipped = renderOverlayFrame({
      map: mapWithSource(source) as never,
      mapLoaded: true,
      actorRef: actorRef(snapshot) as never,
      lastRenderState: rendered,
    });

    expect(skipped).toBe(rendered);
    expect(source.setData).not.toHaveBeenCalled();
  });
});

describe('snap indicator source rendering', () => {
  it('builds snap target feature collections', () => {
    expect(
      snapTargetFeatureCollection({
        kind: 'vertex',
        entityId: 'lane-1',
        entityType: 'lane',
        point: { x: 1, y: 2 },
      }),
    ).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { kind: 'vertex', entityId: 'lane-1', entityType: 'lane' },
          geometry: { type: 'Point', coordinates: [1, 2] },
        },
      ],
    });
  });

  it('writes snap targets, clears null target, and skips missing sources', () => {
    const source = new FakeGeoJSONSource();
    const map = mapWithSource(source);

    applySnapIndicatorSource(map as never, true, {
      kind: 'edge',
      entityId: 'poly-1',
      entityType: 'polyline',
      point: { x: 3, y: 4 },
    });
    applySnapIndicatorSource(map as never, true, null);
    applySnapIndicatorSource(mapWithSource(source) as never, false, null);
    applySnapIndicatorSource(mapWithSource(null) as never, true, null);

    expect(source.setData).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'FeatureCollection' }),
    );
    expect(source.setData).toHaveBeenNthCalledWith(2, {
      type: 'FeatureCollection',
      features: [],
    });
    expect(source.setData).toHaveBeenCalledTimes(2);
  });
});

describe('installOverlayLayer', () => {
  it('schedules loaded overlay renders, dedupes pending frames, reacts to UI changes, and cleans up', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const cancelAnimationFrameSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy);

    const source = new FakeGeoJSONSource();
    const map = mapWithSource(source);
    const actor = subscribableActor(
      actorSnapshot({
        currentState: 'drawPolyline',
        drawPoints: [P(0, 0)],
        previewPoint: P(1, 1),
      }),
    );

    const cleanup = installOverlayLayer(map as never, { current: true }, actor as never);

    expect(actor.subscribe).toHaveBeenCalledTimes(1);
    expect(rafCallbacks).toHaveLength(1);

    actor.emit();
    expect(rafCallbacks).toHaveLength(1);

    rafCallbacks[0]!(0);
    expect(source.setData).toHaveBeenCalledTimes(1);

    useUIStore.getState().setLayerLocked('polyline', true);
    expect(rafCallbacks).toHaveLength(2);

    cleanup();

    expect(actor.subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(map.off).toHaveBeenCalledWith('load', expect.any(Function));
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(2);
  });

  it('waits for load when mapLoadedRef is false', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const source = new FakeGeoJSONSource();
    const map = mapWithSource(source);
    const actor = subscribableActor(actorSnapshot({ currentState: 'selected' }));
    const mapLoadedRef = { current: false };

    const cleanup = installOverlayLayer(map as never, mapLoadedRef, actor as never);

    expect(map.once).toHaveBeenCalledWith('load', expect.any(Function));
    expect(rafCallbacks).toHaveLength(0);

    mapLoadedRef.current = true;
    const onLoad = map.once.mock.calls[0]![1] as () => void;
    onLoad();
    expect(rafCallbacks).toHaveLength(1);

    rafCallbacks[0]!(0);
    expect(source.setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });

    cleanup();
  });
});

describe('installSnapIndicatorLayer', () => {
  it('applies current snap target, reacts only to target changes, and unsubscribes', () => {
    const source = new FakeGeoJSONSource();
    const map = mapWithSource(source);
    const snapTarget = {
      kind: 'vertex' as const,
      entityId: 'lane-1',
      entityType: 'lane',
      point: { x: 1, y: 2 },
    };
    useUIStore.getState().setSnapTarget(snapTarget);

    const unsubscribe = installSnapIndicatorLayer(map as never, { current: true });

    expect(source.setData).toHaveBeenCalledTimes(1);
    expect(source.setData).toHaveBeenCalledWith(snapTargetFeatureCollection(snapTarget));

    useUIStore.setState({ layerStates: { ...useUIStore.getState().layerStates } });
    expect(source.setData).toHaveBeenCalledTimes(1);

    useUIStore.getState().setSnapTarget(null);
    expect(source.setData).toHaveBeenCalledTimes(2);
    expect(source.setData).toHaveBeenLastCalledWith({ type: 'FeatureCollection', features: [] });

    unsubscribe();
    useUIStore.getState().setSnapTarget(snapTarget);
    expect(source.setData).toHaveBeenCalledTimes(2);
  });
});
