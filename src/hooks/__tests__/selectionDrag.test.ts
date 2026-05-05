import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { editorMachine } from '@/core/fsm/editorMachine';
import { handleSelectedMouseDown } from '../mapEventRouter/selectionDrag';
import { createMapEventHandlers } from '../mapEventRouter/eventHandlers';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import { createEntity } from '@/lib/entityOps';
import type { LaneEntity } from '@/types/apollo';
import type { MapEntity, PolylineEntity } from '@/types/entities';

const initialUISnapshot = useUIStore.getState();

interface TestMouseEvent {
  point: { x: number; y: number };
  lngLat: { lng: number; lat: number };
  originalEvent: { altKey: boolean };
  preventDefault: () => void;
}

function polyline(): PolylineEntity {
  return {
    id: 'pl',
    entityType: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 4, y: 0 },
    ],
  };
}

function lane(): LaneEntity {
  return createEntity(
    'lane',
    'drawPolyline',
    [
      [0, 0],
      [2, 0],
      [4, 0],
    ],
    [],
  ) as LaneEntity;
}

function makeActor(entityId = 'pl') {
  const send = vi.fn();
  return {
    send,
    getSnapshot: () => ({
      value: 'selected',
      context: { selectedEntityId: entityId },
    }),
  };
}

function makeMouseEvent(overrides: Partial<TestMouseEvent> = {}): TestMouseEvent {
  return {
    point: { x: 100, y: 120 },
    lngLat: { lng: 3, lat: 1 },
    originalEvent: { altKey: false },
    preventDefault: vi.fn(),
    ...overrides,
  };
}

function makeMap(lineHit: boolean) {
  const queryRenderedFeatures = vi.fn((_bbox, options?: { layers?: string[] }) => {
    if (options?.layers?.includes('hot-points')) return [];
    if (options?.layers?.includes('hot-fill')) return [];
    if (options?.layers?.includes('hot-line') && lineHit) {
      return [{ type: 'Feature', properties: {}, geometry: { type: 'LineString' } }];
    }
    return [];
  });
  const dragPan = { disable: vi.fn() };
  return { queryRenderedFeatures, dragPan, getZoom: () => 18 };
}

function makeRouterMap(lineHit: boolean) {
  return {
    ...makeMap(lineHit),
    dragPan: { disable: vi.fn(), enable: vi.fn() },
    getZoom: () => 18,
    getCanvas: () => ({ style: { cursor: '' } }),
  };
}

beforeEach(() => {
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useUIStore.setState(initialUISnapshot, true);
});

describe('handleSelectedMouseDown', () => {
  it('starts center dragging from the selected polyline hot line', () => {
    const entity = polyline();
    useMapStore.setState({ entities: new Map<string, MapEntity>([[entity.id, entity]]) });
    const actor = makeActor();
    const map = makeMap(true);
    const event = makeMouseEvent();

    const result = handleSelectedMouseDown(map as never, actor as never, event as never);

    expect(result).toEqual({ handled: true, centerGrabOffset: [1, 1] });
    expect(map.dragPan.disable).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(actor.send).toHaveBeenCalledWith({
      type: 'START_DRAG',
      index: -2,
      pointType: 'center',
      altKey: false,
    });
  });

  it('starts center dragging from selected polyline geometry when the hot-line rendered hit misses', () => {
    const entity = polyline();
    useMapStore.setState({ entities: new Map<string, MapEntity>([[entity.id, entity]]) });
    const actor = makeActor();
    const map = makeMap(false);
    const event = makeMouseEvent({ lngLat: { lng: 2, lat: 0 } });

    const result = handleSelectedMouseDown(map as never, actor as never, event as never);

    expect(result).toEqual({ handled: true, centerGrabOffset: [0, 0] });
    expect(map.dragPan.disable).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(actor.send).toHaveBeenCalledWith({
      type: 'START_DRAG',
      index: -2,
      pointType: 'center',
      altKey: false,
    });
  });

  it('starts center dragging from a selected Apollo line hot line', () => {
    const entity = lane();
    useMapStore.setState({ entities: new Map<string, MapEntity>([[entity.id, entity]]) });
    const actor = makeActor(entity.id);
    const map = makeMap(true);
    const event = makeMouseEvent();

    const result = handleSelectedMouseDown(map as never, actor as never, event as never);

    expect(result).toEqual({ handled: true, centerGrabOffset: [1, 1] });
    expect(map.dragPan.disable).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(actor.send).toHaveBeenCalledWith({
      type: 'START_DRAG',
      index: -2,
      pointType: 'center',
      altKey: false,
    });
  });

  it('keeps selected polyline idle when neither vertex nor line is hit', () => {
    const entity = polyline();
    useMapStore.setState({ entities: new Map<string, MapEntity>([[entity.id, entity]]) });
    const actor = makeActor();
    const map = makeMap(false);
    const event = makeMouseEvent();

    const result = handleSelectedMouseDown(map as never, actor as never, event as never);

    expect(result).toEqual({ handled: false });
    expect(map.dragPan.disable).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(actor.send).not.toHaveBeenCalled();
  });

  it('moves all selected polyline vertices through the map event router line drag path', () => {
    const entity = polyline();
    useMapStore.setState({ entities: new Map<string, MapEntity>([[entity.id, entity]]) });

    const actor = createActor(editorMachine).start();
    actor.send({ type: 'SELECT_ENTITY', id: entity.id });
    const map = makeRouterMap(true);
    const handlers = createMapEventHandlers({
      map,
      actorRef: actor,
      bridgeRef: { current: null },
      mutable: {
        mouseDownScreenPos: null,
        centerGrabOffset: null,
        lastDrawInput: null,
        boundaryBrushDragging: false,
        lastBoundaryBrushHit: null,
      },
      cursorScheduler: { schedule: vi.fn(), dispose: vi.fn() },
    } as never);

    handlers.onMouseDown(makeMouseEvent() as never);
    handlers.onMouseMove({
      ...makeMouseEvent(),
      lngLat: { lng: 4, lat: 2 },
    } as never);
    handlers.onMouseUp({
      ...makeMouseEvent(),
      lngLat: { lng: 4, lat: 2 },
    } as never);

    const moved = useMapStore.getState().entities.get(entity.id) as PolylineEntity;
    expect(moved.points).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 5, y: 1 },
    ]);
    expect(map.dragPan.disable).toHaveBeenCalled();
    expect(map.dragPan.enable).not.toHaveBeenCalled();
  });
});
