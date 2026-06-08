import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleMapKeyDown } from '../mapEventRouter/keyboard';
import { handleConnectModeClick } from '../mapEventRouter/connectMode';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import type { LaneEntity } from '@/types/apollo';
import type { PolygonEntity, PolylineEntity } from '@/types/entities';

type ActorSnapshot = {
  value: string;
  context: {
    selectedEntityId?: string | null;
    dragPointIndex: number;
    dragPointType: 'vertex' | 'center' | 'handleIn' | 'handleOut' | 'rotate';
  };
};

function actor(snapshot: ActorSnapshot) {
  return {
    send: vi.fn(),
    getSnapshot: vi.fn(() => snapshot),
  } as never as Parameters<typeof handleMapKeyDown>[0];
}

function keyboardEvent(key: string, target: EventTarget | null = null): KeyboardEvent {
  return { key, target } as KeyboardEvent;
}

function polyline(points: PolylineEntity['points']): PolylineEntity {
  return { id: 'line-1', entityType: 'polyline', points };
}

function polygon(): PolygonEntity {
  return {
    id: 'poly-1',
    entityType: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ],
  };
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
    leftSamples: [{ s: 0, width: 1.75 }],
    rightSamples: [{ s: 0, width: 1.75 }],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

function resetStores() {
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useUIStore.setState({
    layerStates: {},
    connectMode: { active: false, firstLaneId: null },
    currentSnapTarget: null,
  });
}

beforeEach(() => {
  resetStores();
});

