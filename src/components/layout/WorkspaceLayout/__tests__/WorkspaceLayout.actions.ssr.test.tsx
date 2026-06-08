import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DockviewReadyEvent } from 'dockview-react';
import { WorkspaceLayout } from '../../WorkspaceLayout';
import type { ActionId } from '@/core/actions/registry';
import { registerBuiltinWorkspaceContributions } from '@/components/layout/workspaceContributions';
import { useUIStore, type AppMode } from '@/store/uiStore';

interface AddPanelOptions {
  id: string;
  component: string;
  title: string;
  position?: {
    referencePanel: FakePanel;
    direction: string;
  };
}

class FakePanel {
  focus = vi.fn();
  api = {
    setTitle: vi.fn((title: string) => {
      this.title = title;
    }),
    setSize: vi.fn((size: { width?: number; height?: number }) => {
      this.size = size;
    }),
  };
  size: { width?: number; height?: number } | undefined;

  constructor(
    public readonly id: string,
    public readonly component: string,
    public title: string,
    public readonly position?: AddPanelOptions['position'],
  ) {}
}

class FakeDockviewApi {
  private panelMap = new Map<string, FakePanel>();
  addCalls: AddPanelOptions[] = [];
  removeCalls: FakePanel[] = [];
  clear = vi.fn(() => {
    this.panelMap.clear();
    this.activePanel = undefined;
  });
  activePanel: FakePanel | undefined;
  toJSON = vi.fn(() => ({ panelIds: [...this.panelMap.keys()] }));
  fromJSON = vi.fn();
  onDidLayoutChange = vi.fn();

  get panels(): FakePanel[] {
    return [...this.panelMap.values()];
  }

  addPanel(options: AddPanelOptions): FakePanel {
    this.addCalls.push(options);
    const panel = new FakePanel(options.id, options.component, options.title, options.position);
    this.panelMap.set(options.id, panel);
    this.activePanel = panel;
    return panel;
  }

  getPanel(id: string): FakePanel | undefined {
    return this.panelMap.get(id);
  }

  removePanel(panel: FakePanel): void {
    this.removeCalls.push(panel);
    this.panelMap.delete(panel.id);
  }
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

let capturedExecute: ((actionId: ActionId) => void) | null = null;
let capturedOnReady: ((event: DockviewReadyEvent) => void) | null = null;
let capturedOnTabChange: ((tab: string) => void) | null = null;
let mockActiveTab = 'outline';
const setActiveTabMock = vi.fn((tab: string) => {
  mockActiveTab = tab;
});

vi.mock('dockview-react', () => ({
  DockviewReact: ({ onReady }: { onReady: (event: DockviewReadyEvent) => void }) => {
    capturedOnReady = onReady;
    return createElement('dockview-stub');
  },
}));

vi.mock('@/components/layout/ActivityBar', () => ({
  ActivityBar: ({
    onTabChange,
  }: {
    activeTab: string;
    appMode: AppMode;
    onTabChange: (tab: string) => void;
  }) => {
    capturedOnTabChange = onTabChange;
    return null;
  },
}));

vi.mock('@/context/SidebarContext', () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) =>
    createElement('sidebar-provider-stub', null, children),
  useSidebar: () => ({
    activeTab: mockActiveTab,
    setActiveTab: setActiveTabMock,
    searchQuery: '',
    setSearchQuery: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLicense', () => ({
  useLicenseSync: vi.fn(),
}));

vi.mock('@/hooks/useDesktopWindowState', () => ({
  useDesktopWindowState: () => null,
}));

vi.mock('@/lib/app-bridge', () => ({
  isDesktopRuntime: () => false,
  appBridge: {
    onNativeMenuAction: () => () => undefined,
    openHelp: vi.fn(),
  },
}));

vi.mock('@/components/license/LicenseBanner', () => ({
  LicenseBanner: () => null,
}));

vi.mock('@/components/license/ActivationDialog', () => ({
  ActivationDialog: () => null,
}));

vi.mock('@/components/dialogs/AboutDialog', () => ({
  AboutDialog: () => null,
}));

vi.mock('@/components/layout/DesktopTitleBar', () => ({
  DesktopTitleBar: () => null,
}));

vi.mock('@/components/layout/StatusBar', () => ({
  StatusBar: () => null,
}));

vi.mock('@/components/layout/TaskProgressOverlay', () => ({
  TaskProgressOverlay: () => null,
}));

vi.mock('@/components/layout/ToolStrip', () => ({
  ToolStrip: () => null,
}));

vi.mock('@/components/layout/MenuBar', () => ({
  MenuBar: ({
    onExecute,
  }: {
    onExecute: (actionId: ActionId) => void;
    getToggleState: (actionId: ActionId) => boolean;
  }) => {
    capturedExecute = onExecute;
    return null;
  },
}));

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

const initialUIState = useUIStore.getState();

