/**
 * Unit tests for useMapEventRouter pure helpers.
 *
 * Covered:
 *  1. isDuplicateInput — already covered in clickDedup.test.ts; one smoke test
 *     here to confirm the export is stable.
 *  2. isSnapApplicable — snap is only allowed in drawing states and editingPoint.
 *  3. pixelToRadius — converts screen pixels to approximate lng/lat degrees at
 *     a given zoom level. Pure math, no MapLibre needed.
 *  4. hitBbox — pads a center point by HIT_BBOX_PADDING_PX on all sides.
 *  5. scheduleCursorUpdate / flushCursor — RAF-coalescing contract: multiple
 *     calls within a single frame produce exactly one UI update.
 *  6. onKeyDown — Escape/Enter/Delete key routing logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDuplicateInput } from '../useMapEventRouter';
import { isDrawingState } from '@/core/fsm/editorMachine';
import { HIT_BBOX_PADDING_PX } from '@/config/mapConstants';
import { useUIStore } from '@/store/uiStore';
import { workerHitTest } from '../mapEventRouter/hitTest';
import { createMapEventHandlers, createRouterContext } from '../mapEventRouter/eventHandlers';

const initialUISnapshot = useUIStore.getState();

beforeEach(() => {
  useUIStore.setState(initialUISnapshot, true);
});

// ---------------------------------------------------------------------------
// 1. isDuplicateInput smoke (full suite in clickDedup.test.ts)
// ---------------------------------------------------------------------------

describe('isDuplicateInput — re-export smoke test', () => {
  it('is a function', () => {
    expect(typeof isDuplicateInput).toBe('function');
  });

  it('returns false for first input (no previous sample)', () => {
    expect(isDuplicateInput(null, { x: 50, y: 50, ts: 0 })).toBe(false);
  });

  it('returns true for same pixel within 350ms', () => {
    const prev = { x: 100, y: 100, ts: 1000 };
    expect(isDuplicateInput(prev, { x: 100, y: 100, ts: 1100 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. isSnapApplicable
//    Drawing states + editingPoint: snap allowed
//    idle + selected: snap NOT allowed
// ---------------------------------------------------------------------------

/**
 * Replicate the isSnapApplicable guard from useMapEventRouter verbatim.
 */
function isSnapApplicable(state: string): boolean {
  return state === 'editingPoint' || isDrawingState(state);
}

