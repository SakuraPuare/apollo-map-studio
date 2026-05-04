import type { DockviewApi } from 'dockview-react';
import type { AppMode } from '@/store/uiStore';
import {
  getWorkspacePanelDefs,
  getWorkspacePanelDef,
  isWorkspacePanelId,
  isWorkspacePanelAvailable,
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
  const panels = getWorkspacePanelDefs(mode);
  const editorDef = panels.find((panel) => panel.zone === 'editor');
  if (!editorDef) throw new Error(`No editor panel is available for mode: ${mode}`);

  const editorPanel = api.addPanel({
    id: editorDef.id,
    component: editorDef.component,
    title: editorDef.defaultTitle,
  });
  applyPanelDefaultSize(editorPanel, editorDef.defaultSize);

  for (const panel of panels.filter((candidate) => candidate.id !== editorDef.id)) {
    const dockPanel = api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.defaultTitle,
      position: {
        referencePanel: editorPanel,
        direction: getPanelDirection(panel),
      },
    });
    applyPanelDefaultSize(dockPanel, panel.defaultSize);
  }
}

export function openWorkspacePanel(
  api: DockviewApi,
  panelId: WorkspacePanelId,
  options: { mode?: AppMode; title?: string } = {},
) {
  const existing = api.getPanel(panelId);
  if (existing) {
    if (options.title) existing.api.setTitle(options.title);
    existing.focus();
    return existing;
  }

  const def = getWorkspacePanelDef(panelId);
  if (!isWorkspacePanelAvailable(def, options.mode)) return undefined;
  const title = options.title ?? def.defaultTitle;
  const referencePanel = getReferencePanel(api, panelId);
  const position = referencePanel
    ? { referencePanel, direction: getPanelDirection(def) }
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
  const def = getWorkspacePanelDef(panelId);
  if (def.zone === 'editor') return api.activePanel;
  return getWorkspacePanelDefs()
    .filter((candidate) => candidate.id !== panelId)
    .map((candidate) => api.getPanel(candidate.id))
    .find(Boolean);
}

function getPanelDirection(panel: ReturnType<typeof getWorkspacePanelDef>) {
  if (panel.zone === 'primarySidebar') return 'left';
  if (panel.zone === 'bottomPanel') return 'below';
  return 'right';
}

function applyPanelDefaultSize(
  panel: ReturnType<DockviewApi['getPanel']>,
  size: { width?: number; height?: number } | undefined,
) {
  if (!panel || !size) return;
  panel.api.setSize(size);
}
