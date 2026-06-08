import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BezierAnchor } from '@/core/geometry/interpolate';
import { createEntity } from '@/lib/entityOps';
import { useMapStore } from '@/store/mapStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';
import type { LaneEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import { createCursorScheduler } from '../mapEventRouter/cursorScheduler';
import { entityTypeForDrawState } from '../mapEventRouter/drawLayer';
import { handleSelectedMouseDown } from '../mapEventRouter/selectionDrag';
import { hitBbox, pixelToRadius, toLngLat, workerHitTest } from '../mapEventRouter/hitTest';

const initialSettingsSnapshot = useSettingsStore.getState();
const initialUISnapshot = useUIStore.getState();

type TestMouseEvent = {
  point: { x: number; y: number };
  lngLat: { lng: number; lat: number };
  originalEvent: { altKey: boolean; button: number; buttons: number };
  preventDefault: () => void;
};

function mapAtZoom(zoom: number) {
  return { getZoom: vi.fn(() => zoom) };
}

function mouseEvent({
  lng = 116.4,
  lat = 39.9,
  x = 10,
  y = 20,
  altKey = false,
  button = 0,
  buttons = 1,
}: Partial<{
  lng: number;
  lat: number;
  x: number;
  y: number;
  altKey: boolean;
  button: number;
  buttons: number;
}> = {}): TestMouseEvent {
  return {
    point: { x, y },
    lngLat: { lng, lat },
    originalEvent: { altKey, button, buttons },
    preventDefault: vi.fn(),
  };
}

beforeEach(() => {
  useSettingsStore.setState(initialSettingsSnapshot, true);
  useUIStore.setState(initialUISnapshot, true);
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('map event hit-test helpers', () => {
  it('converts mouse events, hit boxes, and screen pixels with current settings', () => {
    useSettingsStore.setState({ hitBboxPadding: 3 });

    expect(toLngLat(mouseEvent({ lng: 1.25, lat: -2.5 }) as never)).toEqual([1.25, -2.5]);
    expect(hitBbox({ x: 20, y: 30 } as never)).toEqual([
      [17, 27],
      [23, 33],
    ]);
    expect(pixelToRadius(mapAtZoom(0) as never, 5)).toBeCloseTo((5 * 360) / 512, 12);
    expect(pixelToRadius(mapAtZoom(10) as never, 8)).toBeCloseTo((8 * 360) / (512 * 2 ** 10), 12);
  });

  it('returns null without a worker bridge', async () => {
    const map = mapAtZoom(18);

    await expect(workerHitTest(map as never, null, mouseEvent() as never)).resolves.toBeNull();

    expect(map.getZoom).not.toHaveBeenCalled();
  });

  it('returns null for worker rejects, empty hits, and non-hit results', async () => {
    useSettingsStore.setState({ hitTestRadius: 12 });
    const rejectingBridge = { send: vi.fn().mockRejectedValue(new Error('worker failed')) };

    await expect(
      workerHitTest(
        mapAtZoom(4) as never,
        rejectingBridge as never,
        mouseEvent({ lng: 1.5, lat: -2.5 }) as never,
      ),
    ).resolves.toBeNull();
    expect(rejectingBridge.send).toHaveBeenCalledWith({
      type: 'HIT_TEST',
      point: [1.5, -2.5],
      radius: (12 * 360) / (512 * 2 ** 4),
    });

    const emptyBridge = {
      send: vi.fn().mockResolvedValue({ type: 'HIT_RESULT', hits: [] }),
    };
    await expect(
      workerHitTest(mapAtZoom(18) as never, emptyBridge as never, mouseEvent() as never),
    ).resolves.toBeNull();

    const wrongTypeBridge = {
      send: vi.fn().mockResolvedValue({
        type: 'UNKNOWN_RESULT',
        hits: [{ id: 'lane-1', entityType: 'lane', distance: 0 }],
      }),
    };
    await expect(
      workerHitTest(mapAtZoom(18) as never, wrongTypeBridge as never, mouseEvent() as never),
    ).resolves.toBeNull();
  });

  it('applies the optional entity-type filter after layer interactivity checks', async () => {
    const bridge = {
      send: vi.fn().mockResolvedValue({
        type: 'HIT_RESULT',
        hits: [
          { id: 'lane-1', entityType: 'lane', distance: 0 },
          { id: 'signal-1', entityType: 'signal', distance: 1 },
          { id: 'polygon-1', entityType: 'polygon', distance: 2 },
        ],
      }),
    };
    const filter = vi.fn((entityType: string) => entityType !== 'lane');

    await expect(
      workerHitTest(mapAtZoom(18) as never, bridge as never, mouseEvent() as never, filter),
    ).resolves.toBe('signal-1');
    expect(filter).toHaveBeenCalledWith('lane');
    expect(filter).toHaveBeenCalledWith('signal');
    expect(filter).not.toHaveBeenCalledWith('polygon');

    await expect(
      workerHitTest(mapAtZoom(18) as never, bridge as never, mouseEvent() as never, () => false),
    ).resolves.toBeNull();
  });
});

describe('createCursorScheduler', () => {
  let callbacks: Map<number, FrameRequestCallback>;
  let nextRafId: number;
  let cancelAnimationFrameMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    callbacks = new Map();
    nextRafId = 0;
    cancelAnimationFrameMock = vi.fn((id: number) => {
      callbacks.delete(id);
    });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = ++nextRafId;
      callbacks.set(id, cb);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);
  });

  function runFrame(id: number, time = 0) {
    const cb = callbacks.get(id)!;
    callbacks.delete(id);
    cb(time);
  }

  it('coalesces scheduled cursor updates so the latest point wins per frame', () => {
    const setCursorLngLat = vi.spyOn(useUIStore.getState(), 'setCursorLngLat');
    const scheduler = createCursorScheduler();

    scheduler.schedule([1, 2]);
    scheduler.schedule([3, 4]);
    scheduler.schedule([5, 6]);

    expect(callbacks.size).toBe(1);
    expect(setCursorLngLat).not.toHaveBeenCalled();

    runFrame(1);

    expect(setCursorLngLat).toHaveBeenCalledTimes(1);
    expect(setCursorLngLat).toHaveBeenCalledWith([5, 6]);
    expect(useUIStore.getState().cursorLngLat).toEqual([5, 6]);

    scheduler.schedule([7, 8]);
    expect(callbacks.size).toBe(1);
    runFrame(2, 16);

    expect(setCursorLngLat).toHaveBeenCalledTimes(2);
    expect(setCursorLngLat).toHaveBeenLastCalledWith([7, 8]);
  });

  it('cancels pending frames and drops pending cursor data on dispose', () => {
    const setCursorLngLat = vi.spyOn(useUIStore.getState(), 'setCursorLngLat');
    const scheduler = createCursorScheduler();

    scheduler.schedule([9, 10]);
    const pendingCallback = callbacks.get(1)!;
    scheduler.dispose();
    pendingCallback(0);

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(1);
    expect(setCursorLngLat).not.toHaveBeenCalled();
    expect(useUIStore.getState().cursorLngLat).toBeNull();
  });
});

