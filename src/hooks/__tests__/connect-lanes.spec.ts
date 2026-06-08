import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDrawnEntity } from '@/core/mapEditingApi';
import type { LngLat } from '@/core/geometry/interpolate';
import { resetSharedSpatialIndex } from '@/core/elements/overlap';
import { useMapStore } from '@/store/mapStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';
import { useLicenseStore } from '@/store/licenseStore';
import type { LicenseState } from '@/lib/license-bridge';
import type { LaneEntity } from '@/types/apollo';
import type { MapEntity, PolylineEntity } from '@/types/entities';
import {
  buildActionHandlers,
  createActionExecutor,
  type ActionDispatcherOptions,
} from '../useActionDispatcher';
import { handleConnectModeClick } from '../mapEventRouter/connectMode';
import { handleMapKeyDown } from '../mapEventRouter/keyboard';

const initialUIState = useUIStore.getState();

const editableLicenseState: LicenseState = {
  status: 'trial',
  canEdit: true,
  machineCode: '',
  trialStart: 0,
  trialEnd: 0,
  daysRemaining: 7,
  hoursRemaining: 7 * 24,
  license: null,
  checkedAt: 0,
  reason: '',
};

type ActorContext = {
  selectedEntityId: string | null;
  activeElement: string | null;
  dragPointIndex: number;
  dragPointType: 'vertex' | 'center' | 'handleIn' | 'handleOut' | 'rotate';
};

function actorStub(value = 'idle', context: Partial<ActorContext> = {}) {
  return {
    send: vi.fn(),
    getSnapshot: vi.fn(() => ({
      value,
      context: {
        selectedEntityId: null,
        activeElement: null,
        dragPointIndex: -1,
        dragPointType: 'center',
        ...context,
      },
    })),
  };
}

function dispatcherOptions(
  overrides: Partial<ActionDispatcherOptions> = {},
): ActionDispatcherOptions {
  return {
    actorRef: actorStub() as never,
    onOpenCommandPalette: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenAbout: vi.fn(),
    onResetLayout: vi.fn(),
    onToggleWorkspaceView: vi.fn(),
    getWorkspaceViewState: vi.fn(() => false),
    ...overrides,
  };
}

function lane(
  start: readonly [number, number],
  end: readonly [number, number],
  entities: ReadonlyMap<string, MapEntity> = useMapStore.getState().entities,
): LaneEntity {
  const entity = createDrawnEntity(
    'drawBezier',
    [],
    [
      {
        point: [start[0], start[1]] as LngLat,
        handleIn: null,
        handleOut: null,
      },
      {
        point: [end[0], end[1]] as LngLat,
        handleIn: null,
        handleOut: null,
      },
    ],
    'lane',
    {
      laneHalfWidth: useSettingsStore.getState().laneHalfWidth,
      laneSpeedLimit: useSettingsStore.getState().laneSpeedLimit,
      laneBoundaryType: useSettingsStore.getState().laneBoundaryType,
      entities,
    },
  );
  if (!entity || entity.entityType !== 'lane') throw new Error('expected lane');
  return entity;
}

function expectLaneOnlyHitTest(mock: ReturnType<typeof hitTest>) {
  expect(mock).toHaveBeenCalledWith(expect.anything(), expect.any(Function));
  const filter = mock.mock.calls[0]?.[1];
  expect(filter?.('lane')).toBe(true);
  expect(filter?.('polyline')).toBe(false);
}

function clonePoints(points: ReturnType<typeof centerPoints>) {
  return points.map((point) => ({ ...point }));
}

function expectPointsEqual(
  actual: ReturnType<typeof centerPoints>,
  expected: ReturnType<typeof centerPoints>,
) {
  expect(clonePoints(actual)).toEqual(clonePoints(expected));
}

