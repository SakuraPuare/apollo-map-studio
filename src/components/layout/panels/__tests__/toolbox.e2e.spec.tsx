import React from 'react';
import type * as JsxDevRuntime from 'react/jsx-dev-runtime';
import type * as JsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { createActor } from 'xstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderOverlayFrame } from '@/hooks/useOverlayLayer';
import { useLicenseStore } from '@/store/licenseStore';
import { useMapStore } from '@/store/mapStore';
import { useTaskProgressStore } from '@/store/taskProgressStore';
import { useUIStore } from '@/store/uiStore';
import {
  collectGeometryStats,
  rederiveEditableGeometry,
  simplifyRoadGeometry,
} from '@/core/toolbox';
import { editorMachine } from '@/core/fsm/editorMachine';
import { reconcileOverlaps, resetSharedSpatialIndex } from '@/core/elements/overlap';
import { clearLaneArcLengthCache } from '@/core/elements/overlap/computeLaneS';
import { makeOverlapId } from '@/core/elements/overlap/overlapId';
import type { LicenseState } from '@/lib/license-bridge';
import type {
  BoundaryPolygon,
  CrosswalkEntity,
  Curve,
  LaneEntity,
  OverlapEntity,
  RoadEntity,
} from '@/types/apollo';
import type { GeoPoint, MapEntity, PolylineEntity } from '@/types/entities';
import { ToolboxPanel } from '../ToolboxPanel';

const jsxCapture = vi.hoisted(() => ({
  elements: [] as Array<{ type: unknown; props: Record<string, unknown> }>,
}));

function recordCapturedElement(type: unknown, props: unknown): void {
  if (typeof type !== 'string' || typeof props !== 'object' || props === null) return;
  jsxCapture.elements.push({ type, props: props as Record<string, unknown> });
}

vi.mock('react/jsx-runtime', async () => {
  const actual = await vi.importActual<typeof JsxRuntime>('react/jsx-runtime');

  const jsx: typeof actual.jsx = (type, props, key) => {
    recordCapturedElement(type, props);
    return actual.jsx(type, props, key);
  };
  const jsxs: typeof actual.jsxs = (type, props, key) => {
    recordCapturedElement(type, props);
    return actual.jsxs(type, props, key);
  };

  return { ...actual, jsx, jsxs };
});

vi.mock('react/jsx-dev-runtime', async () => {
  const actual = await vi.importActual<typeof JsxDevRuntime>('react/jsx-dev-runtime');

  const jsxDEV: typeof actual.jsxDEV = (...args) => {
    const [type, props] = args;
    recordCapturedElement(type, props);
    return actual.jsxDEV(...args);
  };

  return { ...actual, jsxDEV };
});

const DEG_PER_M = 1 / 111_320;
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

const readOnlyLicenseState: LicenseState = {
  ...editableLicenseState,
  status: 'expired_trial',
  canEdit: false,
  daysRemaining: 0,
  hoursRemaining: 0,
  reason: 'trial expired',
};

type ReconcileWorkerMessage = {
  type: 'RECONCILE_FULL';
  requestId: string;
  entities: MapEntity[];
};

class RealReconcileWorker {
  static instances: RealReconcileWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  constructor(
    public readonly url: URL,
    public readonly options?: WorkerOptions,
  ) {
    RealReconcileWorker.instances.push(this);
  }