describe('handleMapKeyDown', () => {
  it('Escape clears drag state, exits connect mode, and cancels the FSM', () => {
    useUIStore.setState({ connectMode: { active: true, firstLaneId: 'lane-a' } });
    const a = actor({
      value: 'selected',
      context: { selectedEntityId: 'line-1', dragPointIndex: -1, dragPointType: 'center' },
    });
    const clearCenterGrabOffset = vi.fn();

    handleMapKeyDown(a, keyboardEvent('Escape'), clearCenterGrabOffset);

    expect(clearCenterGrabOffset).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().connectMode).toEqual({ active: false, firstLaneId: null });
    expect(a.send).toHaveBeenCalledWith({ type: 'CANCEL' });
  });

  it('Enter confirms the FSM without touching map entities', () => {
    const entity = polygon();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    const a = actor({
      value: 'selected',
      context: { selectedEntityId: entity.id, dragPointIndex: -1, dragPointType: 'center' },
    });

    handleMapKeyDown(a, keyboardEvent('Enter'), vi.fn());

    expect(a.send).toHaveBeenCalledWith({ type: 'CONFIRM' });
    expect(useMapStore.getState().entities.get(entity.id)).toBe(entity);
  });

  it('Delete on a selected vertex updates the entity when the vertex can be removed', () => {
    const entity = polyline([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    const a = actor({
      value: 'selected',
      context: { selectedEntityId: entity.id, dragPointIndex: 1, dragPointType: 'vertex' },
    });

    handleMapKeyDown(a, keyboardEvent('Delete'), vi.fn());

    expect((useMapStore.getState().entities.get(entity.id) as PolylineEntity).points).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(a.send).toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: entity.id });
    expect(a.send).not.toHaveBeenCalledWith({ type: 'DELETE_ENTITY' });
  });

  it('Backspace removes the entity when vertex deletion returns null', () => {
    const entity = polygon();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    const a = actor({
      value: 'selected',
      context: { selectedEntityId: entity.id, dragPointIndex: 0, dragPointType: 'vertex' },
    });

    handleMapKeyDown(a, keyboardEvent('Backspace'), vi.fn());

    expect(useMapStore.getState().entities.has(entity.id)).toBe(false);
    expect(a.send).toHaveBeenCalledWith({ type: 'DELETE_ENTITY' });
  });

  it('does not delete locked entities or entities outside selected state', () => {
    const entity = polygon();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    useUIStore.getState().setLayerLocked('polygon', true);
    const selected = actor({
      value: 'selected',
      context: { selectedEntityId: entity.id, dragPointIndex: -1, dragPointType: 'center' },
    });

    handleMapKeyDown(selected, keyboardEvent('Delete'), vi.fn());

    expect(useMapStore.getState().entities.get(entity.id)).toBe(entity);
    expect(selected.send).not.toHaveBeenCalledWith({ type: 'DELETE_ENTITY' });

    const idle = actor({
      value: 'idle',
      context: { selectedEntityId: entity.id, dragPointIndex: -1, dragPointType: 'center' },
    });
    handleMapKeyDown(idle, keyboardEvent('Delete'), vi.fn());
    expect(useMapStore.getState().entities.get(entity.id)).toBe(entity);
  });

  it('ignores Delete while focus is inside a text-editing target', () => {
    class FakeInput {}
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const entity = polygon();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    const a = actor({
      value: 'selected',
      context: { selectedEntityId: entity.id, dragPointIndex: -1, dragPointType: 'center' },
    });

    handleMapKeyDown(a, keyboardEvent('Delete', new FakeInput() as never), vi.fn());

    expect(useMapStore.getState().entities.get(entity.id)).toBe(entity);
    expect(a.send).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('handleConnectModeClick', () => {
  async function flushAsync() {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('returns false and skips hit testing when connect mode is inactive', async () => {
    const hitTest = vi.fn();

    const handled = handleConnectModeClick(
      actor({
        value: 'idle',
        context: { dragPointIndex: -1, dragPointType: 'center' },
      }),
      hitTest,
      {} as never,
    );

    expect(handled).toBe(false);
    expect(hitTest).not.toHaveBeenCalled();
  });

  it('first lane click stores firstLaneId and selects the lane', async () => {
    const first = laneAt('lane-a', [0, 0], [1, 0]);
    useMapStore.setState({ entities: new Map([[first.id, first]]) });
    useUIStore.setState({ connectMode: { active: true, firstLaneId: null } });
    const a = actor({
      value: 'idle',
      context: { dragPointIndex: -1, dragPointType: 'center' },
    });
    const hitTest = vi.fn().mockResolvedValue(first.id);

    expect(handleConnectModeClick(a, hitTest, {} as never)).toBe(true);
    await flushAsync();

    expect(hitTest).toHaveBeenCalledWith(expect.anything(), expect.any(Function));
    expect(useUIStore.getState().connectMode).toEqual({ active: true, firstLaneId: first.id });
    expect(a.send).toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: first.id });
  });

  it('second lane click connects the first lane to the second and exits connect mode', async () => {
    const first = laneAt('lane-a', [0, 0], [1, 0]);
    const second = laneAt('lane-b', [2, 2], [3, 2]);
    useMapStore.setState({
      entities: new Map([
        [first.id, first],
        [second.id, second],
      ]),
    });
    useUIStore.setState({ connectMode: { active: true, firstLaneId: first.id } });
    const a = actor({
      value: 'idle',
      context: { dragPointIndex: -1, dragPointType: 'center' },
    });

    handleConnectModeClick(a, vi.fn().mockResolvedValue(second.id), {} as never);
    await flushAsync();

    const updated = useMapStore.getState().entities.get(first.id) as LaneEntity;
    const points = updated.centralCurve.segments[0]!.lineSegment.points;
    expect(points[points.length - 1]).toMatchObject({ x: 2, y: 2 });
    expect(useUIStore.getState().connectMode).toEqual({ active: false, firstLaneId: null });
    expect(a.send).toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: first.id });
  });

  it('ignores misses, repeated second click, and locked target lanes', async () => {
    const first = laneAt('lane-a', [0, 0], [1, 0]);
    const second = laneAt('lane-b', [2, 2], [3, 2]);
    useMapStore.setState({
      entities: new Map([
        [first.id, first],
        [second.id, second],
      ]),
    });
    useUIStore.setState({ connectMode: { active: true, firstLaneId: first.id } });
    const a = actor({
      value: 'idle',
      context: { dragPointIndex: -1, dragPointType: 'center' },
    });

    handleConnectModeClick(a, vi.fn().mockResolvedValue(null), {} as never);
    await flushAsync();
    expect(useUIStore.getState().connectMode).toEqual({ active: true, firstLaneId: first.id });

    handleConnectModeClick(a, vi.fn().mockResolvedValue(first.id), {} as never);
    await flushAsync();
    expect(useUIStore.getState().connectMode).toEqual({ active: true, firstLaneId: first.id });

    useUIStore.getState().setLayerLocked('lane', true);
    handleConnectModeClick(a, vi.fn().mockResolvedValue(second.id), {} as never);
    await flushAsync();
    expect(useUIStore.getState().connectMode).toEqual({ active: true, firstLaneId: first.id });
    expect(useMapStore.getState().entities.get(first.id)).toBe(first);
  });

  it('exits connect mode when the stored first lane no longer exists', async () => {
    const second = laneAt('lane-b', [2, 2], [3, 2]);
    useMapStore.setState({ entities: new Map([[second.id, second]]) });
    useUIStore.setState({ connectMode: { active: true, firstLaneId: 'missing' } });
    const a = actor({
      value: 'idle',
      context: { dragPointIndex: -1, dragPointType: 'center' },
    });

    handleConnectModeClick(a, vi.fn().mockResolvedValue(second.id), {} as never);
    await flushAsync();

    expect(useUIStore.getState().connectMode).toEqual({ active: false, firstLaneId: null });
    expect(a.send).not.toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: 'missing' });
  });
});
