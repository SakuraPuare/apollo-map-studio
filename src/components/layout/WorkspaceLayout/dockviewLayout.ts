import type { DockviewApi } from 'dockview-react';
import type { AppMode } from '@/store/uiStore';
import {
  getWorkspacePanelDef,
  isWorkspacePanelId,
  type WorkspacePanelId,
} from '@/core/workspaceViews';

const LAYOUT_KEY_BY_MODE: Record<AppMode, string> = {
  drawing: 'ams-layout-v3-drawing',
  scene: 'ams-layout-v3-scene',
};

export { isWorkspacePanelId };
export type { WorkspacePanelId };

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
  const mapDef = getWorkspacePanelDef('map');
  const sidebarDef = getWorkspacePanelDef('sidebar');
  const inspectorDef = getWorkspacePanelDef('inspector');
  const timelineDef = getWorkspacePanelDef('timeline');
  const mapPanel = api.addPanel({
    id: mapDef.id,
    component: mapDef.component,
    title: mapDef.defaultTitle,
  });
  api.addPanel({
    id: sidebarDef.id,
    component: sidebarDef.component,
    title: sidebarDef.defaultTitle,
    position: { referencePanel: mapPanel, direction: 'left' },
  });
  api.addPanel({
    id: inspectorDef.id,
    component: inspectorDef.component,
    title: inspectorDef.defaultTitle,
    position: { referencePanel: mapPanel, direction: 'right' },
  });
  applyPanelDefaultSize(api.getPanel('sidebar'), sidebarDef.defaultSize);
  applyPanelDefaultSize(api.getPanel('inspector'), inspectorDef.defaultSize);

  if (mode === 'scene') {
    api.addPanel({
      id: timelineDef.id,
      component: timelineDef.component,
      title: timelineDef.defaultTitle,
      position: { referencePanel: mapPanel, direction: 'below' },
    });
    applyPanelDefaultSize(api.getPanel('timeline'), timelineDef.defaultSize);
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

  const def = getWorkspacePanelDef(panelId);
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

  applyPanelDefaultSize(panel, def.defaultSize);
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

function applyPanelDefaultSize(
  panel: ReturnType<DockviewApi['getPanel']>,
  size: { width?: number; height?: number } | undefined,
) {
  if (!panel || !size) return;
  panel.api.setSize(size);
}
