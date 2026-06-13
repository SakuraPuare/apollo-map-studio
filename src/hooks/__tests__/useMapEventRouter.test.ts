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
import { installMapEventRouter, isDuplicateInput } from '../useMapEventRouter';
import { isDrawingState } from '@/core/fsm/editorMachine';
import { HIT_BBOX_PADDING_PX } from '@/config/mapConstants';
import { useUIStore } from '@/store/uiStore';
import { useMapStore } from '@/store/mapStore';
import { workerHitTest } from '../mapEventRouter/hitTest';
import { createMapEventHandlers, createRouterContext } from '../mapEventRouter/eventHandlers';
import { handleMapKeyDown } from '../mapEventRouter/keyboard';
import { createEntity, getEditPoints } from '@/lib/entityOps';
import type { LaneEntity } from '@/types/apollo';
import type { PolylineEntity } from '@/types/entities';

type RenderedFeatureStub = { properties?: Record<string, unknown> };

const initialUISnapshot = useUIStore.getState();

beforeEach(() => {
  useUIStore.setState(initialUISnapshot, true);
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
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

describe('installMapEventRouter lifecycle', () => {
  function actorStub() {
    return {
      getSnapshot: vi.fn(() => ({
        value: 'idle',
        context: {
          selectedEntityId: null,
          activeElement: null,
          drawPoints: [],
          bezierAnchors: [],
          dragPointType: 'vertex',
          dragPointIndex: -1,
          dragAltKey: false,
        },
      })),
      send: vi.fn(),
    };
  }

  function mapStub() {
    return {
      on: vi.fn(),
      off: vi.fn(),
      getZoom: vi.fn(() => 17.25),
      getCanvas: vi.fn(() => ({ style: { cursor: '' } })),
      dragPan: { disable: vi.fn(), enable: vi.fn() },
      queryRenderedFeatures: vi.fn(() => []),
    };
  }

  function stubWindowListeners() {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal('window', { addEventListener, removeEventListener });
    return { addEventListener, removeEventListener };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers map and keyboard handlers and cleans up the same handlers', () => {
    const map = mapStub();
    const actor = actorStub();
    const bridgeRef = { current: null };
    const win = stubWindowListeners();

    const dispose = installMapEventRouter(map as never, actor as never, bridgeRef, 'drawing');

    expect(dispose).toEqual(expect.any(Function));
    expect(useUIStore.getState().currentZoom).toBe(17.25);
    expect(map.on).toHaveBeenCalledTimes(6);
    expect(map.on).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(map.on).toHaveBeenCalledWith('click', expect.any(Function));
    expect(map.on).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(map.on).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(map.on).toHaveBeenCalledWith('dblclick', expect.any(Function));
    expect(map.on).toHaveBeenCalledWith('zoomend', expect.any(Function));
    expect(win.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));

    dispose!();

    expect(map.off).toHaveBeenCalledTimes(6);
    for (const [eventName, handler] of map.on.mock.calls) {
      expect(map.off).toHaveBeenCalledWith(eventName, handler);
    }
    expect(win.removeEventListener).toHaveBeenCalledWith(
      'keydown',
      win.addEventListener.mock.calls[0]![1],
    );
  });

  it('does not install listeners in scene mode', () => {
    const map = mapStub();
    const win = stubWindowListeners();

    const dispose = installMapEventRouter(
      map as never,
      actorStub() as never,
      { current: null },
      'scene',
    );

    expect(dispose).toBeUndefined();
    expect(map.on).not.toHaveBeenCalled();
    expect(win.addEventListener).not.toHaveBeenCalled();
  });

  it('clears stale snap target when snapping is disabled while installed', () => {
    const map = mapStub();
    stubWindowListeners();
    useUIStore.getState().setSnapTarget({ kind: 'vertex', point: [1, 2] } as never);
    useUIStore.getState().setSnapEnabled(true);

    const dispose = installMapEventRouter(
      map as never,
      actorStub() as never,
      { current: null },
      'drawing',
    );
    useUIStore.getState().setSnapEnabled(false);

    expect(useUIStore.getState().currentSnapTarget).toBeNull();
    dispose!();
  });
});

