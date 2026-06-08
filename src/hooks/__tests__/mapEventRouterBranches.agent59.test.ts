import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMapStore } from '@/store/mapStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';
import type { LaneEntity } from '@/types/apollo';
import type { MapEntity, PolylineEntity } from '@/types/entities';
import { handleConnectModeClick } from '../mapEventRouter/connectMode';
import { createMapEventHandlers, createRouterContext } from '../mapEventRouter/eventHandlers';

type ActorContext = {
  selectedEntityId: string | null;
  activeElement: string | null;
  drawPoints: unknown[];
  previewPoint: unknown | null;
  bezierAnchors: unknown[];
  isDraggingHandle: boolean;
  dragPointIndex: number;
  dragPointType: 'vertex' | 'center' | 'handleIn' | 'handleOut' | 'rotate';
  dragCurrentPoint: unknown | null;
  dragAltKey: boolean;
};

const initialSettingsSnapshot = useSettingsStore.getState();
const initialUISnapshot = useUIStore.getState();

function actorStub(state = 'idle', context: Partial<ActorContext> = {}) {
  return {
    getSnapshot: vi.fn(() => ({
      value: state,
      context: {
        selectedEntityId: null,
        activeElement: null,
        drawPoints: [],
        previewPoint: null,
        bezierAnchors: [],
        isDraggingHandle: false,
        dragPointIndex: -1,
        dragPointType: 'vertex',
        dragCurrentPoint: null,
        dragAltKey: false,
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
    queryRenderedFeatures: vi.fn(() => []),
  };
  return { canvas, dragPan, map };
}

let timeStamp = 0;
function mouseEvent({
  button = 0,
  buttons = 1,
  x = 0,
  y = 0,
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
    originalEvent: { altKey, button, buttons, timeStamp: ++timeStamp },
    preventDefault: vi.fn(),
  };
}

function setupHandlers(
  state = 'idle',
  context: Partial<ActorContext> = {},
  bridge: unknown = null,
) {
  const actorRef = actorStub(state, context);
  const { canvas, dragPan, map } = mapStub();
  const ctx = createRouterContext(map as never, actorRef as never, { current: bridge as never });
  return { actorRef, canvas, dragPan, handlers: createMapEventHandlers(ctx), map };
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

function polyline(id = 'line-1'): PolylineEntity {
  return {
    id,
    entityType: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ],
  };
}

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  useSettingsStore.setState(initialSettingsSnapshot, true);
  useUIStore.setState(initialUISnapshot, true);
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  timeStamp = 0;
  vi.restoreAllMocks();
});

describe('eventHandlers branch routing', () => {
  it('does not start selected drags from middle-button mousedown', () => {
    const entity = polyline();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    const { actorRef, dragPan, handlers, map } = setupHandlers('selected', {
      selectedEntityId: entity.id,
    });
    map.queryRenderedFeatures.mockReturnValue([{ properties: { index: 1 } }] as never);
    const event = mouseEvent({ button: 1, buttons: 4, x: 1, y: 1 });

    handlers.onMouseDown(event as never);

    expect(map.queryRenderedFeatures).not.toHaveBeenCalled();
    expect(dragPan.disable).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(actorRef.send).not.toHaveBeenCalled();
  });

  it('allows click selection at the threshold and suppresses clicks above it', async () => {
    useSettingsStore.getState().setClickThreshold(5);

    const insideBridge = {
      send: vi.fn().mockResolvedValue({
        type: 'HIT_RESULT',
        hits: [{ id: 'lane-1', entityType: 'lane', distance: 0 }],
      }),
    };
    const inside = setupHandlers('idle', {}, insideBridge);
    inside.handlers.onMouseDown(mouseEvent({ button: 0, x: 0, y: 0 }) as never);
    inside.handlers.onClick(mouseEvent({ button: 0, x: 3, y: 4 }) as never);
    await flushAsync();

    expect(insideBridge.send).toHaveBeenCalledTimes(1);
    expect(inside.actorRef.send).toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: 'lane-1' });

    const outsideBridge = {
      send: vi.fn().mockResolvedValue({
        type: 'HIT_RESULT',
        hits: [{ id: 'lane-2', entityType: 'lane', distance: 0 }],
      }),
    };
    const outside = setupHandlers('idle', {}, outsideBridge);
    outside.handlers.onMouseDown(mouseEvent({ button: 0, x: 0, y: 0 }) as never);
    outside.handlers.onClick(mouseEvent({ button: 0, x: 6, y: 0 }) as never);
    await flushAsync();

    expect(outsideBridge.send).not.toHaveBeenCalled();
    expect(outside.actorRef.send).not.toHaveBeenCalledWith({
      type: 'SELECT_ENTITY',
      id: 'lane-2',
    });
  });

  it.each([
    ['locked', () => useUIStore.getState().setLayerLocked('lane', true)],
    ['hidden', () => useUIStore.getState().setLayerVisible('lane', false)],
  ])('does not paint %s lane boundaries with the boundary brush', (_label, setLayerState) => {
    const lane = laneAt('lane-1', [0, 0], [0.001, 0]);
    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });
    useUIStore.getState().setBoundaryBrushType('CURB');
    setLayerState();
    const { actorRef, dragPan, handlers } = setupHandlers('idle');

    handlers.onMouseDown(mouseEvent({ button: 0, x: 0, y: 0 }) as never);

    expect(useMapStore.getState().entities.get(lane.id)).toBe(lane);
    expect(dragPan.disable).toHaveBeenCalledTimes(1);
    expect(actorRef.send).not.toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: lane.id });
  });
});

