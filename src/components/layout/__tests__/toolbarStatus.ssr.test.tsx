import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBuiltinWorkspaceContributions } from '@/components/layout/workspaceContributions';
import type { DrawTool } from '@/core/fsm/editorMachine';
import type { MapElementType } from '@/core/elements';
import type { ActionId } from '@/core/actions/registry';
import { buildActionHandlers, createActionExecutor } from '@/hooks/useActionDispatcher';
import { useSceneToolStore } from '@/store/sceneToolStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';
import { MenuBar } from '../MenuBar';
import { ToolStrip } from '../ToolStrip';
import { StatusBar } from '../StatusBar';

registerBuiltinWorkspaceContributions();

const initialUIState = useUIStore.getState();
const initialSettingsState = useSettingsStore.getState();
const initialSceneToolState = useSceneToolStore.getState();

function mockClientStoreSnapshot() {
  vi.spyOn(React, 'useSyncExternalStore').mockImplementation(((
    _subscribe: unknown,
    getSnapshot: () => unknown,
  ) => getSnapshot()) as typeof React.useSyncExternalStore);
}

function render(node: React.ReactElement) {
  return renderToStaticMarkup(node);
}

function actorStub() {
  return {
    send: vi.fn(),
    getSnapshot: vi.fn(() => ({
      value: 'idle',
      context: { activeElement: null, selectedEntityId: null },
    })),
  };
}

function renderToolStrip({
  currentTool = 'idle',
  currentElement = null,
  onExecuteAction = vi.fn(),
  getToggleState = () => false,
  onOpenCommandPalette = vi.fn(),
}: {
  currentTool?: string;
  currentElement?: MapElementType | null;
  onExecuteAction?: (actionId: ActionId) => void;
  getToggleState?: (actionId: ActionId) => boolean;
  onOpenCommandPalette?: () => void;
} = {}) {
  return render(
    <ToolStrip
      currentTool={currentTool}
      currentElement={currentElement}
      onSelectTool={vi.fn<(tool: DrawTool, element?: MapElementType) => void>()}
      onOpenCommandPalette={onOpenCommandPalette}
      onExecuteAction={onExecuteAction}
      getToggleState={getToggleState}
    />,
  );
}

function buttonPattern(label: string, pressed?: boolean): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pressedLookahead =
    pressed === undefined ? '' : `(?=[^>]*\\baria-pressed="${String(pressed)}")`;
  return new RegExp(`<button\\b(?=[^>]*\\baria-label="${escaped}")${pressedLookahead}[^>]*>`);
}

function statusTogglePattern(label: string, enabled: boolean): RegExp {
  return new RegExp(
    `<div\\b(?=[^>]*\\baria-label="${label} ${enabled ? 'enabled' : 'disabled'}")` +
      `(?=[^>]*\\bdata-testid="status-toggle-${label.toLowerCase()}")` +
      `(?=[^>]*\\bdata-enabled="${String(enabled)}")[^>]*>`,
  );
}

function statusFieldPattern(testId: string, text: string): RegExp {
  const escapedTestId = testId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `<span\\b(?=[^>]*\\bdata-testid="${escapedTestId}")[^>]*>\\s*${escapedText}\\s*</span>`,
  );
}

beforeEach(() => {
  useSettingsStore.setState(initialSettingsState, true);
  useUIStore.setState(initialUIState, true);
  useSceneToolStore.setState(initialSceneToolState, true);
  mockClientStoreSnapshot();
});

afterEach(() => {
  vi.restoreAllMocks();
  useSceneToolStore.setState(initialSceneToolState, true);
  useUIStore.setState(initialUIState, true);
  useSettingsStore.setState(initialSettingsState, true);
});