function topologyOf(laneEntity: LaneEntity) {
  return {
    predecessorIds: [...laneEntity.predecessorIds],
    successorIds: [...laneEntity.successorIds],
    leftNeighborForwardIds: [...laneEntity.leftNeighborForwardIds],
    rightNeighborForwardIds: [...laneEntity.rightNeighborForwardIds],
    leftNeighborReverseIds: [...laneEntity.leftNeighborReverseIds],
    rightNeighborReverseIds: [...laneEntity.rightNeighborReverseIds],
    selfReverseLaneIds: [...laneEntity.selfReverseLaneIds],
    junctionId: laneEntity.junctionId,
  };
}

function expectMode(active: boolean, firstLaneId: string | null = null) {
  expect(useUIStore.getState().connectMode).toEqual({
    active,
    firstLaneId,
  });
}

function makeExecutor(actorRef = actorStub()) {
  return {
    actorRef,
    execute: createActionExecutor(
      buildActionHandlers(dispatcherOptions({ actorRef: actorRef as never })),
    ),
  };
}

function createSeparatedLanes() {
  const predecessor = lane([0, 0], [0.001, 0]);
  useMapStore.getState().addEntity(predecessor);
  const successor = lane([0.002, 0.001], [0.003, 0.001]);
  useMapStore.getState().addEntity(successor);
  expect(successor.id).not.toBe(predecessor.id);
  expect(useMapStore.getState().entities.has(predecessor.id)).toBe(true);
  expect(useMapStore.getState().entities.has(successor.id)).toBe(true);
  return { predecessor, successor };
}

function seedSeparatedLanes() {
  const predecessor = lane([0, 0], [0.001, 0]);
  const successor = lane([0.002, 0.001], [0.003, 0.001], new Map([[predecessor.id, predecessor]]));
  seedEntities(predecessor, successor);
  expect(successor.id).not.toBe(predecessor.id);
  expect(useMapStore.getState().entities.has(predecessor.id)).toBe(true);
  expect(useMapStore.getState().entities.has(successor.id)).toBe(true);
  return { predecessor, successor };
}

function polyline(id: string): PolylineEntity {
  return {
    id,
    entityType: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  };
}

function seedEntities(...entities: MapEntity[]) {
  useMapStore.setState({ entities: new Map(entities.map((entity) => [entity.id, entity])) });
}

function getLane(id: string): LaneEntity {
  const entity = useMapStore.getState().entities.get(id);
  expect(entity?.entityType).toBe('lane');
  return entity as LaneEntity;
}

function centerPoints(id: string) {
  return getLane(id).centralCurve.segments[0]?.lineSegment.points ?? [];
}

function hitTest(hitId: string | null) {
  return vi.fn().mockResolvedValue(hitId);
}

function deferredHitTest() {
  let resolve!: (hitId: string | null) => void;
  const promise = new Promise<string | null>((done) => {
    resolve = done;
  });
  return { hitTest: vi.fn(() => promise), resolve };
}

async function waitForHitTest(mock: ReturnType<typeof hitTest>) {
  const result = mock.mock.results[0]?.value;
  if (result instanceof Promise) await result;
  await Promise.resolve();
}

function resetStores() {
  vi.restoreAllMocks();
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  resetSharedSpatialIndex();
  useUIStore.setState(initialUIState, true);
  useLicenseStore.setState({
    state: editableLicenseState,
    initialized: true,
    promptActivation: () => {},
  });
}

beforeEach(() => {
  resetStores();
});

afterEach(() => {
  resetStores();
});