describe('drawing mouse button routing', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  type ActorContext = {
    drawPoints: unknown[];
    previewPoint: unknown | null;
    bezierAnchors: unknown[];
    isDraggingHandle: boolean;
    selectedEntityId: string | null;
    dragPointIndex: number;
    dragPointType: 'vertex' | 'center' | 'handleIn' | 'handleOut' | 'rotate';
    dragCurrentPoint: unknown | null;
    dragAltKey: boolean;
    activeElement: null;
  };

  function actorStub(state = 'drawPolyline', context: Partial<ActorContext> = {}) {
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
          ...context,
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
      queryRenderedFeatures: vi.fn((): RenderedFeatureStub[] => []),
    };
    return { map, canvas, dragPan };
  }

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
            length: 111,
          },
        ],
      },
      leftBoundary: { curve: { segments: [] }, length: 111, boundaryType: [] },
      rightBoundary: { curve: { segments: [] }, length: 111, boundaryType: [] },
      length: 111,
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
      leftSamples: [{ s: 0, width: 0 }],
      rightSamples: [{ s: 0, width: 0 }],
      leftRoadSamples: [],
      rightRoadSamples: [],
    };
  }

  function polyline(): PolylineEntity {
    return {
      id: 'line-1',
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    };
  }

  let timeStamp = 0;
  function mouseEvent({
    button = 0,
    buttons = 0,
    x = 10,
    y = 20,
    altKey = false,
  }: {
    button?: number;
    buttons?: number;
    x?: number;
    y?: number;
    altKey?: boolean;
  } = {}) {
    return {
      point: { x, y },
      lngLat: { lng: x, lat: y },
      originalEvent: {
        altKey,
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

  function setupWithContext(
    state: string,
    context: Partial<ActorContext> = {},
    bridge: unknown = null,
  ) {
    const actorRef = actorStub(state, context);
    const { map, canvas, dragPan } = mapStub();
    const ctx = createRouterContext(map as never, actorRef as never, { current: bridge as never });
    return {
      actorRef,
      canvas,
      dragPan,
      handlers: createMapEventHandlers(ctx),
      map,
    };
  }

  async function flushAsync() {
    await Promise.resolve();
    await Promise.resolve();
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

  it('restores middle-pan cursor and dragPan for boundary brush, editing, and selected line states', () => {
    const boundary = setupWithContext('drawPolyline');
    const boundaryDown = mouseEvent({ button: 1, buttons: 4, x: 1, y: 1 });
    boundary.handlers.onMouseDown(boundaryDown as never);
    useUIStore.getState().setBoundaryBrushType('DOUBLE_YELLOW');
    boundary.handlers.onMouseUp(mouseEvent({ button: 1, x: 1, y: 1 }) as never);
    expect(boundary.canvas.style.cursor).toBe('crosshair');
    useUIStore.getState().exitBoundaryBrush();

    const editing = setupWithContext('drawPolyline');
    editing.handlers.onMouseDown(mouseEvent({ button: 1, buttons: 4, x: 1, y: 1 }) as never);
    editing.actorRef.getSnapshot.mockReturnValue({
      value: 'editingPoint',
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
    });
    editing.handlers.onMouseUp(mouseEvent({ button: 1, x: 1, y: 1 }) as never);
    expect(editing.canvas.style.cursor).toBe('grabbing');

    const line = polyline();
    useMapStore.setState({ entities: new Map([[line.id, line]]) });
    const selected = setupWithContext('drawPolyline');
    selected.handlers.onMouseDown(mouseEvent({ button: 1, buttons: 4, x: 1, y: 1 }) as never);
    selected.actorRef.getSnapshot.mockReturnValue({
      value: 'selected',
      context: {
        drawPoints: [],
        previewPoint: null,
        bezierAnchors: [],
        isDraggingHandle: false,
        selectedEntityId: line.id,
        dragPointIndex: -1,
        dragPointType: 'center',
        dragCurrentPoint: null,
        dragAltKey: false,
        activeElement: null,
      },
    });
    selected.handlers.onMouseUp(mouseEvent({ button: 1, x: 1, y: 1 }) as never);
    expect(selected.dragPan.disable).toHaveBeenCalled();
    expect(selected.canvas.style.cursor).toBe('');
  });

  it('ends middle pan from mousemove when the middle button is no longer pressed', () => {
    const { dragPan, handlers } = setup();

    handlers.onMouseDown(mouseEvent({ button: 1, buttons: 4, x: 1, y: 1 }) as never);
    const move = mouseEvent({ buttons: 0, x: 2, y: 2 });
    handlers.onMouseMove(move as never);

    expect(move.preventDefault).toHaveBeenCalled();
    expect(dragPan.enable).toHaveBeenCalled();
  });

  it('routes selected and idle clicks through worker hit testing', async () => {
    const selectedBridge = {
      send: vi.fn().mockResolvedValue({
        type: 'HIT_RESULT',
        hits: [{ id: 'lane-1', entityType: 'lane', distance: 0 }],
      }),
    };
    const selected = setupWithContext('selected', { selectedEntityId: 'lane-old' }, selectedBridge);

    selected.handlers.onClick(mouseEvent({ button: 0, x: 8, y: 9 }) as never);
    await flushAsync();

    expect(selectedBridge.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'HIT_TEST', point: [8, 9] }),
    );
    expect(selected.actorRef.send).toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: 'lane-1' });

    const idleBridge = {
      send: vi.fn().mockResolvedValue({
        type: 'HIT_RESULT',
        hits: [{ id: 'signal-1', entityType: 'signal', distance: 0 }],
      }),
    };
    const idle = setupWithContext('idle', {}, idleBridge);

    idle.handlers.onClick(mouseEvent({ button: 0, x: 4, y: 5 }) as never);
    await flushAsync();

    expect(idle.actorRef.send).toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: 'signal-1' });
  });

  it('ignores async hit-test results after selected or idle state changes', async () => {
    const selectedBridge = {
      send: vi.fn().mockResolvedValue({
        type: 'HIT_RESULT',
        hits: [{ id: 'lane-1', entityType: 'lane', distance: 0 }],
      }),
    };
    const selected = setupWithContext('selected', { selectedEntityId: 'lane-old' }, selectedBridge);
    selected.actorRef.getSnapshot
      .mockReturnValueOnce({
        value: 'selected',
        context: {
          drawPoints: [],
          previewPoint: null,
          bezierAnchors: [],
          isDraggingHandle: false,
          selectedEntityId: 'lane-old',
          dragPointIndex: -1,
          dragPointType: 'center',
          dragCurrentPoint: null,
          dragAltKey: false,
          activeElement: null,
        },
      })
      .mockReturnValue({
        value: 'idle',
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
      });

    selected.handlers.onClick(mouseEvent({ button: 0 }) as never);
    await flushAsync();
    expect(selected.actorRef.send).not.toHaveBeenCalledWith({
      type: 'SELECT_ENTITY',
      id: 'lane-1',
    });

    const idleBridge = {
      send: vi.fn().mockResolvedValue({
        type: 'HIT_RESULT',
        hits: [{ id: 'signal-1', entityType: 'signal', distance: 0 }],
      }),
    };
    const idle = setupWithContext('idle', {}, idleBridge);
    idle.actorRef.getSnapshot
      .mockReturnValueOnce({
        value: 'idle',
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
      })
      .mockReturnValue({
        value: 'selected',
        context: {
          drawPoints: [],
          previewPoint: null,
          bezierAnchors: [],
          isDraggingHandle: false,
          selectedEntityId: 'other',
          dragPointIndex: -1,
          dragPointType: 'center',
          dragCurrentPoint: null,
          dragAltKey: false,
          activeElement: null,
        },
      });

    idle.handlers.onClick(mouseEvent({ button: 0 }) as never);
    await flushAsync();
    expect(idle.actorRef.send).not.toHaveBeenCalledWith({
      type: 'SELECT_ENTITY',
      id: 'signal-1',
    });
  });

  it('does not hit test or select entities from non-primary idle clicks', async () => {
    const bridge = {
      send: vi.fn().mockResolvedValue({
        type: 'HIT_RESULT',
        hits: [{ id: 'signal-1', entityType: 'signal', distance: 0 }],
      }),
    };
    const idle = setupWithContext('idle', {}, bridge);

    idle.handlers.onClick(mouseEvent({ button: 2, x: 4, y: 5 }) as never);
    await flushAsync();

    expect(bridge.send).not.toHaveBeenCalled();
    expect(idle.actorRef.send).not.toHaveBeenCalled();
  });

  it('deselects selected entities on worker miss and ignores hot-point clicks', async () => {
    const missBridge = {
      send: vi.fn().mockResolvedValue({ type: 'HIT_RESULT', hits: [] }),
    };
    const selected = setupWithContext('selected', { selectedEntityId: 'lane-old' }, missBridge);

    selected.handlers.onClick(mouseEvent({ button: 0 }) as never);
    await flushAsync();

    expect(selected.actorRef.send).toHaveBeenCalledWith({ type: 'DESELECT' });

    const hotPointBridge = {
      send: vi.fn().mockResolvedValue({ type: 'HIT_RESULT', hits: [] }),
    };
    const hotPoint = setupWithContext('selected', { selectedEntityId: 'lane-old' }, hotPointBridge);
    hotPoint.map.queryRenderedFeatures.mockReturnValue([{ properties: { index: 0 } }]);

    hotPoint.handlers.onClick(mouseEvent({ button: 0 }) as never);
    await flushAsync();

    expect(hotPointBridge.send).not.toHaveBeenCalled();
    expect(hotPoint.actorRef.send).not.toHaveBeenCalled();
  });

  it('ignores click selection when the pointer moved past the click threshold', async () => {
    const bridge = {
      send: vi.fn().mockResolvedValue({
        type: 'HIT_RESULT',
        hits: [{ id: 'lane-1', entityType: 'lane', distance: 0 }],
      }),
    };
    const { actorRef, handlers } = setupWithContext('idle', {}, bridge);

    handlers.onMouseDown(mouseEvent({ button: 0, x: 0, y: 0 }) as never);
    handlers.onClick(mouseEvent({ button: 0, x: 200, y: 200 }) as never);
    await flushAsync();

    expect(bridge.send).not.toHaveBeenCalled();
    expect(actorRef.send).not.toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: 'lane-1' });
  });

  it('double click sends DOUBLE_CLICK for drawable layers and respects locked layers', () => {
    const drawable = setupWithContext('drawPolygon');
    const event = mouseEvent({ button: 0, x: 3, y: 4 });

    drawable.handlers.onDblClick(event as never);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(drawable.actorRef.send).toHaveBeenCalledWith({
      type: 'DOUBLE_CLICK',
      point: [3, 4],
    });

    const nonPrimary = setupWithContext('drawPolygon');
    nonPrimary.handlers.onDblClick(mouseEvent({ button: 2 }) as never);
    expect(nonPrimary.actorRef.send).not.toHaveBeenCalled();

    useUIStore.getState().setLayerLocked('polygon', true);
    const locked = setupWithContext('drawPolygon');
    locked.handlers.onDblClick(mouseEvent({ button: 0 }) as never);
    expect(locked.actorRef.send).not.toHaveBeenCalled();
  });

  it('deduplicates rapid draw clicks and routes drawBezier mousedown', () => {
    const draw = setupWithContext('drawPolygon');
    draw.handlers.onClick(mouseEvent({ button: 0, x: 4, y: 5 }) as never);
    draw.handlers.onClick(mouseEvent({ button: 0, x: 4, y: 5 }) as never);

    expect(draw.actorRef.send).toHaveBeenCalledTimes(1);
    expect(draw.actorRef.send).toHaveBeenCalledWith({ type: 'MOUSE_DOWN', point: [4, 5] });

    const bezier = setupWithContext('drawBezier');
    bezier.handlers.onMouseDown(mouseEvent({ button: 0, x: 8, y: 9 }) as never);
    expect(bezier.actorRef.send).toHaveBeenCalledWith({ type: 'MOUSE_DOWN', point: [8, 9] });
  });

  it('ignores editing-point clicks and mousedowns', () => {
    const { actorRef, handlers } = setupWithContext('editingPoint');

    handlers.onMouseDown(mouseEvent({ button: 0, x: 1, y: 2 }) as never);
    handlers.onClick(mouseEvent({ button: 0, x: 1, y: 2 }) as never);

    expect(actorRef.send).not.toHaveBeenCalled();
  });

  it('commits editing drags to the map store on mouse up', () => {
    const entity = polyline();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    const { actorRef, dragPan, handlers } = setupWithContext('editingPoint', {
      selectedEntityId: entity.id,
      dragPointIndex: 1,
      dragPointType: 'vertex',
    });

    handlers.onMouseUp(mouseEvent({ button: 0, x: 9, y: 10 }) as never);

    expect((useMapStore.getState().entities.get(entity.id) as PolylineEntity).points[1]).toEqual({
      x: 9,
      y: 10,
    });
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'DRAG_END', point: [9, 10] });
    expect(dragPan.disable).toHaveBeenCalled();
  });

  it('moves editing points on mouse move, clears snap target, and skips locked entity commits', () => {
    const entity = polyline();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    useUIStore.getState().setSnapTarget({
      kind: 'vertex',
      entityId: 'other',
      entityType: 'polyline',
      point: { x: 0, y: 0 },
    });
    const { actorRef, handlers } = setupWithContext('editingPoint', {
      selectedEntityId: entity.id,
      dragPointIndex: 2,
      dragPointType: 'vertex',
    });

    handlers.onMouseMove(mouseEvent({ button: 0, x: 7, y: 8 }) as never);
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'DRAG_MOVE', point: [7, 8] });

    useUIStore.getState().setLayerLocked('polyline', true);
    handlers.onMouseUp(mouseEvent({ button: 0, x: 9, y: 10 }) as never);

    expect((useMapStore.getState().entities.get(entity.id) as PolylineEntity).points[2]).toEqual({
      x: 2,
      y: 2,
    });
    expect(useUIStore.getState().currentSnapTarget).toBeNull();
  });

  it('updates selected-state cursor and dragPan on mousemove', () => {
    const entity = polyline();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    useUIStore.getState().setSnapTarget({
      kind: 'edge',
      entityId: 'other',
      entityType: 'polyline',
      point: { x: 0, y: 0 },
    });
    const { canvas, dragPan, handlers, map } = setupWithContext('selected', {
      selectedEntityId: entity.id,
    });

    handlers.onMouseMove(mouseEvent({ button: 0, x: 1, y: 1 }) as never);

    expect(dragPan.disable).toHaveBeenCalled();
    expect(canvas.style.cursor).toBe('grab');
    expect(useUIStore.getState().currentSnapTarget).toBeNull();

    useUIStore.getState().setLayerLocked('polyline', true);
    map.queryRenderedFeatures.mockReturnValue([{ properties: { index: 0 } }]);
    handlers.onMouseMove(mouseEvent({ button: 0, x: 2, y: 2 }) as never);

    expect(dragPan.enable).toHaveBeenCalled();
    expect(canvas.style.cursor).toBe('grab');
  });

  it('clears snap target while idle and while drawing into a locked layer', () => {
    useUIStore.getState().setSnapTarget({
      kind: 'vertex',
      entityId: 'other',
      entityType: 'polyline',
      point: { x: 0, y: 0 },
    });
    const idle = setupWithContext('idle');
    idle.handlers.onMouseMove(mouseEvent({ button: 0 }) as never);
    expect(useUIStore.getState().currentSnapTarget).toBeNull();

    useUIStore.getState().setSnapTarget({
      kind: 'vertex',
      entityId: 'other',
      entityType: 'polygon',
      point: { x: 0, y: 0 },
    });
    useUIStore.getState().setLayerVisible('polygon', false);
    const draw = setupWithContext('drawPolygon');
    draw.handlers.onMouseMove(mouseEvent({ button: 0, x: 5, y: 6 }) as never);
    draw.handlers.onClick(mouseEvent({ button: 0, x: 5, y: 6 }) as never);

    expect(useUIStore.getState().currentSnapTarget).toBeNull();
    expect(draw.actorRef.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MOUSE_MOVE' }),
    );
    expect(draw.actorRef.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MOUSE_DOWN' }),
    );
  });

  it('sends drawing mouseup for primary buttons and ignores non-primary drawing mouseup', () => {
    const draw = setupWithContext('drawPolygon');
    draw.handlers.onMouseUp(mouseEvent({ button: 2, x: 1, y: 2 }) as never);
    expect(draw.actorRef.send).not.toHaveBeenCalled();

    draw.handlers.onMouseUp(mouseEvent({ button: 0, x: 3, y: 4 }) as never);
    expect(draw.actorRef.send).toHaveBeenCalledWith({ type: 'MOUSE_UP', point: [3, 4] });

    const selected = setupWithContext('selected');
    selected.handlers.onMouseUp(mouseEvent({ button: 2, x: 5, y: 6 }) as never);
    expect(selected.actorRef.send).toHaveBeenCalledWith({ type: 'MOUSE_UP', point: [5, 6] });
  });

  it('shows boundary-brush cursor on hover and ignores non-primary brush mousedown', () => {
    useUIStore.getState().setSnapTarget({
      kind: 'vertex',
      entityId: 'other',
      entityType: 'lane',
      point: { x: 0, y: 0 },
    });
    useUIStore.getState().setBoundaryBrushType('CURB');
    const { actorRef, canvas, dragPan, handlers } = setupWithContext('idle');

    handlers.onMouseMove(mouseEvent({ x: 10, y: 10 }) as never);
    expect(canvas.style.cursor).toBe('crosshair');
    expect(useUIStore.getState().currentSnapTarget).toBeNull();

    handlers.onMouseDown(mouseEvent({ button: 2, x: 10, y: 10 }) as never);
    expect(dragPan.disable).not.toHaveBeenCalled();
    expect(actorRef.send).not.toHaveBeenCalled();
  });

  it('paints lane boundaries with the boundary brush and keeps drag pan disabled', () => {
    const lane = laneAt('lane-1', [0, 0], [0.001, 0]);
    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });
    useUIStore.getState().setBoundaryBrushType('CURB');
    const { actorRef, canvas, dragPan, handlers } = setupWithContext('idle');

    handlers.onMouseDown(mouseEvent({ button: 0, x: 0, y: 0 }) as never);
    handlers.onMouseUp(mouseEvent({ button: 0, x: 0, y: 0 }) as never);

    const updated = useMapStore.getState().entities.get(lane.id) as LaneEntity;
    expect(updated.leftBoundary.boundaryType).toEqual([{ s: 0, types: ['CURB'] }]);
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: lane.id });
    expect(dragPan.disable).toHaveBeenCalled();
    expect(canvas.style.cursor).toBe('crosshair');
  });

  it('handles boundary-brush misses and duplicate hits without repeat updates', () => {
    const lane = laneAt('lane-1', [0, 0], [0.001, 0]);
    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });
    useUIStore.getState().setBoundaryBrushType('CURB');
    const { actorRef, handlers } = setupWithContext('idle');

    handlers.onMouseDown(mouseEvent({ button: 0, x: 10, y: 10 }) as never);
    expect(useMapStore.getState().entities.get(lane.id)).toBe(lane);
    expect(actorRef.send).not.toHaveBeenCalled();

    handlers.onMouseMove(mouseEvent({ button: 0, x: 0, y: 0 }) as never);
    const once = useMapStore.getState().entities.get(lane.id) as LaneEntity;
    handlers.onMouseMove(mouseEvent({ button: 0, x: 0, y: 0 }) as never);
    expect(useMapStore.getState().entities.get(lane.id)).toBe(once);
    expect(actorRef.send).toHaveBeenCalledTimes(1);
  });

  it('restores drag pan when boundary brush is released after being disabled', () => {
    const lane = laneAt('lane-1', [0, 0], [0.001, 0]);
    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });
    useUIStore.getState().setBoundaryBrushType('CURB');
    const { dragPan, handlers } = setupWithContext('idle');

    handlers.onMouseDown(mouseEvent({ button: 0, x: 0, y: 0 }) as never);
    useUIStore.getState().exitBoundaryBrush();
    handlers.onMouseUp(mouseEvent({ button: 0, x: 0, y: 0 }) as never);

    expect(dragPan.enable).toHaveBeenCalled();
  });

  it('routes keydown through keyboard handlers and clears center grab state', () => {
    const { actorRef, handlers } = setupWithContext('selected', {
      selectedEntityId: 'line-1',
      dragPointIndex: -1,
      dragPointType: 'center',
    });
    useUIStore.getState().toggleConnectMode();

    handlers.onKeyDown({ key: 'Escape' } as KeyboardEvent);

    expect(useUIStore.getState().connectMode).toEqual({ active: false, firstLaneId: null });
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'CANCEL' });
  });

  it('stores the latest map zoom on zoomend', () => {
    const { handlers, map } = setupWithContext('idle');
    map.getZoom.mockReturnValue(12.5);

    handlers.onZoomEnd();

    expect(useUIStore.getState().currentZoom).toBe(12.5);
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
  function actorRef({
    state = 'selected',
    selectedEntityId = null,
    dragPointIndex = -1,
    dragPointType = 'center',
  }: {
    state?: string;
    selectedEntityId?: string | null;
    dragPointIndex?: number;
    dragPointType?: 'vertex' | 'center' | 'handleIn' | 'handleOut' | 'rotate';
  } = {}) {
    return {
      getSnapshot: vi.fn(() => ({
        value: state,
        context: { selectedEntityId, dragPointIndex, dragPointType },
      })),
      send: vi.fn(),
    };
  }

  function keydown(key: string): KeyboardEvent {
    return { key, target: null } as KeyboardEvent;
  }

  it('Escape sends CANCEL, clears center-drag state, and exits connect mode', () => {
    const actor = actorRef({ selectedEntityId: 'line-1' });
    const clearCenterGrabOffset = vi.fn();
    useUIStore.getState().toggleConnectMode();

    handleMapKeyDown(actor as never, keydown('Escape'), clearCenterGrabOffset);

    expect(clearCenterGrabOffset).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().connectMode).toEqual({ active: false, firstLaneId: null });
    expect(actor.send).toHaveBeenCalledWith({ type: 'CANCEL' });
  });

  it('Enter sends CONFIRM', () => {
    const actor = actorRef();

    handleMapKeyDown(actor as never, keydown('Enter'), vi.fn());

    expect(actor.send).toHaveBeenCalledWith({ type: 'CONFIRM' });
  });

  it('Delete removes a selected drawing entity from the map store', () => {
    const entity: PolylineEntity = {
      id: 'line-delete',
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    };
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    const actor = actorRef({ selectedEntityId: entity.id });

    handleMapKeyDown(actor as never, keydown('Delete'), vi.fn());

    expect(useMapStore.getState().entities.has(entity.id)).toBe(false);
    expect(actor.send).toHaveBeenCalledWith({ type: 'DELETE_ENTITY' });
  });

  it('Backspace deletes the active drawing vertex and keeps the entity selected', () => {
    const entity: PolylineEntity = {
      id: 'line-vertex-delete',
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 0 },
      ],
    };
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    const actor = actorRef({
      selectedEntityId: entity.id,
      dragPointIndex: 1,
      dragPointType: 'vertex',
    });

    handleMapKeyDown(actor as never, keydown('Backspace'), vi.fn());

    expect((useMapStore.getState().entities.get(entity.id) as PolylineEntity).points).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(actor.send).toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: entity.id });
    expect(actor.send).not.toHaveBeenCalledWith({ type: 'DELETE_ENTITY' });
  });

  it('Delete deletes the active Apollo vertex and removes Apollo entities at minimum vertex count', () => {
    const lane = createEntity(
      'lane',
      'drawPolyline',
      [
        [0, 0],
        [1, 1],
        [2, 0],
      ],
      [],
    ) as LaneEntity;
    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });
    const vertexActor = actorRef({
      selectedEntityId: lane.id,
      dragPointIndex: 1,
      dragPointType: 'vertex',
    });

    handleMapKeyDown(vertexActor as never, keydown('Delete'), vi.fn());

    const trimmed = useMapStore.getState().entities.get(lane.id) as LaneEntity;
    expect(getEditPoints(trimmed)).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(vertexActor.send).toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: lane.id });

    const entityActor = actorRef({
      selectedEntityId: lane.id,
      dragPointIndex: 0,
      dragPointType: 'vertex',
    });
    handleMapKeyDown(entityActor as never, keydown('Delete'), vi.fn());

    expect(useMapStore.getState().entities.has(lane.id)).toBe(false);
    expect(entityActor.send).toHaveBeenCalledWith({ type: 'DELETE_ENTITY' });
  });

  it('Delete is a no-op when no selected entity can be deleted', () => {
    const idle = actorRef({ state: 'idle', selectedEntityId: 'line-1' });
    const missing = actorRef({ state: 'selected', selectedEntityId: 'missing' });

    handleMapKeyDown(idle as never, keydown('Delete'), vi.fn());
    handleMapKeyDown(missing as never, keydown('Delete'), vi.fn());

    expect(idle.send).not.toHaveBeenCalled();
    expect(missing.send).not.toHaveBeenCalled();
  });
});