  postMessage(message: unknown): void {
    if (!isReconcileWorkerMessage(message)) return;
    clearLaneArcLengthCache();
    resetSharedSpatialIndex();
    const patch = reconcileOverlaps(entityMap(...message.entities), { mode: 'full' });
    queueMicrotask(() => {
      if (this.terminated) return;
      this.onmessage?.({
        data: {
          type: 'RECONCILE_RESULT',
          requestId: message.requestId,
          changes: Array.from(patch.changes.entries()),
          removedOverlapIds: Array.from(patch.removedOverlapIds),
          stats: patch.stats,
        },
      } as MessageEvent);
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

function isReconcileWorkerMessage(value: unknown): value is ReconcileWorkerMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'RECONCILE_FULL' &&
    typeof (value as { requestId?: unknown }).requestId === 'string' &&
    Array.isArray((value as { entities?: unknown }).entities)
  );
}

function render(node: React.ReactElement) {
  return renderToStaticMarkup(node);
}

function renderToolboxForCapture() {
  jsxCapture.elements = [];
  return render(<ToolboxPanel />);
}

function mockClientStoreSnapshot() {
  vi.spyOn(React, 'useSyncExternalStore').mockImplementation(((
    _subscribe: unknown,
    getSnapshot: () => unknown,
  ) => getSnapshot()) as typeof React.useSyncExternalStore);
}

function resetStores() {
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useTaskProgressStore.setState({ activeTask: null });
  useUIStore.setState(initialUIState, true);
  useLicenseStore.setState({
    state: editableLicenseState,
    initialized: true,
    promptActivation: vi.fn(),
  });
  clearLaneArcLengthCache();
  resetSharedSpatialIndex();
  for (const worker of RealReconcileWorker.instances) worker.terminate();
  RealReconcileWorker.instances = [];
  jsxCapture.elements = [];
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetStores();
  mockClientStoreSnapshot();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetStores();
});

function point(xMeters: number, yMeters: number): GeoPoint {
  return { x: xMeters * DEG_PER_M, y: yMeters * DEG_PER_M };
}

function densePoints(count = 9): GeoPoint[] {
  return Array.from({ length: count }, (_, i) => point(i * 5, i % 2 === 0 ? 0 : 0.02));
}

function offsetPoints(points: readonly GeoPoint[], yMeters: number): GeoPoint[] {
  return points.map((p) => ({ x: p.x, y: p.y + yMeters * DEG_PER_M }));
}

function curve(points: GeoPoint[]): Curve {
  return {
    segments: [
      {
        s: 0,
        startPosition: points[0],
        heading: 0,
        length: 0,
        lineSegment: { points },
      },
    ],
  };
}

function makeLane(id: string, points: GeoPoint[], length = 0): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: curve(points),
    leftBoundary: {
      curve: curve(offsetPoints(points, 1.5)),
      length,
      boundaryType: [],
    },
    rightBoundary: {
      curve: curve(offsetPoints(points, -1.5)),
      length,
      boundaryType: [],
    },
    length,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 13.89,
    predecessorIds: [],
    successorIds: [],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId: null,
    overlapIds: [],
    leftSamples: [{ s: 0, width: 1.5 }],
    rightSamples: [{ s: 0, width: 1.5 }],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

function makeRoad(id: string, points: GeoPoint[]): RoadEntity {
  const outerPolygon: BoundaryPolygon = {
    edges: [{ type: 'NORMAL', curve: curve(points) }],
  };
  return {
    id,
    entityType: 'road',
    sections: [
      {
        id: `${id}_section`,
        laneIds: [],
        boundary: { outerPolygon, holes: [] },
      },
    ],
    junctionId: null,
    type: 'CITY_ROAD',
  };
}

function makeCrosswalk(id: string, points: GeoPoint[]): CrosswalkEntity {
  return {
    id,
    entityType: 'crosswalk',
    polygon: { points },
    overlapIds: [],
  };
}

function makePolyline(id: string): PolylineEntity {
  return {
    id,
    entityType: 'polyline',
    points: [point(0, 0), point(1, 1), point(2, 0)],
  };
}

function entityMap(...entities: MapEntity[]): Map<string, MapEntity> {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

function seedEntities(...entities: MapEntity[]) {
  useMapStore.setState({ entities: entityMap(...entities) });
}

function entities() {
  return useMapStore.getState().entities;
}

function entity(id: string) {
  const found = entities().get(id);
  if (!found) throw new Error(`expected entity ${id}`);
  return found;
}

function laneEntity(id: string): LaneEntity {
  const found = entity(id);
  expect(found.entityType).toBe('lane');
  return found as LaneEntity;
}

function setReadOnlyLicense(promptActivation = vi.fn()) {
  useLicenseStore.setState({
    state: readOnlyLicenseState,
    initialized: true,
    promptActivation,
  });
}

function installRealReconcileWorker() {
  RealReconcileWorker.instances = [];
  vi.stubGlobal('Worker', RealReconcileWorker);
}

function expectMetric(html: string, label: string, value: string) {
  expect(html).toMatch(new RegExp(`${label}</div><div[^>]*>${value}</div>`));
}

function highPointMap() {
  const dense = densePoints();
  return {
    lane: makeLane('lane_high_1', dense, 999),
    road: makeRoad('road_high_1', dense),
    draft: makePolyline('ignored_polyline'),
  };
}

function overlapFixture() {
  const lane = makeLane('Lane_1', [
    { x: 116.0, y: 39.9 },
    { x: 116.0005, y: 39.9 },
  ]);
  const crosswalk = makeCrosswalk('Crosswalk_1', [
    { x: 116.00015, y: 39.8999 },
    { x: 116.00035, y: 39.8999 },
    { x: 116.00035, y: 39.9001 },
    { x: 116.00015, y: 39.9001 },
  ]);
  return { lane, crosswalk, overlapId: makeOverlapId([lane.id, crosswalk.id]) };
}

function getOverlayFeatures(setData: ReturnType<typeof vi.fn>): GeoJSON.Feature[] {
  const payload = setData.mock.calls.at(-1)?.[0] as GeoJSON.FeatureCollection | undefined;
  return payload?.features ?? [];
}

function textContent(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textContent).join('');
  if (React.isValidElement(value)) {
    return textContent((value.props as { children?: unknown }).children);
  }
  return '';
}

function capturedInput(predicate: (props: Record<string, unknown>) => boolean) {
  const input = jsxCapture.elements.find(
    (element) => element.type === 'input' && predicate(element.props),
  );
  if (!input) throw new Error('expected captured Toolbox input');
  return input;
}

function capturedButton(label: string): { props: Record<string, unknown> } {
  const button = jsxCapture.elements.find(
    (element) => element.type === 'button' && textContent(element.props.children).includes(label),
  );
  if (!button) throw new Error(`expected captured Toolbox button "${label}"`);
  return button;
}

function clickCapturedButton(label: string): void {
  const button = capturedButton(label);
  expect(button.props.disabled).not.toBe(true);
  const onClick = button.props.onClick;
  if (typeof onClick !== 'function') throw new Error(`button "${label}" has no click handler`);
  onClick();
}

function cloneDrawPoints(points: readonly (readonly [number, number])[]): Array<[number, number]> {
  return points.map((point) => [point[0], point[1]]);
}

function installImmediateRaf() {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
    queueMicrotask(() => callback(0));
    return 1;
  });
}

