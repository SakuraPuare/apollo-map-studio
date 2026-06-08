import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBuiltinWorkspaceContributions } from '@/components/layout/workspaceContributions';
import {
  clearAllSavedLayouts,
  clearSavedLayout,
  closeWorkspacePanel,
  createDefaultLayout,
  loadLayout,
  openWorkspacePanel,
  saveLayout,
} from '../dockviewLayout';
import type { AppMode } from '@/store/uiStore';

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

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

beforeEach(() => {
  registerBuiltinWorkspaceContributions();
  localStorageMock.clear();
  vi.clearAllMocks();
});

describe('dockviewLayout storage cleanup', () => {
  it('clears the saved layout for one app mode', () => {
    clearSavedLayout('drawing');

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('apollo-map-studio:layout:drawing');
  });

  it('clears every layout key', () => {
    clearAllSavedLayouts();

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('apollo-map-studio:layout:drawing');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('apollo-map-studio:layout:scene');
  });
});

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
  panels = new Map<string, FakePanel>();
  addCalls: AddPanelOptions[] = [];
  removeCalls: FakePanel[] = [];
  activePanel: FakePanel | undefined;
  toJSON = vi.fn(() => ({ grid: { root: 'layout' } }));
  fromJSON = vi.fn((layout: { panelIds?: string[] }) => {
    for (const id of layout.panelIds ?? []) {
      this.addPanel({ id, component: id, title: id });
    }
  });
  clear = vi.fn(() => {
    this.panels.clear();
  });

  addPanel(options: AddPanelOptions): FakePanel {
    this.addCalls.push(options);
    const panel = new FakePanel(options.id, options.component, options.title, options.position);
    this.panels.set(options.id, panel);
    this.activePanel = panel;
    return panel;
  }

  getPanel(id: string): FakePanel | undefined {
    return this.panels.get(id);
  }

  removePanel(panel: FakePanel): void {
    this.removeCalls.push(panel);
    this.panels.delete(panel.id);
  }
}

function api(): FakeDockviewApi {
  return new FakeDockviewApi();
}

describe('dockviewLayout persistence', () => {
  it('saves a serialized layout under the app-mode-specific key', () => {
    const dockview = api();

    saveLayout(dockview as never, 'scene');

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'apollo-map-studio:layout:scene',
      JSON.stringify({ grid: { root: 'layout' } }),
    );
  });

  it('loads a valid saved layout and clears corrupted JSON', () => {
    const dockview = api();
    localStorageMock.setItem(
      'apollo-map-studio:layout:drawing',
      JSON.stringify({ panelIds: ['map'] }),
    );

    expect(loadLayout(dockview as never, 'drawing')).toBe(true);
    expect(dockview.fromJSON).toHaveBeenCalledWith({ panelIds: ['map'] });

    localStorageMock.setItem('apollo-map-studio:layout:drawing', '{bad json');
    expect(loadLayout(dockview as never, 'drawing')).toBe(false);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('apollo-map-studio:layout:drawing');
    expect(dockview.clear).toHaveBeenCalled();
    expect(dockview.panels.size).toBe(0);
  });

  it('clears saved layouts that restore without the editor panel', () => {
    const dockview = api();
    localStorageMock.setItem(
      'apollo-map-studio:layout:drawing',
      JSON.stringify({ panelIds: ['sidebar', 'inspector'] }),
    );

    expect(loadLayout(dockview as never, 'drawing')).toBe(false);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('apollo-map-studio:layout:drawing');
    expect(dockview.clear).toHaveBeenCalled();
    expect(dockview.panels.size).toBe(0);
  });

  it('clears saved layouts that restore panels unavailable in the current mode', () => {
    const dockview = api();
    localStorageMock.setItem(
      'apollo-map-studio:layout:drawing',
      JSON.stringify({ panelIds: ['map', 'timeline'] }),
    );

    expect(loadLayout(dockview as never, 'drawing')).toBe(false);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('apollo-map-studio:layout:drawing');
  });

  it('clears real Dockview layouts whose panel record or views reference mode-unavailable panels', () => {
    const dockview = api();
    const layout = {
      panels: {
        map: { contentComponent: 'map' },
        timeline: { contentComponent: 'timeline' },
      },
      grid: {
        root: {
          type: 'branch',
          data: [
            {
              type: 'leaf',
              views: ['map', 'timeline'],
              activeView: 'map',
            },
          ],
        },
      },
    };
    localStorageMock.setItem('apollo-map-studio:layout:drawing', JSON.stringify(layout));

    expect(loadLayout(dockview as never, 'drawing')).toBe(false);
    expect(dockview.fromJSON).not.toHaveBeenCalled();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('apollo-map-studio:layout:drawing');
  });

  it('returns false when no layout is saved', () => {
    expect(loadLayout(api() as never, 'drawing')).toBe(false);
  });

  it('ignores localStorage write failures when saving a layout', () => {
    const dockview = api();
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });

    expect(() => saveLayout(dockview as never, 'drawing')).not.toThrow();
  });
});