describe('toolbar/status SSR interaction coverage', () => {
  it('keeps MenuBar, ToolStrip, and StatusBar in sync when the app mode changes', () => {
    useUIStore.setState({ appMode: 'drawing' });

    const drawingMenu = render(<MenuBar onExecute={vi.fn()} getToggleState={() => false} />);
    const drawingToolbar = renderToolStrip();
    const drawingStatus = render(<StatusBar mode="idle" entityCount={0} />);

    expect(drawingMenu).toMatch(
      /<button\b(?=[^>]*\bdata-testid="mode-drawing")(?=[^>]*\baria-pressed="true")[^>]*>/,
    );
    expect(drawingToolbar).toMatch(buttonPattern('Map Elements', false));
    expect(drawingToolbar).not.toMatch(buttonPattern('放置车辆'));
    expect(drawingStatus).toMatch(statusFieldPattern('status-app-mode', '绘图'));

    useUIStore.getState().toggleConnectMode();
    useUIStore.getState().toggleBoundaryBrush();
    expect(useUIStore.getState().boundaryBrush.active).toBe(true);

    useUIStore.getState().setAppMode('scene');

    const sceneMenu = render(<MenuBar onExecute={vi.fn()} getToggleState={() => false} />);
    const sceneToolbar = renderToolStrip();
    const sceneStatus = render(<StatusBar mode="idle" entityCount={0} />);

    expect(sceneMenu).toMatch(
      /<button\b(?=[^>]*\bdata-testid="mode-scene")(?=[^>]*\baria-pressed="true")[^>]*>/,
    );
    expect(sceneToolbar).toMatch(buttonPattern('放置车辆', false));
    expect(sceneToolbar).not.toMatch(buttonPattern('Map Elements'));
    expect(sceneStatus).toMatch(statusFieldPattern('status-app-mode', '场景'));
    expect(useUIStore.getState().connectMode.active).toBe(false);
    expect(useUIStore.getState().boundaryBrush.active).toBe(false);
  });

  it('renders drawing toolbar active states for mode, element, draw tool, grid, and snap', () => {
    useUIStore.setState({ appMode: 'drawing' });

    const html = renderToolStrip({
      currentTool: 'drawBezier',
      currentElement: 'lane',
      getToggleState: (actionId) => actionId === 'defaultMode' || actionId === 'toggleGrid',
    });

    expect(html).toMatch(buttonPattern('Map Elements', true));
    expect(html).toMatch(buttonPattern('Connect Lanes', false));
    expect(html).toMatch(buttonPattern('Boundary Brush', false));
    expect(html).toMatch(buttonPattern('车道', true));
    expect(html).toMatch(buttonPattern('车道 · Draw Bezier', true));
    expect(html).toMatch(buttonPattern('车道 · Draw Arc', false));
    expect(html).toMatch(buttonPattern('Toggle Grid', true));
    expect(html).toMatch(buttonPattern('Toggle Snap', false));
    expect(html).toMatch(buttonPattern('Command Palette'));
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-keyshortcuts="Meta+K Control+K"');
  });

  it('switches ToolStrip from drawing tools to scene tools and preserves scene active state', () => {
    useUIStore.setState({ appMode: 'scene' });
    useSceneToolStore.setState({ tool: 'placeVehicle' });

    const html = renderToolStrip();

    expect(html).toMatch(buttonPattern('选择', false));
    expect(html).toMatch(buttonPattern('放置车辆', true));
    expect(html).toMatch(buttonPattern('画轨迹（双击/Enter 结束）', false));
    expect(html).toMatch(buttonPattern('设置主车起点', false));
    expect(html).not.toMatch(buttonPattern('Map Elements'));
    expect(html).not.toMatch(buttonPattern('Connect Lanes'));
    expect(html).not.toMatch(buttonPattern('Boundary Brush'));
    expect(html).not.toMatch(buttonPattern('车道'));
    expect(html).not.toMatch(buttonPattern('车道 · Draw Bezier'));
    expect(html).toMatch(buttonPattern('Toggle Grid', false));
    expect(html).toMatch(buttonPattern('Toggle Snap', false));
  });

  it('updates StatusBar mode, entity count, app mode, and grid/snap indicators from props and store', () => {
    useUIStore.setState({
      appMode: 'scene',
      gridEnabled: false,
      snapEnabled: true,
      cursorLngLat: [116.1234567, 39.7654321],
      currentZoom: 19.25,
    });

    const html = render(<StatusBar mode="drawPolyline" entityCount={3} />);

    expect(html).toMatch(statusFieldPattern('status-app-mode', '场景'));
    expect(html).toMatch(statusFieldPattern('status-editor-mode', 'Scene'));
    expect(html).toMatch(statusFieldPattern('status-entity-count', '3'));
    expect(html).toMatch(statusTogglePattern('Grid', false));
    expect(html).toMatch(statusTogglePattern('Snap', true));
    expect(html).toContain('116.123457, 39.765432');
    expect(html).toContain('19.3x');
  });

  it('uses toolbar action ids to toggle grid/snap stores and StatusBar output through the dispatcher', () => {
    const onOpenCommandPalette = vi.fn();
    const execute = createActionExecutor(
      buildActionHandlers({
        actorRef: actorStub() as never,
        onOpenCommandPalette,
        onOpenSettings: vi.fn(),
        onOpenAbout: vi.fn(),
        onResetLayout: vi.fn(),
        onToggleWorkspaceView: vi.fn(),
        getWorkspaceViewState: vi.fn(() => false),
      }),
    );

    const before = renderToolStrip({
      onExecuteAction: execute,
      getToggleState: (actionId) => {
        if (actionId === 'toggleGrid') return useUIStore.getState().gridEnabled;
        if (actionId === 'toggleSnap') return useUIStore.getState().snapEnabled;
        return actionId === 'defaultMode';
      },
    });
    expect(before).toMatch(buttonPattern('Toggle Grid', true));
    expect(before).toMatch(buttonPattern('Toggle Snap', false));

    execute('toggleGrid');
    execute('toggleSnap');
    execute('commandPalette');

    expect(useUIStore.getState().gridEnabled).toBe(false);
    expect(useUIStore.getState().snapEnabled).toBe(true);
    expect(useSettingsStore.getState().gridEnabled).toBe(false);
    expect(useSettingsStore.getState().snapEnabled).toBe(true);
    expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);

    const afterToolbar = renderToolStrip({
      onExecuteAction: execute,
      getToggleState: (actionId) => {
        if (actionId === 'toggleGrid') return useUIStore.getState().gridEnabled;
        if (actionId === 'toggleSnap') return useUIStore.getState().snapEnabled;
        return actionId === 'defaultMode';
      },
    });
    expect(afterToolbar).toMatch(buttonPattern('Toggle Grid', false));
    expect(afterToolbar).toMatch(buttonPattern('Toggle Snap', true));

    const afterStatus = render(<StatusBar mode="idle" entityCount={0} />);
    expect(afterStatus).toMatch(statusTogglePattern('Grid', false));
    expect(afterStatus).toMatch(statusTogglePattern('Snap', true));
  });
});