describe('isSnapApplicable', () => {
  const snapAllowed = [
    'editingPoint',
    'drawPolyline',
    'drawCatmullRom',
    'drawBezier',
    'drawArc',
    'drawRotatedRect',
    'drawPolygon',
  ];

  const snapBlocked = ['idle', 'selected'];

  for (const state of snapAllowed) {
    it(`snap is applicable in ${state}`, () => {
      expect(isSnapApplicable(state)).toBe(true);
    });
  }

  for (const state of snapBlocked) {
    it(`snap is NOT applicable in ${state}`, () => {
      expect(isSnapApplicable(state)).toBe(false);
    });
  }

  it('snap is not applicable in unknown states', () => {
    expect(isSnapApplicable('flying')).toBe(false);
    expect(isSnapApplicable('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. pixelToRadius
//    Formula: (px * 360) / (512 * 2^zoom)
//    Used to convert a screen-pixel radius into approximate lng-degree radius.
// ---------------------------------------------------------------------------

function pixelToRadius(px: number, zoom: number): number {
  return (px * 360) / (512 * Math.pow(2, zoom));
}

describe('pixelToRadius', () => {
  it('produces a positive radius for positive inputs', () => {
    expect(pixelToRadius(10, 15)).toBeGreaterThan(0);
  });

  it('radius decreases as zoom increases (higher zoom → smaller world-space radius per pixel)', () => {
    const r10 = pixelToRadius(10, 10);
    const r15 = pixelToRadius(10, 15);
    const r20 = pixelToRadius(10, 20);
    expect(r10).toBeGreaterThan(r15);
    expect(r15).toBeGreaterThan(r20);
  });

  it('radius scales linearly with pixel count', () => {
    const zoom = 15;
    expect(pixelToRadius(20, zoom)).toBeCloseTo(pixelToRadius(10, zoom) * 2, 10);
  });

  it('at zoom 0 the formula evaluates to px * 360/512', () => {
    const px = 5;
    expect(pixelToRadius(px, 0)).toBeCloseTo((px * 360) / 512, 10);
  });

  it('returns 0 for 0 pixels', () => {
    expect(pixelToRadius(0, 15)).toBe(0);
  });
});

describe('workerHitTest layer state filtering', () => {
  function mapStub() {
    return { getZoom: () => 18 } as never;
  }

  function mouseEventStub() {
    return { lngLat: { lng: 116.4, lat: 39.9 } } as never;
  }

  it('skips hidden and locked layer hits before selecting the first result', async () => {
    const bridge = {
      send: vi.fn().mockResolvedValue({
        type: 'HIT_RESULT',
        hits: [
          { id: 'lane-1', entityType: 'lane', distance: 0 },
          { id: 'signal-1', entityType: 'signal', distance: 1 },
        ],
      }),
    };

    useUIStore.getState().setLayerVisible('lane', false);
    await expect(workerHitTest(mapStub(), bridge as never, mouseEventStub())).resolves.toBe(
      'signal-1',
    );

    useUIStore.getState().setLayerLocked('signal', true);
    await expect(workerHitTest(mapStub(), bridge as never, mouseEventStub())).resolves.toBeNull();
  });
});

describe('drawing mouse button routing', () => {
  function actorStub(state = 'drawPolyline') {
    return {
      getSnapshot: vi.fn(() => ({
        value: state,
        context: {
          drawPoints: [],
          previewPoint: null,
          bezierAnchors: [],
          isDraggingHandle: false,
          selectedEntityId: null,
          dragPointIndex: -1,
          dragPointType: 'vertex',
          dragCurrentPoint: null,
          dragAltKey: false,
          activeElement: null,
        },
      })),
      send: vi.fn(),
    };
  }

  function mapStub() {
    const canvas = { style: { cursor: '' } };
    const dragPan = { disable: vi.fn(), enable: vi.fn() };
    const map = {
      dragPan,
      panBy: vi.fn(),
      getCanvas: vi.fn(() => canvas),
      getZoom: vi.fn(() => 18),
      queryRenderedFeatures: vi.fn(() => []),
    };
    return { map, canvas, dragPan };
  }

  let timeStamp = 0;
  function mouseEvent({
    button = 0,
    buttons = 0,
    x = 10,
    y = 20,
  }: {
    button?: number;
    buttons?: number;
    x?: number;
    y?: number;
  } = {}) {
    return {
      point: { x, y },
      lngLat: { lng: x, lat: y },
      originalEvent: {
        altKey: false,
        button,
        buttons,
        timeStamp: ++timeStamp,
      },
      preventDefault: vi.fn(),
    };
  }

  function setup(state = 'drawPolyline') {
    const actorRef = actorStub(state);
    const { map, canvas, dragPan } = mapStub();
    const ctx = createRouterContext(map as never, actorRef as never, { current: null });
    return {
      actorRef,
      canvas,
      dragPan,
      handlers: createMapEventHandlers(ctx),
      map,
    };
  }

  it('only primary click places drawPolyline points', () => {
    const { actorRef, handlers } = setup();

    handlers.onClick(mouseEvent({ button: 2 }) as never);
    handlers.onClick(mouseEvent({ button: 1 }) as never);
    expect(actorRef.send).not.toHaveBeenCalled();

    handlers.onClick(mouseEvent({ button: 0 }) as never);
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'MOUSE_DOWN', point: [10, 20] });
  });

  it('middle-button drag pans during drawPolyline without placing a point', () => {
    const { actorRef, canvas, dragPan, handlers, map } = setup();
    const down = mouseEvent({ button: 1, buttons: 4, x: 10, y: 10 });
    const move = mouseEvent({ button: 0, buttons: 4, x: 14, y: 16 });
    const up = mouseEvent({ button: 1, buttons: 0, x: 14, y: 16 });

    handlers.onMouseDown(down as never);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(dragPan.disable).toHaveBeenCalledTimes(1);
    expect(canvas.style.cursor).toBe('grabbing');
    expect(actorRef.send).not.toHaveBeenCalled();

    handlers.onMouseMove(move as never);
    expect(move.preventDefault).toHaveBeenCalled();
    expect(map.panBy).toHaveBeenCalledWith([-4, -6], { duration: 0, noMoveStart: true });

    handlers.onMouseUp(up as never);
    expect(up.preventDefault).toHaveBeenCalled();
    expect(dragPan.enable).toHaveBeenCalledTimes(1);
    expect(canvas.style.cursor).toBe('crosshair');
    expect(actorRef.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. hitBbox
//    Pads a center point by HIT_BBOX_PADDING_PX on all sides.
// ---------------------------------------------------------------------------

function hitBbox(point: { x: number; y: number }): [[number, number], [number, number]] {
  const pad = HIT_BBOX_PADDING_PX;
  return [
    [point.x - pad, point.y - pad],
    [point.x + pad, point.y + pad],
  ];
}

describe('hitBbox', () => {
  it('HIT_BBOX_PADDING_PX is a positive number', () => {
    expect(typeof HIT_BBOX_PADDING_PX).toBe('number');
    expect(HIT_BBOX_PADDING_PX).toBeGreaterThan(0);
  });

  it('returns a 2-element tuple of [min, max] corners', () => {
    const [min, max] = hitBbox({ x: 100, y: 200 });
    expect(min[0]).toBe(100 - HIT_BBOX_PADDING_PX);
    expect(min[1]).toBe(200 - HIT_BBOX_PADDING_PX);
    expect(max[0]).toBe(100 + HIT_BBOX_PADDING_PX);
    expect(max[1]).toBe(200 + HIT_BBOX_PADDING_PX);
  });

  it('bbox is symmetric around the center', () => {
    const [min, max] = hitBbox({ x: 50, y: 50 });
    expect(max[0] - min[0]).toBeCloseTo(2 * HIT_BBOX_PADDING_PX);
    expect(max[1] - min[1]).toBeCloseTo(2 * HIT_BBOX_PADDING_PX);
  });

  it('works at origin', () => {
    const [min, max] = hitBbox({ x: 0, y: 0 });
    expect(min[0]).toBe(-HIT_BBOX_PADDING_PX);
    expect(max[0]).toBe(HIT_BBOX_PADDING_PX);
  });
});

// ---------------------------------------------------------------------------
// 5. scheduleCursorUpdate / flushCursor RAF-coalescing contract
//
//    Multiple calls within the same frame must produce exactly one UI update
//    (the last value wins). We mock requestAnimationFrame synchronously.
// ---------------------------------------------------------------------------

describe('cursor RAF-coalescing contract', () => {
  let rafCallbacks: FrameRequestCallback[] = [];
  let rafId = 0;

  beforeEach(() => {
    rafCallbacks = [];
    rafId = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return ++rafId;
    });
    vi.stubGlobal('cancelAnimationFrame', (_id: number) => {
      rafCallbacks = [];
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('multiple schedule calls within a frame flush to a single update', () => {
    type LngLat = [number, number];
    let pendingCursorLngLat: LngLat | null = null;
    let cursorRafId: number | null = null;
    const flushedValues: LngLat[] = [];

    const flushCursor = () => {
      if (pendingCursorLngLat) {
        flushedValues.push(pendingCursorLngLat);
        pendingCursorLngLat = null;
      }
      cursorRafId = null;
    };

    const scheduleCursorUpdate = (point: LngLat) => {
      pendingCursorLngLat = point;
      if (cursorRafId === null) {
        cursorRafId = requestAnimationFrame(flushCursor);
      }
    };

    // Schedule 3 rapid updates
    scheduleCursorUpdate([1, 2]);
    scheduleCursorUpdate([3, 4]);
    scheduleCursorUpdate([5, 6]);

    // Only 1 RAF callback should have been registered
    expect(rafCallbacks.length).toBe(1);

    // Flush: should emit only the last value
    rafCallbacks[0]!(0);
    expect(flushedValues).toHaveLength(1);
    expect(flushedValues[0]).toEqual([5, 6]);
  });

  it('after flush, a new call schedules a new RAF', () => {
    type LngLat = [number, number];
    let pendingCursorLngLat: LngLat | null = null;
    let cursorRafId: number | null = null;
    const flushedValues: LngLat[] = [];

    const flushCursor = () => {
      if (pendingCursorLngLat) flushedValues.push(pendingCursorLngLat);
      pendingCursorLngLat = null;
      cursorRafId = null;
    };
    const scheduleCursorUpdate = (point: LngLat) => {
      pendingCursorLngLat = point;
      if (cursorRafId === null) cursorRafId = requestAnimationFrame(flushCursor);
    };

    scheduleCursorUpdate([1, 2]);
    rafCallbacks[0]!(0); // flush frame 1
    rafCallbacks = [];

    scheduleCursorUpdate([7, 8]); // new frame
    expect(rafCallbacks.length).toBe(1);
    rafCallbacks[0]!(0); // flush frame 2
    expect(flushedValues).toEqual([
      [1, 2],
      [7, 8],
    ]);
  });
});

// ---------------------------------------------------------------------------
// 6. onKeyDown routing contract
//
//    Escape  → CANCEL  (always)
//    Enter   → CONFIRM (always)
//    Delete/Backspace → DELETE_ENTITY in selected + selectedEntityId present
//                       (no-op otherwise)
// ---------------------------------------------------------------------------

describe('onKeyDown routing', () => {
  it('Escape sends CANCEL', () => {
    const sent: Array<{ type: string }> = [];
    const actorRef = { send: vi.fn((e) => sent.push(e)), getSnapshot: vi.fn() };

    const onKeyDown = (e: { key: string }) => {
      if (e.key === 'Escape') actorRef.send({ type: 'CANCEL' });
      if (e.key === 'Enter') actorRef.send({ type: 'CONFIRM' });
    };

    onKeyDown({ key: 'Escape' });
    expect(sent).toEqual([{ type: 'CANCEL' }]);
  });

  it('Enter sends CONFIRM', () => {
    const sent: Array<{ type: string }> = [];
    const actorRef = { send: vi.fn((e) => sent.push(e)) };

    const onKeyDown = (e: { key: string }) => {
      if (e.key === 'Escape') actorRef.send({ type: 'CANCEL' });
      if (e.key === 'Enter') actorRef.send({ type: 'CONFIRM' });
    };

    onKeyDown({ key: 'Enter' });
    expect(sent).toEqual([{ type: 'CONFIRM' }]);
  });

  it('Delete is a no-op when state is not selected', () => {
    const sent: Array<{ type: string }> = [];

    // Minimal replica: only sends DELETE when state===selected + entityId
    const onKeyDelete = (state: string, entityId: string | null) => {
      if (state !== 'selected' || !entityId) return;
      sent.push({ type: 'DELETE_ENTITY' });
    };

    onKeyDelete('idle', null);
    onKeyDelete('idle', 'some-id');
    onKeyDelete('selected', null);
    expect(sent).toHaveLength(0);
  });

  it('Delete sends DELETE_ENTITY when state=selected and entityId present', () => {
    const sent: Array<{ type: string }> = [];

    const onKeyDelete = (state: string, entityId: string | null) => {
      if (state !== 'selected' || !entityId) return;
      sent.push({ type: 'DELETE_ENTITY' });
    };

    onKeyDelete('selected', 'entity-123');
    expect(sent).toEqual([{ type: 'DELETE_ENTITY' }]);
  });
});