describe('dockviewLayout default panels', () => {
  it.each([
    ['drawing', ['map', 'sidebar', 'inspector', 'toolbox']],
    ['scene', ['map', 'sidebar', 'inspector', 'toolbox', 'timeline']],
  ] satisfies Array<[AppMode, string[]]>)(
    'creates default %s panels in registry order',
    (mode, expectedPanelIds) => {
      const dockview = api();

      createDefaultLayout(dockview as never, mode);

      expect(dockview.addCalls.map((call) => call.id)).toEqual(expectedPanelIds);
      expect(dockview.addCalls[0]!.position).toBeUndefined();
      expect(dockview.addCalls[1]!.position?.direction).toBe('left');
      expect(dockview.addCalls[2]!.position?.direction).toBe('right');
      expect(dockview.addCalls.at(-1)!.position?.direction).toBe(
        mode === 'scene' ? 'below' : 'right',
      );
      expect(dockview.getPanel('sidebar')!.api.setSize).toHaveBeenCalledWith({ width: 220 });
      expect(dockview.getPanel('inspector')!.api.setSize).toHaveBeenCalledWith({ width: 280 });
      expect(dockview.getPanel('toolbox')!.api.setSize).toHaveBeenCalledWith({ width: 320 });
      if (mode === 'scene') {
        expect(dockview.getPanel('timeline')!.api.setSize).toHaveBeenCalledWith({ height: 180 });
      }
    },
  );
});

describe('dockviewLayout open/close helpers', () => {
  it('focuses and retitles an existing panel instead of adding a duplicate', () => {
    const dockview = api();
    const existing = dockview.addPanel({
      id: 'sidebar',
      component: 'sidebar-panel',
      title: 'Outline',
    });

    const opened = openWorkspacePanel(dockview as never, 'sidebar', {
      title: 'Search',
      mode: 'drawing',
    });

    expect(opened).toBe(existing);
    expect(existing.api.setTitle).toHaveBeenCalledWith('Search');
    expect(existing.focus).toHaveBeenCalledTimes(1);
    expect(dockview.addCalls).toHaveLength(1);
  });

  it('adds a new panel relative to an existing workspace panel', () => {
    const dockview = api();
    const editor = dockview.addPanel({
      id: 'map',
      component: 'map',
      title: 'Map',
    });

    const opened = openWorkspacePanel(dockview as never, 'inspector', { mode: 'drawing' });

    expect(opened?.id).toBe('inspector');
    expect(dockview.addCalls.at(-1)).toMatchObject({
      id: 'inspector',
      component: 'inspector',
      title: 'Inspector',
      position: {
        referencePanel: editor,
        direction: 'right',
      },
    });
    expect(opened?.api.setSize).toHaveBeenCalledWith({ width: 280 });
  });

  it('does not open panels unavailable in the current mode', () => {
    const dockview = api();

    expect(openWorkspacePanel(dockview as never, 'timeline', { mode: 'drawing' })).toBeUndefined();
    expect(dockview.addCalls).toHaveLength(0);
  });

  it('uses the active panel as reference when opening an editor-zone panel', () => {
    const dockview = api();
    const active = dockview.addPanel({
      id: 'sidebar',
      component: 'sidebar-panel',
      title: 'Outline',
    });

    openWorkspacePanel(dockview as never, 'map', { mode: 'drawing' });

    expect(dockview.addCalls.at(-1)!.position).toEqual({
      referencePanel: active,
      direction: 'right',
    });
  });

  it('opens a panel without a position when no reference panel exists', () => {
    const dockview = api();

    const opened = openWorkspacePanel(dockview as never, 'sidebar', { mode: 'drawing' });

    expect(opened?.id).toBe('sidebar');
    expect(dockview.addCalls.at(-1)).toMatchObject({
      id: 'sidebar',
      component: 'sidebar',
      title: 'Outline',
    });
    expect(dockview.addCalls.at(-1)!.position).toBeUndefined();
  });

  it('closes existing panels and reports whether a panel was removed', () => {
    const dockview = api();
    const panel = dockview.addPanel({
      id: 'toolbox',
      component: 'toolbox-panel',
      title: 'Toolbox',
    });

    expect(closeWorkspacePanel(dockview as never, 'toolbox')).toBe(true);
    expect(dockview.removeCalls).toEqual([panel]);
    expect(closeWorkspacePanel(dockview as never, 'toolbox')).toBe(false);
  });
});