describe('entityTypeForDrawState', () => {
  it('uses the active Apollo element before the base draw-state entity type', () => {
    expect(entityTypeForDrawState('drawBezier', null)).toBe('bezier');
    expect(entityTypeForDrawState('drawArc', null)).toBe('arc');
    expect(entityTypeForDrawState('drawBezier', 'lane')).toBe('lane');
    expect(entityTypeForDrawState('drawPolygon', 'junction')).toBe('junction');
    expect(entityTypeForDrawState('unknown', null)).toBeNull();
    expect(entityTypeForDrawState('unknown', 'signal')).toBe('signal');
  });
});

describe('selected Apollo source hot-line drag blocking', () => {
  function selectedActor(entityId: string) {
    return {
      send: vi.fn(),
      getSnapshot: vi.fn(() => ({
        value: 'selected',
        context: { selectedEntityId: entityId },
      })),
    };
  }

  function hotLineMap() {
    const queryRenderedFeatures = vi.fn((_bbox, options?: { layers?: string[] }) => {
      if (options?.layers?.includes('hot-points')) return [];
      if (options?.layers?.includes('hot-fill')) return [];
      if (options?.layers?.includes('hot-line-hit')) {
        return [{ type: 'Feature', properties: {}, geometry: { type: 'LineString' } }];
      }
      return [];
    });
    return {
      queryRenderedFeatures,
      dragPan: { disable: vi.fn() },
      getZoom: () => 18,
    };
  }

  const bezierAnchors: BezierAnchor[] = [
    { point: [0, 0], handleIn: null, handleOut: [0.5, 0] },
    { point: [1, 0], handleIn: [0.5, 0], handleOut: null },
  ];

  function apolloSourceLane(drawTool: 'drawBezier' | 'drawArc'): LaneEntity {
    if (drawTool === 'drawBezier') {
      return createEntity('lane', drawTool, [], bezierAnchors) as LaneEntity;
    }
    return createEntity(
      'lane',
      drawTool,
      [
        [0, 0],
        [0.5, 0.5],
        [1, 0],
      ],
      [],
    ) as LaneEntity;
  }

  it.each(['drawBezier', 'drawArc'] as const)(
    'does not start center dragging from a selected Apollo %s hot-line hit',
    (drawTool) => {
      const entity = apolloSourceLane(drawTool);
      useMapStore.setState({ entities: new Map<string, MapEntity>([[entity.id, entity]]) });
      const actor = selectedActor(entity.id);
      const map = hotLineMap();
      const event = mouseEvent({ lng: 0.5, lat: 0 });

      const result = handleSelectedMouseDown(map as never, actor as never, event as never);

      expect(result).toEqual({ handled: false });
      expect(map.queryRenderedFeatures).not.toHaveBeenCalledWith(expect.anything(), {
        layers: ['hot-line-hit', 'hot-line'],
      });
      expect(map.dragPan.disable).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(actor.send).not.toHaveBeenCalled();
    },
  );
});