function renderWorkspaceWithDockview(mode: AppMode = 'drawing') {
  useUIStore.setState({ ...initialUIState, appMode: mode }, true);
  const dockview = new FakeDockviewApi();

  renderToStaticMarkup(createElement(WorkspaceLayout));

  if (!capturedOnReady) throw new Error('Dockview onReady was not captured');
  capturedOnReady({ api: dockview as never } as DockviewReadyEvent);

  if (!capturedExecute) throw new Error('Workspace action executor was not captured');

  return {
    dockview,
    execute: capturedExecute,
    changeTab: capturedOnTabChange,
  };
}

describe('WorkspaceLayout action to Dockview integration without jsdom', () => {
  beforeEach(() => {
    registerBuiltinWorkspaceContributions();
    localStorageMock.clear();
    vi.clearAllMocks();
    capturedExecute = null;
    capturedOnReady = null;
    capturedOnTabChange = null;
    mockActiveTab = 'outline';
    useUIStore.setState(initialUIState, true);
  });

  it('opens and closes workspace panel actions through the Dockview API', () => {
    const { dockview, execute } = renderWorkspaceWithDockview('drawing');

    expect(dockview.addCalls.map((call) => call.id)).toEqual([
      'map',
      'sidebar',
      'inspector',
      'toolbox',
    ]);

    execute('view:inspector');

    expect(dockview.getPanel('inspector')).toBeUndefined();
    expect(dockview.removeCalls.map((panel) => panel.id)).toContain('inspector');

    execute('view:inspector');

    const reopened = dockview.getPanel('inspector');
    expect(reopened).toBeDefined();
    expect(dockview.addCalls.at(-1)).toMatchObject({
      id: 'inspector',
      component: 'inspector',
      title: 'Inspector',
      position: {
        direction: 'right',
      },
    });
    expect(reopened?.api.setSize).toHaveBeenCalledWith({ width: 280 });
  });

  it('routes sidebar view actions to the shared sidebar panel title and active toggle state', () => {
    const { dockview, execute } = renderWorkspaceWithDockview('drawing');
    const sidebar = dockview.getPanel('sidebar');
    const initialAddCount = dockview.addCalls.length;

    expect(sidebar?.title).toBe('Outline');

    execute('view:search');

    expect(dockview.getPanel('sidebar')).toBe(sidebar);
    expect(setActiveTabMock).toHaveBeenCalledWith('search');
    expect(sidebar?.api.setTitle).toHaveBeenCalledWith('Search');
    expect(sidebar?.focus).toHaveBeenCalledTimes(1);
    expect(dockview.addCalls).toHaveLength(initialAddCount);
  });

  it('opens modal activity tabs without reopening the sidebar panel', () => {
    const { dockview, changeTab } = renderWorkspaceWithDockview('drawing');
    const sidebar = dockview.getPanel('sidebar');

    if (!changeTab) throw new Error('ActivityBar onTabChange was not captured');
    dockview.removePanel(sidebar!);

    changeTab('settings');

    expect(dockview.getPanel('sidebar')).toBeUndefined();
    expect(dockview.addCalls.map((call) => call.id)).toEqual([
      'map',
      'sidebar',
      'inspector',
      'toolbox',
    ]);
    expect(setActiveTabMock).toHaveBeenCalledWith('outline');
  });

  it('closes a sidebar view action when its tab is already active', () => {
    const { dockview, execute } = renderWorkspaceWithDockview('drawing');

    execute('view:outline');

    expect(dockview.getPanel('sidebar')).toBeUndefined();
    expect(dockview.removeCalls.map((panel) => panel.id)).toContain('sidebar');
  });

  it('ignores mode-unavailable workspace actions before touching Dockview', () => {
    const { dockview, execute } = renderWorkspaceWithDockview('drawing');

    execute('view:timeline');

    expect(dockview.getPanel('timeline')).toBeUndefined();
    expect(dockview.addCalls.map((call) => call.id)).toEqual([
      'map',
      'sidebar',
      'inspector',
      'toolbox',
    ]);
  });

  it('resets the active mode layout by clearing saved state and rebuilding default panels', () => {
    const { dockview, execute } = renderWorkspaceWithDockview('drawing');

    expect(dockview.addCalls.map((call) => call.id)).toEqual([
      'map',
      'sidebar',
      'inspector',
      'toolbox',
    ]);

    execute('view:inspector');
    expect(dockview.getPanel('inspector')).toBeUndefined();

    execute('resetLayout');

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('apollo-map-studio:layout:drawing');
    expect(dockview.clear).toHaveBeenCalledTimes(1);
    expect(dockview.panels.map((panel) => panel.id)).toEqual([
      'map',
      'sidebar',
      'inspector',
      'toolbox',
    ]);
    expect(dockview.getPanel('inspector')?.api.setSize).toHaveBeenCalledWith({ width: 280 });
  });
});
