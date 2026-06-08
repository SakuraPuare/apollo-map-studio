import React from 'react';
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

beforeEach(() => {
  useUIStore.setState(initialUIState, true);
  resetScenarioStore();
  vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Windows' });
  _resetIsMacCache();
  mockClientStoreSnapshot();
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
});
