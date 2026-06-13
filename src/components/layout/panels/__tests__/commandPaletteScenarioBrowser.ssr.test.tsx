import React from 'react';
import type * as JsxDevRuntime from 'react/jsx-dev-runtime';
import type * as JsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBuiltinWorkspaceContributions } from '@/components/layout/workspaceContributions';
import { _resetIsMacCache } from '@/core/actions/registry/helpers';
import { makeBlankScenario } from '@/io/scenario/factory';
import { useScenarioStore, type LoadedScenario } from '@/store/scenarioStore';
import { useUIStore } from '@/store/uiStore';
import type {
  ObstacleKind,
  ScenarioDoc,
  ScenarioObstacle,
  ScenarioTrafficLight,
} from '@/types/scenario';
import { CommandPalette } from '../CommandPalette';
import { ScenarioBrowser } from '../ScenarioBrowser';

registerBuiltinWorkspaceContributions();

const jsxCapture = vi.hoisted(() => ({
  elements: [] as Array<{ type: unknown; props: Record<string, unknown> }>,
}));

const scenarioLoaderMock = vi.hoisted(() => ({
  loadScenariosFromPicker: vi.fn(),
  saveActiveScenario: vi.fn(),
  newScenarioFromUI: vi.fn(),
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

vi.mock('@/io/scenario/scenarioLoader', () => scenarioLoaderMock);

const initialUIState = useUIStore.getState();

function resetScenarioStore() {
  useScenarioStore.setState({
    loaded: [],
    activeKey: null,
    projString: null,
    selectedObstacleUid: null,
    selectedTrafficLightUid: null,
    selectedKind: null,
  });
  useScenarioStore.temporal.getState().clear();
}

function mockClientStoreSnapshot() {
  vi.spyOn(React, 'useSyncExternalStore').mockImplementation(((
    _subscribe: unknown,
    getSnapshot: () => unknown,
  ) => getSnapshot()) as typeof React.useSyncExternalStore);
}

function render(node: React.ReactElement) {
  return renderToStaticMarkup(node);
}

function renderForCapture(node: React.ReactElement) {
  jsxCapture.elements = [];
  return render(node);
}

function renderPalette() {
  return render(
    <CommandPalette
      open
      onOpenChange={vi.fn()}
      onExecute={vi.fn()}
      getToggleState={(actionId) => actionId === 'toggleGrid'}
    />,
  );
}

function obstacle(
  uid: string,
  name: string,
  apolloId: number,
  kind: ObstacleKind,
  moving = false,
): ScenarioObstacle {
  return {
    uid,
    name,
    apolloId,
    kind,
    dimensions: { length: 4.5, width: 2, height: 1.5 },
    position: { x: apolloId, y: apolloId + 1, h: 0 },
    initialSpeed: moving ? 6 : 0,
    moving,
    trajectory: moving
      ? [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ]
      : [],
    triggerType: 'NA',
    events: [],
    ref: null,
  };
}

function trafficLight(uid: string, signalId: string): ScenarioTrafficLight {
  return {
    uid,
    signalId,
    location: { x: 100, y: 200 },
    triggerType: 'NA',
    initialColor: 'RED',
    stateGroup: [{ color: 'RED', keepTime: 30 }],
    ref: null,
  };
}

function scenarioDoc(
  overrides: Pick<Partial<ScenarioDoc>, 'obstacles' | 'trafficLights'> = {},
): ScenarioDoc {
  return {
    ...makeBlankScenario('openscenario', { mapDir: 'maps/test', simulatorTime: 60 }),
    ...overrides,
  };
}

function loadScenarioBrowserFixtures() {
  const activeDoc = scenarioDoc({
    obstacles: [
      obstacle('ob-1', 'car_alpha', 1, 'vehicle', true),
      obstacle('ob-2', 'person_beta', 2, 'pedestrian'),
    ],
    trafficLights: [trafficLight('tl-1', 'signal_main')],
  });
  const loaded: LoadedScenario[] = [
    { key: 'scene-a', filename: 'scene-a.json', doc: activeDoc },
    { key: 'scene-b', filename: 'scene-b.json', doc: scenarioDoc() },
  ];

  useScenarioStore.setState({
    loaded,
    activeKey: 'scene-a',
    selectedObstacleUid: 'ob-1',
    selectedTrafficLightUid: null,
    selectedKind: 'obstacle',
  });
}

function textContent(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textContent).join('');
  if (React.isValidElement(value)) {
    return textContent((value.props as { children?: unknown }).children);
  }
  return '';
}

function capturedElement(
  type: string,
  predicate: (props: Record<string, unknown>) => boolean,
): { props: Record<string, unknown> } {
  const element = jsxCapture.elements.find(
    (candidate) => candidate.type === type && predicate(candidate.props),
  );
  if (!element) throw new Error(`expected captured ${type}`);
  return element;
}

function capturedButtonByText(text: string): { props: Record<string, unknown> } {
  return capturedElement('button', (props) => textContent(props.children).includes(text));
}

function capturedButtonByLabel(label: string): { props: Record<string, unknown> } {
  return capturedElement('button', (props) => props['aria-label'] === label);
}

async function clickCapturedButton(button: { props: Record<string, unknown> }) {
  const onClick = button.props.onClick;
  if (typeof onClick !== 'function') throw new Error('expected button click handler');
  await onClick();
}

function changeCapturedSelect(select: { props: Record<string, unknown> }, value: string) {
  const onChange = select.props.onChange;
  if (typeof onChange !== 'function') throw new Error('expected select change handler');
  onChange({ target: { value } });
}

beforeEach(() => {
  useUIStore.setState(initialUIState, true);
  resetScenarioStore();
  vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Windows' });
  _resetIsMacCache();
  mockClientStoreSnapshot();
  jsxCapture.elements = [];
  scenarioLoaderMock.loadScenariosFromPicker.mockReset();
  scenarioLoaderMock.saveActiveScenario.mockReset();
  scenarioLoaderMock.newScenarioFromUI.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  _resetIsMacCache();
  useUIStore.setState(initialUIState, true);
  resetScenarioStore();
});

describe('CommandPalette SSR integration', () => {
  it('renders registered commands, shortcut formatting, and toggle state when open', () => {
    useUIStore.setState({ appMode: 'drawing' });

    const html = renderPalette();

    expect(html).toContain('Type a command or search...');
    expect(html).toContain('Draw Polyline');
    expect(html).toContain('Toggle Grid');
    expect(html).toContain('Ctrl+G');
    expect(html).toContain('text-cyan-400');
  });

  it('keeps Mac shortcut glyphs when the platform reports macOS', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Macintosh' });
    _resetIsMacCache();
    useUIStore.setState({ appMode: 'drawing' });

    const html = renderPalette();

    expect(html).toContain('⌘G');
    expect(html).toContain('⇧⌘Z');
    expect(html).not.toContain('Ctrl+G');
  });

  it('filters scene-only workspace actions from the current UI mode', () => {
    useUIStore.setState({ appMode: 'drawing' });
    expect(renderPalette()).not.toContain('Scenarios');
    expect(renderPalette()).not.toContain('Timeline');

    useUIStore.setState({ appMode: 'scene' });
    const sceneHtml = renderPalette();

    expect(sceneHtml).toContain('Scenarios');
    expect(sceneHtml).toContain('Timeline');
  });

  it('renders no markup while closed', () => {
    expect(render(<CommandPalette open={false} onOpenChange={vi.fn()} onExecute={vi.fn()} />)).toBe(
      '',
    );
  });
});

describe('ScenarioBrowser SSR integration', () => {
  it('renders empty browser state and disabled export without a loaded scenario', () => {
    const html = render(<ScenarioBrowser />);

    expect(html).toContain('openscenario');
    expect(html).toContain('classic');
    expect(html).toContain('Apollo');
    expect(html).toContain('disabled=""');
  });

  it('renders loaded scenarios and the active scenario obstacle list from the store', () => {
    loadScenarioBrowserFixtures();

    const html = render(<ScenarioBrowser />);

    expect(html).toContain('scene-a.json');
    expect(html).toContain('scene-b.json');
    expect(html).toContain('car_alpha');
    expect(html).toContain('vehicle');
    expect(html).toContain('person_beta');
    expect(html).toContain('pedestrian');
    expect(html).toContain('动');
    expect(html.match(/aria-current="true"/g)).toHaveLength(2);
  });

  it('does not render the obstacle sublist when the active scenario has no obstacles', () => {
    useScenarioStore.setState({
      loaded: [{ key: 'empty-scene', filename: 'empty-scene.json', doc: scenarioDoc() }],
      activeKey: 'empty-scene',
    });

    const html = render(<ScenarioBrowser />);

    expect(html).toContain('empty-scene.json');
    expect(html).not.toContain('障碍物 (0)');
    expect(html).not.toContain('car_alpha');
  });

  it('invokes toolbar load, new, save, and format handlers without browser E2E', async () => {
    loadScenarioBrowserFixtures();
    scenarioLoaderMock.loadScenariosFromPicker
      .mockResolvedValueOnce({ loaded: 2, failed: [] })
      .mockResolvedValueOnce({ loaded: 1, failed: [{ filename: 'bad.json' }] })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('picker failed'));
    scenarioLoaderMock.newScenarioFromUI
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('new failed'));
    scenarioLoaderMock.saveActiveScenario.mockReturnValueOnce(true).mockReturnValueOnce(false);

    renderForCapture(<ScenarioBrowser />);

    const formatSelect = capturedElement(
      'select',
      (props) => props['aria-label'] === '新建场景格式',
    );
    changeCapturedSelect(formatSelect, 'classic');

    const loadButton = capturedButtonByText('打开场景');
    await clickCapturedButton(loadButton);
    await clickCapturedButton(loadButton);
    await clickCapturedButton(loadButton);
    await clickCapturedButton(loadButton);
    expect(scenarioLoaderMock.loadScenariosFromPicker).toHaveBeenCalledTimes(4);

    const newButton = capturedButtonByText('新建');
    await clickCapturedButton(newButton);
    await clickCapturedButton(newButton);
    await clickCapturedButton(newButton);
    expect(scenarioLoaderMock.newScenarioFromUI).toHaveBeenCalledTimes(3);
    expect(scenarioLoaderMock.newScenarioFromUI).toHaveBeenCalledWith('openscenario');

    const saveButton = capturedButtonByText('导出');
    await clickCapturedButton(saveButton);
    await clickCapturedButton(saveButton);
    expect(scenarioLoaderMock.saveActiveScenario).toHaveBeenCalledTimes(2);
  });

  it('invokes scenario row remove/select and obstacle selection handlers from captured SSR props', async () => {
    loadScenarioBrowserFixtures();
    renderForCapture(<ScenarioBrowser />);

    await clickCapturedButton(capturedButtonByText('scene-b.json'));
    expect(useScenarioStore.getState().activeKey).toBe('scene-b');
    expect(useScenarioStore.getState().selectedObstacleUid).toBeNull();

    await clickCapturedButton(capturedButtonByLabel('移除 scene-b.json'));
    expect(useScenarioStore.getState().loaded.map((entry) => entry.key)).toEqual(['scene-a']);
    expect(useScenarioStore.getState().activeKey).toBe('scene-a');

    await clickCapturedButton(capturedButtonByText('person_beta'));
    expect(useScenarioStore.getState().selectedObstacleUid).toBe('ob-2');

    await clickCapturedButton(capturedButtonByText('car_alpha'));
    expect(useScenarioStore.getState().selectedObstacleUid).toBeNull();
  });
});
