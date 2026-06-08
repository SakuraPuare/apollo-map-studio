/**
 * Unit tests for useDrawCommit geometry-validation logic.
 *
 * The hook fires `commitEntity` when the FSM transitions from any draw state
 * to 'idle'. The entity is only committed when the geometry meets a minimum
 * point/anchor count. We test the `hasGeometry` decision matrix — the exact
 * conditions inside `commitEntity` — in isolation without needing a real
 * React renderer, MapStore, or MapLibre instance.
 *
 * Minimum-count table (from commitEntity source):
 *   drawBezier      anchors.length >= 2
 *   drawArc         points.length  >= 3
 *   drawRotatedRect points.length  >= 3
 *   drawPolygon     points.length  >= 3
 *   drawPolyline    points.length  >= 2
 *   drawCatmullRom  points.length  >= 2
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { LngLat, BezierAnchor } from '@/core/geometry/interpolate';
import { isDrawingState } from '@/core/fsm/editorMachine';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import {
  commitDrawnEntity,
  hasGeometryForState as hasGeometry,
  installDrawCommitSubscription,
} from '../useDrawCommit';

const P: LngLat = [0, 0]; // placeholder point
const P1: LngLat = [0.00001, 0];
const P2: LngLat = [0.00002, 0];
const P_UP: LngLat = [0.00001, 0.00001];
const A: BezierAnchor = { point: P, handleIn: null, handleOut: null }; // placeholder anchor
const B: BezierAnchor = { point: P1, handleIn: null, handleOut: null };
const initialUIState = useUIStore.getState();

beforeEach(() => {
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useUIStore.setState(initialUIState, true);
});

// ---------------------------------------------------------------------------
// Tests per draw state
// ---------------------------------------------------------------------------

describe('hasGeometry — drawPolyline', () => {
  it('false with 0 points', () => expect(hasGeometry('drawPolyline', [], [])).toBe(false));
  it('false with 1 point', () => expect(hasGeometry('drawPolyline', [P], [])).toBe(false));
  it('true with 2 points (minimum)', () =>
    expect(hasGeometry('drawPolyline', [P, P1], [])).toBe(true));
  it('false with near-duplicate 2 points', () =>
    expect(hasGeometry('drawPolyline', [P, [0.000001, 0]], [])).toBe(false));
  it('true with 5 points', () =>
    expect(hasGeometry('drawPolyline', [P, P1, P2, [0.00003, 0], [0.00004, 0]], [])).toBe(true));
});

describe('hasGeometry — drawCatmullRom', () => {
  it('false with 0 points', () => expect(hasGeometry('drawCatmullRom', [], [])).toBe(false));
  it('false with 1 point', () => expect(hasGeometry('drawCatmullRom', [P], [])).toBe(false));
  it('true with 2 points (minimum)', () =>
    expect(hasGeometry('drawCatmullRom', [P, P1], [])).toBe(true));
  it('true with 3 points', () => expect(hasGeometry('drawCatmullRom', [P, P1, P2], [])).toBe(true));
});

describe('hasGeometry — drawBezier', () => {
  it('false with 0 anchors', () => expect(hasGeometry('drawBezier', [], [])).toBe(false));
  it('false with 1 anchor', () => expect(hasGeometry('drawBezier', [], [A])).toBe(false));
  it('false with duplicate anchors', () =>
    expect(hasGeometry('drawBezier', [], [A, A])).toBe(false));
  it('true with 2 distinct anchors (minimum)', () =>
    expect(hasGeometry('drawBezier', [], [A, B])).toBe(true));
  it('true with 4 anchors', () => expect(hasGeometry('drawBezier', [], [A, B, A, B])).toBe(true));
  it('points count is irrelevant for bezier', () => {
    // Even with 10 points, bezier needs anchors.
    expect(hasGeometry('drawBezier', [P, P, P, P, P, P, P, P, P, P], [])).toBe(false);
    expect(hasGeometry('drawBezier', [P, P, P, P, P, P, P, P, P, P], [A, B])).toBe(true);
  });
});

describe('hasGeometry — drawArc', () => {
  it('false with 0 points', () => expect(hasGeometry('drawArc', [], [])).toBe(false));
  it('false with 1 point', () => expect(hasGeometry('drawArc', [P], [])).toBe(false));
  it('false with 2 points', () => expect(hasGeometry('drawArc', [P, P], [])).toBe(false));
  it('true with 3 points (minimum)', () =>
    expect(hasGeometry('drawArc', [P, P_UP, P1], [])).toBe(true));
  it('true with 4 points', () => expect(hasGeometry('drawArc', [P, P_UP, P1, P2], [])).toBe(true));
  it('false with collinear points', () =>
    expect(hasGeometry('drawArc', [P, P1, P2], [])).toBe(false));
});

describe('hasGeometry — drawRotatedRect', () => {
  it('false with 2 points', () => expect(hasGeometry('drawRotatedRect', [P, P], [])).toBe(false));
  it('true with 3 points (minimum)', () =>
    expect(hasGeometry('drawRotatedRect', [P, P1, P_UP], [])).toBe(true));
  it('false with zero width', () =>
    expect(hasGeometry('drawRotatedRect', [P, P1, P2], [])).toBe(false));
});

describe('hasGeometry — drawPolygon', () => {
  it('false with 2 points', () => expect(hasGeometry('drawPolygon', [P, P], [])).toBe(false));
  it('true with 3 points (minimum)', () =>
    expect(hasGeometry('drawPolygon', [P, P1, P_UP], [])).toBe(true));
  it('true with 6 points', () =>
    expect(
      hasGeometry('drawPolygon', [P, P1, P_UP, P2, [0.00003, 0.00001], [0.00004, 0]], []),
    ).toBe(true));
  it('false with collinear points', () =>
    expect(hasGeometry('drawPolygon', [P, P1, P2], [])).toBe(false));
});

describe('hasGeometry — non-draw states always return false', () => {
  it('idle with many points returns false', () =>
    expect(hasGeometry('idle', [P, P, P], [A, A])).toBe(false));
  it('selected with many points returns false', () =>
    expect(hasGeometry('selected', [P, P, P], [A, A])).toBe(false));
  it('editingPoint returns false', () =>
    expect(hasGeometry('editingPoint', [P, P, P], [A, A])).toBe(false));
});

// ---------------------------------------------------------------------------
// Transition contract: commit fires only on draw→idle, not idle→idle
// ---------------------------------------------------------------------------

describe('commit transition guard (idle←drawX)', () => {
  it('only triggers when prevState was a draw state and nextState is idle', () => {
    const transitions: Array<{ prev: string; next: string; shouldCommit: boolean }> = [
      { prev: 'drawPolyline', next: 'idle', shouldCommit: true },
      { prev: 'drawBezier', next: 'idle', shouldCommit: true },
      { prev: 'idle', next: 'idle', shouldCommit: false },
      { prev: 'selected', next: 'idle', shouldCommit: false },
      { prev: 'drawPolyline', next: 'selected', shouldCommit: false },
      { prev: 'editingPoint', next: 'idle', shouldCommit: false },
    ];

    for (const { prev, next, shouldCommit } of transitions) {
      const result = next === 'idle' && isDrawingState(prev);
      expect(result).toBe(shouldCommit);
    }
  });
});

describe('commitDrawnEntity', () => {
  it('adds a primitive entity when geometry is drawable and the target layer is interactive', () => {
    commitDrawnEntity('drawPolyline', [P, P1], [], null);

    const entities = Array.from(useMapStore.getState().entities.values());
    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({
      entityType: 'polyline',
      points: [
        { x: P[0], y: P[1] },
        { x: P1[0], y: P1[1] },
      ],
    });
  });

  it('does not add invalid geometry', () => {
    commitDrawnEntity('drawPolyline', [P], [], null);

    expect(useMapStore.getState().entities.size).toBe(0);
  });

  it('does not add an entity when its layer is locked', () => {
    useUIStore.getState().setLayerLocked('polyline', true);

    commitDrawnEntity('drawPolyline', [P, P1], [], null);

    expect(useMapStore.getState().entities.size).toBe(0);
  });
});

describe('installDrawCommitSubscription', () => {
  function snapshot(value: string, overrides: Record<string, unknown> = {}) {
    return {
      value,
      context: {
        drawPoints: [],
        bezierAnchors: [],
        activeElement: null,
        ...overrides,
      },
    };
  }

  type DrawCommitSnapshot = ReturnType<typeof snapshot>;

  function actorStub(initialState = 'drawPolyline') {
    let listener: ((next: DrawCommitSnapshot) => void) | null = null;
    const unsubscribe = vi.fn();
    const actor = {
      getSnapshot: vi.fn(() => snapshot(initialState)),
      subscribe: vi.fn((fn: typeof listener) => {
        listener = fn;
        return { unsubscribe };
      }),
      send: vi.fn(),
      emit(next: DrawCommitSnapshot) {
        listener?.(next);
      },
      unsubscribe,
    };
    return actor;
  }

  it('commits post-transition geometry and sends RESET on draw-to-idle', () => {
    const actor = actorStub('drawPolyline');
    installDrawCommitSubscription(actor as never);

    actor.emit(snapshot('idle', { drawPoints: [P, P1] }));

    expect(useMapStore.getState().entities.size).toBe(1);
    expect(actor.send).toHaveBeenCalledWith({ type: 'RESET' });
  });

  it('does not commit when the next state is not idle', () => {
    const actor = actorStub('drawPolyline');
    installDrawCommitSubscription(actor as never);

    actor.emit(snapshot('selected', { drawPoints: [P, P1] }));

    expect(useMapStore.getState().entities.size).toBe(0);
    expect(actor.send).not.toHaveBeenCalled();
  });

  it('updates the previous snapshot after ignored transitions', () => {
    const actor = actorStub('selected');
    installDrawCommitSubscription(actor as never);

    actor.emit(snapshot('drawPolyline'));
    actor.emit(snapshot('idle', { drawPoints: [P, P1] }));

    expect(useMapStore.getState().entities.size).toBe(1);
    expect(actor.send).toHaveBeenCalledWith({ type: 'RESET' });
  });

  it('unsubscribes from the actor on cleanup', () => {
    const actor = actorStub('drawPolyline');

    const cleanup = installDrawCommitSubscription(actor as never);
    cleanup();

    expect(actor.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
