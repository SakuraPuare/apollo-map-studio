import type { DockviewApi } from 'dockview-react';
import type { AppMode } from '@/store/uiStore';

export type WorkspacePanelId = 'map' | 'sidebar' | 'inspector' | 'timeline';

interface PanelDefinition {
  id: WorkspacePanelId;
  component: WorkspacePanelId;
  defaultTitle: string;
}

const PANEL_DEFS: Record<WorkspacePanelId, PanelDefinition> = {
  map: { id: 'map', component: 'map', defaultTitle: 'Map Editor' },
  sidebar: { id: 'sidebar', component: 'sidebar', defaultTitle: 'Outline' },
  inspector: { id: 'inspector', component: 'inspector', defaultTitle: 'Inspector' },
  timeline: { id: 'timeline', component: 'timeline', defaultTitle: 'Timeline' },
};

const LAYOUT_KEY_BY_MODE: Record<AppMode, string> = {
  drawing: 'ams-layout-v3-drawing',
  scene: 'ams-layout-v3-scene',
};

export function isWorkspacePanelId(id: string): id is WorkspacePanelId {
  return id === 'map' || id === 'sidebar' || id === 'inspector' || id === 'timeline';
}

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
  const mapPanel = api.addPanel({
    id: PANEL_DEFS.map.id,
    component: PANEL_DEFS.map.component,
    title: PANEL_DEFS.map.defaultTitle,
  });
  api.addPanel({
    id: PANEL_DEFS.sidebar.id,
    component: PANEL_DEFS.sidebar.component,
    title: PANEL_DEFS.sidebar.defaultTitle,
    position: { referencePanel: mapPanel, direction: 'left' },
  });
  api.addPanel({
    id: PANEL_DEFS.inspector.id,
    component: PANEL_DEFS.inspector.component,
    title: PANEL_DEFS.inspector.defaultTitle,
    position: { referencePanel: mapPanel, direction: 'right' },
  });
  api.getPanel('sidebar')?.api.setSize({ width: 240 });
  api.getPanel('inspector')?.api.setSize({ width: 280 });

  if (mode === 'scene') {
    api.addPanel({
      id: PANEL_DEFS.timeline.id,
      component: PANEL_DEFS.timeline.component,
      title: PANEL_DEFS.timeline.defaultTitle,
      position: { referencePanel: mapPanel, direction: 'below' },
    });
    api.getPanel('timeline')?.api.setSize({ height: 180 });
  }
}

export function openWorkspacePanel(
  api: DockviewApi,
  panelId: WorkspacePanelId,
  options: { title?: string } = {},
) {
  const existing = api.getPanel(panelId);
  if (existing) {
    if (options.title) existing.api.setTitle(options.title);
    existing.focus();
    return existing;
  }

  const def = PANEL_DEFS[panelId];
  const title = options.title ?? def.defaultTitle;
  const referencePanel = getReferencePanel(api, panelId);
  const position = referencePanel
    ? { referencePanel, direction: getPanelDirection(panelId) }
    : undefined;

  const panel = api.addPanel({
    id: def.id,
    component: def.component,
    title,
    position,
  });

  if (panelId === 'sidebar') panel.api.setSize({ width: 240 });
  if (panelId === 'inspector') panel.api.setSize({ width: 280 });
  if (panelId === 'timeline') panel.api.setSize({ height: 180 });
  return panel;
}

export function closeWorkspacePanel(api: DockviewApi, panelId: WorkspacePanelId): boolean {
  const panel = api.getPanel(panelId);
  if (!panel) return false;
  api.removePanel(panel);
  return true;
}

function getReferencePanel(api: DockviewApi, panelId: WorkspacePanelId) {
  if (panelId === 'map') return api.activePanel;
  if (panelId === 'sidebar') {
    return (
      api.getPanel('map') ?? api.getPanel('inspector') ?? api.getPanel('timeline') ?? undefined
    );
  }
  if (panelId === 'inspector') {
    return api.getPanel('map') ?? api.getPanel('sidebar') ?? api.getPanel('timeline') ?? undefined;
  }
  return api.getPanel('map') ?? api.getPanel('sidebar') ?? api.getPanel('inspector') ?? undefined;
}

function getPanelDirection(panelId: WorkspacePanelId) {
  if (panelId === 'sidebar') return 'left';
  if (panelId === 'timeline') return 'below';
  return 'right';
}
