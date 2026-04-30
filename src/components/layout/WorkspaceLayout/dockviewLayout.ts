import type { DockviewApi } from 'dockview-react';
import type { AppMode } from '@/store/uiStore';

const LAYOUT_KEY_BY_MODE: Record<AppMode, string> = {
  drawing: 'ams-layout-v3-drawing',
  scene: 'ams-layout-v3-scene',
};

export function clearSavedLayout(mode: AppMode) {
  localStorage.removeItem(LAYOUT_KEY_BY_MODE[mode]);
}

export function saveLayout(api: DockviewApi, mode: AppMode) {
  try {
    localStorage.setItem(LAYOUT_KEY_BY_MODE[mode], JSON.stringify(api.toJSON()));
  } catch {
    /* ignore */
  }
}

export function loadLayout(api: DockviewApi, mode: AppMode): boolean {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY_BY_MODE[mode]);
    if (saved) {
      api.fromJSON(JSON.parse(saved));
      return true;
    }
  } catch {
    clearSavedLayout(mode);
  }
  return false;
}

export function createDefaultLayout(api: DockviewApi, mode: AppMode) {
  const mapPanel = api.addPanel({ id: 'map', component: 'map', title: 'Map Editor' });
  api.addPanel({
    id: 'sidebar',
    component: 'sidebar',
    title: 'Sidebar',
    position: { referencePanel: mapPanel, direction: 'left' },
  });
  api.addPanel({
    id: 'inspector',
    component: 'inspector',
    title: 'Inspector',
    position: { referencePanel: mapPanel, direction: 'right' },
  });
  api.getPanel('sidebar')?.api.setSize({ width: 240 });
  api.getPanel('inspector')?.api.setSize({ width: 280 });

  if (mode === 'scene') {
    api.addPanel({
      id: 'timeline',
      component: 'timeline',
      title: 'Timeline',
      position: { referencePanel: mapPanel, direction: 'below' },
    });
    api.getPanel('timeline')?.api.setSize({ height: 180 });
  }
}
