import React from 'react';
import type * as JsxDevRuntime from 'react/jsx-dev-runtime';
import type * as JsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectGeometryStats,
  rederiveEditableGeometry,
  simplifyRoadGeometry,
  type GeometryToolStats,
} from '@/core/toolbox';
import type { LicenseState } from '@/lib/license-bridge';
import { useLicenseStore } from '@/store/licenseStore';
import { useMapStore } from '@/store/mapStore';
import { useTaskProgressStore } from '@/store/taskProgressStore';
import type { Curve, LaneEntity, RoadEntity } from '@/types/apollo';
import type { GeoPoint, MapEntity, PolylineEntity } from '@/types/entities';
import { SearchPanel } from '../SearchPanel';
import { ToolboxPanel, ToolboxPanelView, type BusyTool } from '../ToolboxPanel';

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

const sidebarMock = vi.hoisted(() => ({
  state: {
    activeTab: 'search',
    setActiveTab: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
  },
}));

vi.mock('@/context/SidebarContext', () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => children,
  useSidebar: () => sidebarMock.state,
}));

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

const P0: GeoPoint = { x: 116.1, y: 39.1 };
const P1: GeoPoint = { x: 116.2, y: 39.2 };
const P2: GeoPoint = { x: 116.3, y: 39.3 };
const P3: GeoPoint = { x: 116.4, y: 39.4 };

function render(node: React.ReactElement) {
  return renderToStaticMarkup(node);
}

function renderForCapture(node: React.ReactElement) {
  jsxCapture.elements = [];
  return render(node);
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
  useLicenseStore.setState({
    state: editableLicenseState,
    initialized: true,
    promptActivation: () => {},
  });
  sidebarMock.state.searchQuery = '';
  sidebarMock.state.setActiveTab.mockReset();
  sidebarMock.state.setSearchQuery.mockReset();
  jsxCapture.elements = [];
}

beforeEach(() => {
  resetStores();
  mockClientStoreSnapshot();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetStores();
});

function curve(points: GeoPoint[]): Curve {
  return { segments: [{ lineSegment: { points } }] };
}

function lane(id: string, centerPoints: GeoPoint[] = [P0, P1, P2]): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: curve(centerPoints),
    leftBoundary: { curve: curve([P0, P1]), length: 10, boundaryType: [] },
    rightBoundary: { curve: curve([P2, P3]), length: 10, boundaryType: [] },
    length: 10,
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
    leftSamples: [],
    rightSamples: [],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

function road(id: string): RoadEntity {
  return {
    id,
    entityType: 'road',
    sections: [
      {
        id: `${id}-section`,
        laneIds: [],
        boundary: {
          outerPolygon: {
            edges: [{ type: 'NORMAL', curve: curve([P0, P1, P2, P3]) }],
          },
          holes: [
            {
              edges: [{ type: 'NORMAL', curve: curve([P1, P2]) }],
            },
          ],
        },
      },
    ],
    junctionId: null,
    type: 'CITY_ROAD',
  };
}

function polyline(id: string): PolylineEntity {
  return { id, entityType: 'polyline', points: [P0, P1, P2] };
}

function setEntities(entities: MapEntity[]) {
  useMapStore.setState({
    entities: new Map(entities.map((entity) => [entity.id, entity])),
  });
}

function expectMetric(html: string, label: string, value: string) {
  expect(html).toMatch(new RegExp(`${label}</div><div[^>]*>${value}</div>`));
}

function expectToolboxActions(html: string) {
  expect(html).toContain('应用下采样');
  expect(html).toContain('重算派生字段');
  expect(html).toContain('重算 Overlap');
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
  if (!input) throw new Error('expected captured input');
  return input.props;
}

function capturedButton(label: string) {
  const button = jsxCapture.elements.find(
    (element) => element.type === 'button' && textContent(element.props.children).includes(label),
  );
  if (!button) throw new Error(`expected captured button "${label}"`);
  return button.props;
}

function capturedButtons() {
  return jsxCapture.elements
    .filter((element) => element.type === 'button')
    .map((element) => element.props);
}

function clickCapturedButton(label: string): void {
  const props = capturedButton(label);
  expect(props.disabled).not.toBe(true);
  const onClick = props.onClick;
  if (typeof onClick !== 'function') throw new Error(`expected "${label}" click handler`);
  onClick();
}

function changeCapturedInput(props: Record<string, unknown>, value: string): void {
  const onChange = props.onChange;
  if (typeof onChange !== 'function') throw new Error('expected input change handler');
  onChange({ target: { value } });
}

