import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSelectedMouseDown } from '../mapEventRouter/selectionDrag';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import type { MapEntity, PolylineEntity } from '@/types/entities';

const initialUISnapshot = useUIStore.getState();

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

function makeMouseEvent() {
  return {
    point: { x: 100, y: 120 },
    lngLat: { lng: 3, lat: 1 },
    originalEvent: { altKey: false },
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
  return { queryRenderedFeatures, dragPan };
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

    const result = handleSelectedMouseDown(map as never, actor as never, makeMouseEvent() as never);

    expect(result).toEqual({ handled: true, centerGrabOffset: [1, 1] });
    expect(map.dragPan.disable).toHaveBeenCalledTimes(1);
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

    const result = handleSelectedMouseDown(map as never, actor as never, makeMouseEvent() as never);

    expect(result).toEqual({ handled: false });
    expect(map.dragPan.disable).not.toHaveBeenCalled();
    expect(actor.send).not.toHaveBeenCalled();
  });
});