describe('Connect Lanes integration', () => {
  it('creates two lanes, enters Connect Lanes mode, selects predecessor/successor, updates topology, and exits', async () => {
    const { predecessor, successor } = createSeparatedLanes();
    expect(getLane(predecessor.id).successorIds).toEqual([]);
    expect(getLane(successor.id).predecessorIds).toEqual([]);
    const originalPredecessorTopology = topologyOf(getLane(predecessor.id));
    const originalSuccessorTopology = topologyOf(getLane(successor.id));
    const originalPredecessorPoints = clonePoints(centerPoints(predecessor.id));
    const originalSuccessorPoints = clonePoints(centerPoints(successor.id));

    const { actorRef, execute } = makeExecutor();

    execute('connectLanes');
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'CANCEL' });
    expectMode(true);

    const firstHitTest = hitTest(predecessor.id);
    expect(handleConnectModeClick(actorRef as never, firstHitTest, {} as never)).toBe(true);
    await waitForHitTest(firstHitTest);
    expectLaneOnlyHitTest(firstHitTest);
    expectMode(true, predecessor.id);
    expect(actorRef.send).toHaveBeenCalledWith({
      type: 'SELECT_ENTITY',
      id: predecessor.id,
    });
    expectPointsEqual(centerPoints(predecessor.id), originalPredecessorPoints);
    expectPointsEqual(centerPoints(successor.id), originalSuccessorPoints);
    expect(topologyOf(getLane(predecessor.id))).toEqual(originalPredecessorTopology);
    expect(topologyOf(getLane(successor.id))).toEqual(originalSuccessorTopology);

    actorRef.send.mockClear();
    const secondHitTest = hitTest(successor.id);
    expect(handleConnectModeClick(actorRef as never, secondHitTest, {} as never)).toBe(true);
    await waitForHitTest(secondHitTest);
    expectLaneOnlyHitTest(secondHitTest);

    const updatedPredecessor = getLane(predecessor.id);
    const updatedSuccessor = getLane(successor.id);
    const predecessorPoints = centerPoints(predecessor.id);
    const successorPoints = centerPoints(successor.id);
    expect(predecessorPoints[0]).toMatchObject(originalPredecessorPoints[0]!);
    expect(predecessorPoints[predecessorPoints.length - 1]).toMatchObject(successorPoints[0]!);
    expectPointsEqual(successorPoints, originalSuccessorPoints);
    expect(updatedPredecessor.successorIds).toEqual([successor.id]);
    expect(updatedSuccessor.predecessorIds).toEqual([predecessor.id]);
    expect(topologyOf(updatedPredecessor)).toEqual({
      ...originalPredecessorTopology,
      successorIds: [successor.id],
    });
    expect(topologyOf(updatedSuccessor)).toEqual({
      ...originalSuccessorTopology,
      predecessorIds: [predecessor.id],
    });
    expectMode(false);
    expect(actorRef.send).toHaveBeenLastCalledWith({
      type: 'SELECT_ENTITY',
      id: predecessor.id,
    });
    expect(actorRef.send).toHaveBeenCalledTimes(1);
  });

  it('exits Connect Lanes mode when the toggle is executed again before a second click', () => {
    const { predecessor, successor } = createSeparatedLanes();
    const originalPredecessorPoints = clonePoints(centerPoints(predecessor.id));
    const { actorRef, execute } = makeExecutor();

    execute('connectLanes');
    useUIStore.getState().setConnectFirstLane(predecessor.id);
    execute('connectLanes');

    expect(actorRef.send).toHaveBeenCalledWith({ type: 'CANCEL' });
    expectMode(false);
    expectPointsEqual(centerPoints(predecessor.id), originalPredecessorPoints);
    expect(getLane(predecessor.id).successorIds).toEqual([]);
    expect(getLane(successor.id).predecessorIds).toEqual([]);
  });

  it('exits a pending Connect Lanes session when returning to default mode', () => {
    const { predecessor, successor } = createSeparatedLanes();
    const originalPredecessorPoints = clonePoints(centerPoints(predecessor.id));
    const { actorRef, execute } = makeExecutor();

    execute('connectLanes');
    useUIStore.getState().setConnectFirstLane(predecessor.id);
    execute('defaultMode');

    expect(actorRef.send).toHaveBeenCalledWith({ type: 'CANCEL' });
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'RESET' });
    expectMode(false);
    expectPointsEqual(centerPoints(predecessor.id), originalPredecessorPoints);
    expect(getLane(predecessor.id).successorIds).toEqual([]);
    expect(getLane(successor.id).predecessorIds).toEqual([]);
  });

  it('cancels the pending connection with Escape without changing lane topology', () => {
    const { predecessor, successor } = seedSeparatedLanes();
    const originalPredecessorPoints = clonePoints(centerPoints(predecessor.id));
    useUIStore.setState({ connectMode: { active: true, firstLaneId: predecessor.id } });
    const actorRef = actorStub('selected', { selectedEntityId: predecessor.id });

    handleMapKeyDown(actorRef as never, { key: 'Escape', target: null } as KeyboardEvent, vi.fn());

    expectMode(false);
    expect(getLane(predecessor.id).successorIds).toEqual([]);
    expect(getLane(successor.id).predecessorIds).toEqual([]);
    expectPointsEqual(centerPoints(predecessor.id), originalPredecessorPoints);
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'CANCEL' });
  });

  it('ignores a delayed second lane hit after the pending session is cancelled', async () => {
    const { predecessor, successor } = seedSeparatedLanes();
    const originalPredecessorPoints = clonePoints(centerPoints(predecessor.id));
    useUIStore.setState({ connectMode: { active: true, firstLaneId: predecessor.id } });
    const actorRef = actorStub('selected', { selectedEntityId: predecessor.id });
    const delayed = deferredHitTest();

    expect(handleConnectModeClick(actorRef as never, delayed.hitTest, {} as never)).toBe(true);
    expect(delayed.hitTest).toHaveBeenCalledTimes(1);
    const delayedResult = delayed.hitTest.mock.results[0]?.value;
    expect(delayedResult).toBeInstanceOf(Promise);
    handleMapKeyDown(actorRef as never, { key: 'Escape', target: null } as KeyboardEvent, vi.fn());
    delayed.resolve(successor.id);
    await delayedResult;
    await Promise.resolve();

    expectMode(false);
    expectPointsEqual(centerPoints(predecessor.id), originalPredecessorPoints);
    expect(getLane(predecessor.id).successorIds).toEqual([]);
    expect(getLane(successor.id).predecessorIds).toEqual([]);
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'CANCEL' });
    expect(actorRef.send).not.toHaveBeenCalledWith({
      type: 'SELECT_ENTITY',
      id: predecessor.id,
    });
  });

  it('does not select a first lane from invalid initial clicks', async () => {
    const { predecessor, successor } = seedSeparatedLanes();
    const line = polyline('line-target');
    useMapStore.setState({
      entities: new Map([...useMapStore.getState().entities, [line.id, line]]),
    });
    useUIStore.setState({ connectMode: { active: true, firstLaneId: null } });
    const actorRef = actorStub();

    const missHitTest = hitTest(null);
    expect(handleConnectModeClick(actorRef as never, missHitTest, {} as never)).toBe(true);
    await waitForHitTest(missHitTest);
    expectMode(true);

    const nonLaneHitTest = hitTest(line.id);
    expect(handleConnectModeClick(actorRef as never, nonLaneHitTest, {} as never)).toBe(true);
    await waitForHitTest(nonLaneHitTest);
    expectMode(true);

    useUIStore.getState().setLayerLocked('lane', true);
    const lockedLaneHitTest = hitTest(predecessor.id);
    expect(handleConnectModeClick(actorRef as never, lockedLaneHitTest, {} as never)).toBe(true);
    await waitForHitTest(lockedLaneHitTest);

    expectMode(true);
    expect(getLane(predecessor.id).successorIds).toEqual([]);
    expect(getLane(successor.id).predecessorIds).toEqual([]);
    expect(actorRef.send).not.toHaveBeenCalled();
  });

  it('keeps mode armed and topology unchanged for invalid target clicks', async () => {
    const { predecessor, successor } = seedSeparatedLanes();
    const line = polyline('line-target');
    useMapStore.setState({
      entities: new Map([...useMapStore.getState().entities, [line.id, line]]),
    });
    useUIStore.setState({ connectMode: { active: true, firstLaneId: predecessor.id } });
    const actorRef = actorStub();
    const originalPredecessorPoints = clonePoints(centerPoints(predecessor.id));

    useUIStore.getState().setLayerVisible('lane', false);
    const hiddenHitTest = hitTest(successor.id);
    expect(handleConnectModeClick(actorRef as never, hiddenHitTest, {} as never)).toBe(true);
    await waitForHitTest(hiddenHitTest);
    expectMode(true, predecessor.id);
    useUIStore.getState().setLayerVisible('lane', true);

    const missHitTest = hitTest(null);
    expect(handleConnectModeClick(actorRef as never, missHitTest, {} as never)).toBe(true);
    await waitForHitTest(missHitTest);
    expectMode(true, predecessor.id);

    const sameLaneHitTest = hitTest(predecessor.id);
    expect(handleConnectModeClick(actorRef as never, sameLaneHitTest, {} as never)).toBe(true);
    await waitForHitTest(sameLaneHitTest);
    expectMode(true, predecessor.id);

    const nonLaneHitTest = hitTest(line.id);
    expect(handleConnectModeClick(actorRef as never, nonLaneHitTest, {} as never)).toBe(true);
    await waitForHitTest(nonLaneHitTest);

    useMapStore.getState().removeEntity(successor.id);
    const missingTargetHitTest = hitTest(successor.id);
    expect(handleConnectModeClick(actorRef as never, missingTargetHitTest, {} as never)).toBe(true);
    await waitForHitTest(missingTargetHitTest);

    expectMode(true, predecessor.id);
    expectPointsEqual(centerPoints(predecessor.id), originalPredecessorPoints);
    expect(getLane(predecessor.id).successorIds).toEqual([]);
    expect(actorRef.send).not.toHaveBeenCalled();
  });

  it('keeps mode armed when the second lane is not interactive', async () => {
    const { predecessor, successor } = seedSeparatedLanes();
    useUIStore.setState({
      connectMode: { active: true, firstLaneId: predecessor.id },
    });
    useUIStore.getState().setLayerLocked('lane', true);
    const actorRef = actorStub();
    const lockedHitTest = hitTest(successor.id);

    expect(handleConnectModeClick(actorRef as never, lockedHitTest, {} as never)).toBe(true);
    await waitForHitTest(lockedHitTest);

    expectMode(true, predecessor.id);
    expect(getLane(predecessor.id).successorIds).toEqual([]);
    expect(getLane(successor.id).predecessorIds).toEqual([]);
    expect(actorRef.send).not.toHaveBeenCalled();
  });

  it('exits without a topology change when the pending first lane is gone', async () => {
    const { predecessor, successor } = seedSeparatedLanes();
    const actorRef = actorStub();

    useMapStore.getState().removeEntity(predecessor.id);
    useUIStore.setState({
      connectMode: { active: true, firstLaneId: predecessor.id },
    });
    const missingSourceHitTest = hitTest(successor.id);

    expect(handleConnectModeClick(actorRef as never, missingSourceHitTest, {} as never)).toBe(true);
    await waitForHitTest(missingSourceHitTest);

    expectMode(false);
    expect(getLane(successor.id).predecessorIds).toEqual([]);
  });

  it('exits without writing topology when a degenerate lane cannot produce a connection plan', async () => {
    const predecessor = {
      ...lane([0, 0], [0.001, 0]),
      centralCurve: { segments: [] },
    } satisfies LaneEntity;
    const successor = lane(
      [0.002, 0.001],
      [0.003, 0.001],
      new Map([[predecessor.id, predecessor]]),
    );
    seedEntities(predecessor, successor);
    useUIStore.setState({
      connectMode: { active: true, firstLaneId: predecessor.id },
    });
    const actorRef = actorStub();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const nullPlanHitTest = hitTest(successor.id);

    expect(handleConnectModeClick(actorRef as never, nullPlanHitTest, {} as never)).toBe(true);
    await waitForHitTest(nullPlanHitTest);

    expectMode(false);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(getLane(predecessor.id).successorIds).toEqual([]);
    expect(getLane(successor.id).predecessorIds).toEqual([]);
    expect(actorRef.send).toHaveBeenLastCalledWith({
      type: 'SELECT_ENTITY',
      id: predecessor.id,
    });
  });
});