function toolboxView({
  stats = { entityCount: 0, curveCount: 0, pointCount: 0 },
  toleranceMeters = '0.25',
  busyTool = null,
  result = null,
  onToleranceMetersChange = vi.fn(),
  onSimplify = vi.fn(),
  onRederive = vi.fn(),
  onOverlap = vi.fn(),
}: {
  stats?: GeometryToolStats;
  toleranceMeters?: string;
  busyTool?: BusyTool | null;
  result?: React.ComponentProps<typeof ToolboxPanelView>['result'];
  onToleranceMetersChange?: (value: string) => void;
  onSimplify?: (toleranceMeters: number) => void;
  onRederive?: () => void;
  onOverlap?: () => void;
} = {}) {
  return (
    <ToolboxPanelView
      stats={stats}
      toleranceMeters={toleranceMeters}
      busyTool={busyTool}
      result={result}
      onToleranceMetersChange={onToleranceMetersChange}
      onSimplify={onSimplify}
      onRederive={onRederive}
      onOverlap={onOverlap}
    />
  );
}

describe('ToolboxPanel SSR rendering', () => {
  it('renders empty map metrics and editable action controls', () => {
    const html = render(<ToolboxPanel />);

    expect(html).toContain('工具箱');
    expectMetric(html, '实体', '0');
    expectMetric(html, '曲线', '0');
    expectMetric(html, '点数', '0');
    expectToolboxActions(html);
    expect(html.match(/<button/g) ?? []).toHaveLength(3);
    expect(html).not.toContain('disabled=""');
  });

  it('renders populated geometry metrics while ignoring non-road drawing entities', () => {
    setEntities([lane('lane-main'), road('road-main'), polyline('draft-polyline')]);

    const html = render(<ToolboxPanel />);

    expectMetric(html, '实体', '2');
    expectMetric(html, '曲线', '5');
    expectMetric(html, '点数', '13');
    expectToolboxActions(html);
  });

  it('renders downsampling controls and wires tolerance/button handlers', () => {
    const onToleranceMetersChange = vi.fn();
    const onSimplify = vi.fn();
    const onRederive = vi.fn();
    const onOverlap = vi.fn();

    const html = renderForCapture(
      toolboxView({
        stats: { entityCount: 2, curveCount: 5, pointCount: 13 },
        toleranceMeters: '1.5',
        onToleranceMetersChange,
        onSimplify,
        onRederive,
        onOverlap,
      }),
    );

    expect(html).toContain('道路点数下采样');
    expect(html).toContain('误差范围 m');
    expect(html).toContain('aria-label="误差范围（米）"');
    expectToolboxActions(html);

    const rangeInput = capturedInput((props) => props.type === 'range');
    const numberInput = capturedInput((props) => props['aria-label'] === '误差范围（米）');
    expect(rangeInput).toMatchObject({
      min: '0.01',
      max: '5',
      step: '0.01',
      value: 1.5,
      disabled: false,
    });
    expect(numberInput).toMatchObject({
      type: 'number',
      min: '0.01',
      max: '100',
      step: '0.05',
      value: '1.5',
      disabled: false,
    });

    changeCapturedInput(rangeInput, '2.25');
    changeCapturedInput(numberInput, '0.75');
    clickCapturedButton('应用下采样');
    clickCapturedButton('重算派生字段');
    clickCapturedButton('重算 Overlap');

    expect(onToleranceMetersChange).toHaveBeenNthCalledWith(1, '2.25');
    expect(onToleranceMetersChange).toHaveBeenNthCalledWith(2, '0.75');
    expect(onSimplify).toHaveBeenCalledWith(1.5);
    expect(onRederive).toHaveBeenCalledTimes(1);
    expect(onOverlap).toHaveBeenCalledTimes(1);
  });

  it('disables simplify for invalid tolerance while leaving maintenance controls enabled', () => {
    renderForCapture(toolboxView({ toleranceMeters: 'not-a-number' }));

    expect(capturedInput((props) => props.type === 'range')).toMatchObject({
      value: 0.25,
      disabled: false,
    });
    expect(capturedInput((props) => props['aria-label'] === '误差范围（米）')).toMatchObject({
      value: 'not-a-number',
      disabled: false,
    });
    expect(capturedButton('应用下采样').disabled).toBe(true);
    expect(capturedButton('重算派生字段').disabled).toBe(false);
    expect(capturedButton('重算 Overlap').disabled).toBe(false);
  });

  it.each([
    ['simplify', '处理中'],
    ['derive', '处理中'],
    ['overlap', '处理中'],
  ] as const)('disables controls while %s is busy', (busyTool, busyLabel) => {
    const html = renderForCapture(toolboxView({ busyTool }));

    expect(html).toContain(busyLabel);
    expect(capturedInput((props) => props.type === 'range').disabled).toBe(true);
    expect(capturedInput((props) => props['aria-label'] === '误差范围（米）').disabled).toBe(true);
    expect(capturedButtons()).toHaveLength(3);
    for (const button of capturedButtons()) {
      expect(button.disabled).toBe(true);
    }
  });

  it('renders ok, warn, and error result strips from geometry actions', () => {
    const ok = render(
      toolboxView({
        result: {
          tone: 'ok',
          title: '道路点数下采样',
          detail: '已更新 2 个实体，点数 13 -> 10',
        },
      }),
    );
    const warn = render(
      toolboxView({
        result: {
          tone: 'warn',
          title: 'Overlap 重算',
          detail: '当前地图没有实体',
        },
      }),
    );
    const error = render(
      toolboxView({
        result: {
          tone: 'error',
          title: '工具执行失败',
          detail: 'worker unavailable',
        },
      }),
    );

    expect(ok).toContain('border-emerald-400/20');
    expect(ok).toContain('道路点数下采样');
    expect(warn).toContain('border-amber-400/20');
    expect(warn).toContain('当前地图没有实体');
    expect(error).toContain('border-red-400/20');
    expect(error).toContain('worker unavailable');
  });

  it('applies geometry maintenance results for populated maps and no-ops for empty maps', () => {
    expect(collectGeometryStats(useMapStore.getState().entities)).toEqual({
      entityCount: 0,
      curveCount: 0,
      pointCount: 0,
    });
    expect(simplifyRoadGeometry(useMapStore.getState().entities, { toleranceMeters: 1 })).toEqual({
      changes: new Map(),
      before: { entityCount: 0, curveCount: 0, pointCount: 0 },
      after: { entityCount: 0, curveCount: 0, pointCount: 0 },
    });
    expect(rederiveEditableGeometry(useMapStore.getState().entities).changes.size).toBe(0);

    const staleLane = lane('lane-stale');
    setEntities([staleLane, road('road-main'), polyline('draft-polyline')]);
    const before = collectGeometryStats(useMapStore.getState().entities);
    const simplifyResult = simplifyRoadGeometry(useMapStore.getState().entities, {
      toleranceMeters: 0.1,
    });
    const simplified = useMapStore.getState().updateEntities(simplifyResult.changes);
    const afterSimplify = collectGeometryStats(useMapStore.getState().entities);

    expect(before).toEqual({ entityCount: 2, curveCount: 5, pointCount: 13 });
    expect(simplifyResult.changes.size).toBeGreaterThan(0);
    expect(simplified).toBe(simplifyResult.changes.size);
    expect(afterSimplify.entityCount).toBe(before.entityCount);
    expect(afterSimplify.pointCount).toBeLessThan(before.pointCount);

    const staleDerivedLane = lane('lane-derived');
    setEntities([staleDerivedLane]);
    const deriveResult = rederiveEditableGeometry(useMapStore.getState().entities);
    const derived = useMapStore.getState().updateEntities(deriveResult.changes);

    expect(deriveResult.changes.size).toBeGreaterThan(0);
    expect(derived).toBe(1);
    expect(
      (useMapStore.getState().entities.get(staleDerivedLane.id) as LaneEntity).length,
    ).not.toBe(staleDerivedLane.length);
    expect(collectGeometryStats(useMapStore.getState().entities)).toEqual(deriveResult.after);
  });

  it('keeps toolbox actions visible in read-only store state', () => {
    const promptActivation = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setEntities([lane('lane-readonly'), road('road-readonly')]);
    useLicenseStore.setState({
      state: readOnlyLicenseState,
      initialized: true,
      promptActivation,
    });
    const beforeMap = useMapStore.getState().entities;
    const beforeStats = collectGeometryStats(beforeMap);

    const html = render(<ToolboxPanel />);
    const simplifyResult = simplifyRoadGeometry(useMapStore.getState().entities, {
      toleranceMeters: 0.1,
    });
    const deriveResult = rederiveEditableGeometry(useMapStore.getState().entities);

    expect(useLicenseStore.getState().state.canEdit).toBe(false);
    expectToolboxActions(html);
    expectMetric(html, '实体', '2');
    expect(simplifyResult.changes.size).toBeGreaterThan(0);
    expect(deriveResult.changes.size).toBeGreaterThan(0);
    expect(useMapStore.getState().updateEntities(simplifyResult.changes)).toBe(0);
    expect(useMapStore.getState().updateEntities(deriveResult.changes)).toBe(0);
    expect(useMapStore.getState().entities).toBe(beforeMap);
    expect(collectGeometryStats(useMapStore.getState().entities)).toEqual(beforeStats);
    expect(promptActivation).toHaveBeenCalledTimes(2);
  });
});

describe('SearchPanel SSR rendering', () => {
  it('renders matching entities and selected result state', () => {
    const longLaneId = 'lane-with-a-very-long-stable-identifier-1234567890';
    sidebarMock.state.searchQuery = 'lane';
    setEntities([lane(longLaneId), lane('lane-short'), road('road-main')]);

    const html = render(<SearchPanel selectedId={longLaneId} />);

    expect(html).toContain('value="lane"');
    expect(html).toContain('2 matches');
    expect(html).toContain(`title="${longLaneId}"`);
    expect(html).toContain(`…${longLaneId.slice(-18)}`);
    expect(html).toContain('lane-short');
    expect(html).toContain('bg-cyan-500/15');
  });

  it('renders no-match state for a populated map query with no results', () => {
    sidebarMock.state.searchQuery = 'traffic-light';
    setEntities([lane('lane-main'), road('road-main')]);

    const html = render(<SearchPanel selectedId="lane-main" />);

    expect(html).toContain('value="traffic-light"');
    expect(html).toContain('0 matches');
    expect(html).toContain('No matches');
    expect(html).not.toContain('bg-cyan-500/15');
  });
});