async function flushAsync(turns = 6) {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

describe('Toolbox E2E', () => {
  it('renders geometry stats and tolerance controls from committed lane and road geometry', () => {
    const { lane, road, draft } = highPointMap();
    seedEntities(lane, road, draft);

    const html = renderToolboxForCapture();

    expect(html).toContain('工具箱');
    expectMetric(html, '实体', '2');
    expectMetric(html, '曲线', '4');
    expectMetric(html, '点数', '36');
    expect(html).toContain('道路点数下采样');
    expect(html).toContain('type="range"');
    expect(html).toContain('min="0.01"');
    expect(html).toContain('max="5"');
    expect(html).toContain('step="0.01"');
    expect(html).toContain('aria-label="误差范围（米）"');
    expect(html).toContain('value="0.25"');
    expect(html).toContain('应用下采样');
    expect(html).toContain('重算派生字段');
    expect(html).toContain('重算 Overlap');

    const rangeInput = capturedInput((props) => props.type === 'range');
    const numberInput = capturedInput((props) => props['aria-label'] === '误差范围（米）');
    expect(rangeInput.props).toMatchObject({
      min: '0.01',
      max: '5',
      step: '0.01',
      value: 0.25,
      disabled: false,
    });
    expect(numberInput.props).toMatchObject({
      type: 'number',
      min: '0.01',
      max: '100',
      step: '0.05',
      value: '0.25',
      disabled: false,
    });
    expect(capturedButton('应用下采样').props.disabled).toBe(false);
    expect(numberInput.props.onChange).toEqual(expect.any(Function));
    expect(rangeInput.props.onChange).toEqual(expect.any(Function));
  });

  it('invokes the rendered Toolbox action buttons and clears task progress', async () => {
    installImmediateRaf();
    const { lane, road } = highPointMap();
    seedEntities(lane, road);
    const simplifyBeforeSize = entities().size;
    renderToolboxForCapture();

    clickCapturedButton('应用下采样');
    expect(useTaskProgressStore.getState().activeTask).toMatchObject({
      id: 'toolbox:simplify',
      label: '工具箱处理中',
      progress: null,
      visibleAfterMs: 300,
    });

    await vi.waitFor(() => {
      expect(collectGeometryStats(entities())).toEqual({
        entityCount: 2,
        curveCount: 4,
        pointCount: 8,
      });
      expect(entities().size).toBe(simplifyBeforeSize);
      expect(useTaskProgressStore.getState().activeTask).toBeNull();
    });
    expectMetric(renderToolboxForCapture(), '点数', '8');

    const staleLane = makeLane(
      'lane_action_derive',
      [point(0, 0), point(10, 0), point(20, 0)],
      999,
    );
    seedEntities(staleLane);
    const deriveBeforeStats = collectGeometryStats(entities());
    const deriveBeforeSize = entities().size;
    renderToolboxForCapture();

    clickCapturedButton('重算派生字段');
    expect(useTaskProgressStore.getState().activeTask).toMatchObject({
      id: 'toolbox:derive',
      label: '工具箱处理中',
      progress: null,
      visibleAfterMs: 300,
    });

    await vi.waitFor(() => {
      expect(laneEntity(staleLane.id).length).not.toBe(999);
      expect(collectGeometryStats(entities())).toEqual(deriveBeforeStats);
      expect(entities().size).toBe(deriveBeforeSize);
      expect(useTaskProgressStore.getState().activeTask).toBeNull();
    });

    installRealReconcileWorker();
    const { lane: overlapLane, crosswalk, overlapId } = overlapFixture();
    seedEntities(overlapLane, crosswalk);
    const overlapBeforeStats = collectGeometryStats(entities());
    const overlapBeforeSize = entities().size;
    renderToolboxForCapture();

    clickCapturedButton('重算 Overlap');
    expect(useTaskProgressStore.getState().activeTask).toMatchObject({
      id: 'toolbox:overlap',
      label: '工具箱处理中',
      progress: null,
      visibleAfterMs: 300,
    });

    await vi.waitFor(() => {
      expect(entity(overlapId).entityType).toBe('overlap');
      expect(collectGeometryStats(entities())).toEqual(overlapBeforeStats);
      expect(entities().size).toBe(overlapBeforeSize + 1);
      expect(useTaskProgressStore.getState().activeTask).toBeNull();
    });
  });

  it('applies downsampling through the core/store batch path and keeps entity count stable', () => {
    const { lane, road, draft } = highPointMap();
    seedEntities(lane, road, draft);
    const before = collectGeometryStats(entities());
    const beforeSize = entities().size;

    const result = simplifyRoadGeometry(entities(), { toleranceMeters: 0.1 });
    const changed = useMapStore.getState().updateEntities(result.changes);
    const after = collectGeometryStats(entities());

    expect(result.before).toEqual({ entityCount: 2, curveCount: 4, pointCount: 36 });
    expect(result.after).toEqual({ entityCount: 2, curveCount: 4, pointCount: 8 });
    expect(changed).toBe(2);
    expect(after).toEqual(result.after);
    expect(after.entityCount).toBe(before.entityCount);
    expect(after.curveCount).toBe(before.curveCount);
    expect(after.pointCount).toBeLessThan(before.pointCount);
    expect(entities().size).toBe(beforeSize);
    expect(entities().get(draft.id)).toBe(draft);

    useMapStore.temporal.getState().undo();

    expect(collectGeometryStats(entities())).toEqual(before);
    expect(entities().size).toBe(beforeSize);
    expect(entities().get(draft.id)).toBe(draft);
  });

  it('treats non-positive simplify tolerance as a no-op before applying map changes', () => {
    const { lane, road } = highPointMap();
    seedEntities(lane, road);
    const before = collectGeometryStats(entities());

    const zero = simplifyRoadGeometry(entities(), { toleranceMeters: 0 });
    const negative = simplifyRoadGeometry(entities(), { toleranceMeters: -1 });

    expect(zero.changes.size).toBe(0);
    expect(zero.before).toEqual(before);
    expect(zero.after).toEqual(before);
    expect(negative.changes.size).toBe(0);
    expect(negative.after).toEqual(before);
  });

  it('recomputes derived fields without changing geometry stats', () => {
    const staleLane = makeLane('lane_derive_1', [point(0, 0), point(10, 0), point(20, 0)], 999);
    seedEntities(staleLane);
    const before = collectGeometryStats(entities());
    const beforeSize = entities().size;

    const result = rederiveEditableGeometry(entities());
    const changed = useMapStore.getState().updateEntities(result.changes);
    const after = collectGeometryStats(entities());
    const updated = laneEntity(staleLane.id);

    expect(changed).toBe(1);
    expect(after).toEqual(before);
    expect(entities().size).toBe(beforeSize);
    expect(updated.length).toBeGreaterThan(19);
    expect(updated.length).toBeLessThan(21);
    expect(updated.length).not.toBe(999);
  });

  it('recomputes Overlap through the Toolbox async store action and preserves geometry stats', async () => {
    installRealReconcileWorker();
    const { lane, crosswalk, overlapId } = overlapFixture();
    seedEntities(lane, crosswalk);
    const beforeStats = collectGeometryStats(entities());
    const beforeEntityCount = entities().size;

    const stats = await useMapStore.getState().recomputeOverlapsAsync();
    await flushAsync();

    expect(stats).toMatchObject({
      pairsTested: 1,
      pairsMatched: 1,
      overlapsCreated: 1,
      overlapsRemoved: 0,
    });
    expect(RealReconcileWorker.instances).toHaveLength(1);
    expect(RealReconcileWorker.instances[0]?.terminated).toBe(true);
    expect(entities().size).toBe(beforeEntityCount + 1);
    expect(collectGeometryStats(entities())).toEqual(beforeStats);

    const overlap = entity(overlapId) as OverlapEntity;
    expect(overlap.entityType).toBe('overlap');
    expect(overlap.objects.map((object) => object.objectId).sort()).toEqual([
      crosswalk.id,
      lane.id,
    ]);
    expect(overlap.regionOverlaps).toHaveLength(1);
    expect(overlap.regionOverlaps[0]?.polygons[0]?.points.length).toBeGreaterThanOrEqual(3);
    expect((entity(lane.id) as LaneEntity).overlapIds).toContain(overlapId);
    expect((entity(crosswalk.id) as CrosswalkEntity).overlapIds).toContain(overlapId);
  });

  it('blocks store mutation commits in read-only license state', async () => {
    const promptActivation = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { lane, road } = highPointMap();
    seedEntities(lane, road);
    setReadOnlyLicense(promptActivation);
    installRealReconcileWorker();
    const beforeMap = entities();
    const beforeStats = collectGeometryStats(beforeMap);
    const beforeSize = beforeMap.size;
    const html = renderToolboxForCapture();

    const simplifyResult = simplifyRoadGeometry(entities(), { toleranceMeters: 0.1 });
    const simplifyChanged = useMapStore.getState().updateEntities(simplifyResult.changes);
    const deriveResult = rederiveEditableGeometry(entities());
    const deriveChanged = useMapStore.getState().updateEntities(deriveResult.changes);
    const overlapStats = await useMapStore.getState().recomputeOverlapsAsync();

    expect(useLicenseStore.getState().state.canEdit).toBe(false);
    expect(html).toContain('应用下采样');
    expect(html).toContain('重算派生字段');
    expect(html).toContain('重算 Overlap');
    expect(simplifyResult.changes.size).toBeGreaterThan(0);
    expect(deriveResult.changes.size).toBeGreaterThan(0);
    expect(simplifyChanged).toBe(0);
    expect(deriveChanged).toBe(0);
    expect(overlapStats).toBeNull();
    expect(RealReconcileWorker.instances).toHaveLength(0);
    expect(entities()).toBe(beforeMap);
    expect(entities().size).toBe(beforeSize);
    expect(collectGeometryStats(entities())).toEqual(beforeStats);
    expect(laneEntity(lane.id).length).toBe(999);
    expect(promptActivation).toHaveBeenCalledTimes(3);
  });

  it('keeps uncommitted draw overlay state outside Toolbox geometry operations', async () => {
    installImmediateRaf();
    const actor = createActor(editorMachine);
    const setData = vi.fn();
    const getSource = vi.fn((id: string) => (id === 'overlay' ? { setData } : undefined));
    const map = {
      getSource,
    };
    actor.start();
    actor.send({ type: 'SELECT_TOOL', tool: 'drawPolyline', element: 'lane' });
    actor.send({ type: 'MOUSE_DOWN', point: [116, 39.9] });
    actor.send({ type: 'MOUSE_DOWN', point: [116.0001, 39.9] });
    actor.send({ type: 'MOUSE_MOVE', point: [116.0002, 39.9] });

    const drawnPoints = cloneDrawPoints(actor.getSnapshot().context.drawPoints);
    const rendered = renderOverlayFrame({
      map: map as never,
      mapLoaded: true,
      actorRef: actor,
      lastRenderState: null,
    });
    const setDataCalls = setData.mock.calls.length;

    expect(rendered?.currentState).toBe('drawPolyline');
    expect(getSource).toHaveBeenCalledWith('overlay');
    expect(getOverlayFeatures(setData).length).toBeGreaterThan(0);

    const expectOverlayStable = () => {
      const afterToolRender = renderOverlayFrame({
        map: map as never,
        mapLoaded: true,
        actorRef: actor,
        lastRenderState: rendered,
      });
      expect(afterToolRender).toBe(rendered);
      expect(setData).toHaveBeenCalledTimes(setDataCalls);
      expect(actor.getSnapshot().value).toBe('drawPolyline');
      expect(cloneDrawPoints(actor.getSnapshot().context.drawPoints)).toEqual(drawnPoints);
    };

    const { lane, road } = highPointMap();
    seedEntities(lane, road);
    const simplifyBeforeSize = entities().size;
    renderToolboxForCapture();
    clickCapturedButton('应用下采样');
    await vi.waitFor(() => {
      expect(collectGeometryStats(entities())).toEqual({
        entityCount: 2,
        curveCount: 4,
        pointCount: 8,
      });
      expect(entities().size).toBe(simplifyBeforeSize);
      expect(useTaskProgressStore.getState().activeTask).toBeNull();
    });
    expectOverlayStable();

    const staleLane = makeLane(
      'lane_overlay_derive',
      [point(0, 0), point(10, 0), point(20, 0)],
      999,
    );
    seedEntities(staleLane);
    const deriveBeforeStats = collectGeometryStats(entities());
    const deriveBeforeSize = entities().size;
    renderToolboxForCapture();
    clickCapturedButton('重算派生字段');
    await vi.waitFor(() => {
      expect(laneEntity(staleLane.id).length).not.toBe(999);
      expect(collectGeometryStats(entities())).toEqual(deriveBeforeStats);
      expect(entities().size).toBe(deriveBeforeSize);
      expect(useTaskProgressStore.getState().activeTask).toBeNull();
    });
    expectOverlayStable();

    installRealReconcileWorker();
    const { lane: overlapLane, crosswalk, overlapId } = overlapFixture();
    seedEntities(overlapLane, crosswalk);
    const overlapBeforeStats = collectGeometryStats(entities());
    const overlapBeforeSize = entities().size;
    renderToolboxForCapture();
    clickCapturedButton('重算 Overlap');
    await vi.waitFor(() => {
      expect(entity(overlapId).entityType).toBe('overlap');
      expect(collectGeometryStats(entities())).toEqual(overlapBeforeStats);
      expect(entities().size).toBe(overlapBeforeSize + 1);
      expect(useTaskProgressStore.getState().activeTask).toBeNull();
    });
    expectOverlayStable();

    useUIStore.getState().setLayerLocked('lane', true);
    renderOverlayFrame({
      map: map as never,
      mapLoaded: true,
      actorRef: actor,
      lastRenderState: rendered,
    });

    expect(getOverlayFeatures(setData)).toEqual([]);
    actor.stop();
  });
});