describe('handleConnectModeClick branch guards', () => {
  it('ignores delayed hit-test results after connect mode is turned off', async () => {
    const lane = laneAt('lane-1', [0, 0], [0.001, 0]);
    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });
    useUIStore.setState({ connectMode: { active: true, firstLaneId: null } });
    const actorRef = actorStub();
    let resolveHit!: (hitId: string | null) => void;
    const hitTest = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          resolveHit = resolve;
        }),
    );

    expect(handleConnectModeClick(actorRef as never, hitTest, mouseEvent() as never)).toBe(true);
    useUIStore.getState().exitConnectMode();
    resolveHit(lane.id);
    await flushAsync();

    expect(useUIStore.getState().connectMode).toEqual({ active: false, firstLaneId: null });
    expect(actorRef.send).not.toHaveBeenCalled();
  });

  it('ignores stale non-lane hit ids while connect mode stays armed', async () => {
    const line = polyline('line-1');
    useMapStore.setState({ entities: new Map([[line.id, line]]) });
    useUIStore.setState({ connectMode: { active: true, firstLaneId: null } });
    const actorRef = actorStub();

    expect(
      handleConnectModeClick(
        actorRef as never,
        vi.fn().mockResolvedValue(line.id),
        mouseEvent() as never,
      ),
    ).toBe(true);
    await flushAsync();

    expect(useUIStore.getState().connectMode).toEqual({ active: true, firstLaneId: null });
    expect(actorRef.send).not.toHaveBeenCalled();
  });

  it('exits connect mode when the stored first id resolves to a non-lane entity', async () => {
    const source = polyline('line-1');
    const target = laneAt('lane-1', [0, 0], [0.001, 0]);
    useMapStore.setState({
      entities: new Map<string, MapEntity>([
        [source.id, source],
        [target.id, target],
      ]),
    });
    useUIStore.setState({ connectMode: { active: true, firstLaneId: source.id } });
    const actorRef = actorStub();

    expect(
      handleConnectModeClick(
        actorRef as never,
        vi.fn().mockResolvedValue(target.id),
        mouseEvent() as never,
      ),
    ).toBe(true);
    await flushAsync();

    expect(useUIStore.getState().connectMode).toEqual({ active: false, firstLaneId: null });
    expect(useMapStore.getState().entities.get(source.id)).toBe(source);
    expect(actorRef.send).not.toHaveBeenCalled();
  });
});
