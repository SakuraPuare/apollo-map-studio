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
  drawing: 'apollo-map-studio:layout:drawing',
  scene: 'apollo-map-studio:layout:scene',
};

export { isWorkspacePanelId };
export type { WorkspacePanelId };

export function clearSavedLayout(mode: AppMode) {
  localStorage.removeItem(LAYOUT_KEY_BY_MODE[mode]);
}

export function clearAllSavedLayouts() {
  clearSavedLayout('drawing');
  clearSavedLayout('scene');
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
      const layout = JSON.parse(saved);
      if (!savedLayoutPanelsAreAvailable(layout, mode)) {
        throw new Error('Saved layout contains panels unavailable in the current mode');
      }
      api.fromJSON(layout);
      if (!hasEditorPanel(api, mode)) throw new Error('Saved layout is missing the editor panel');
      return true;
    }
  } catch {
    try {
      api.clear();
    } catch {
      /* ignore */
    }
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

function hasEditorPanel(api: DockviewApi, mode: AppMode): boolean {
  const editorDef = getWorkspacePanelDefs(mode).find((panel) => panel.zone === 'editor');
  return Boolean(editorDef && api.getPanel(editorDef.id));
}

function savedLayoutPanelsAreAvailable(layout: unknown, mode: AppMode): boolean {
  const panelIds = new Set<WorkspacePanelId>();
  collectWorkspacePanelIds(layout, panelIds);
  for (const panelId of panelIds) {
    if (!isWorkspacePanelAvailable(panelId, mode)) return false;
  }
  return true;
}

function collectWorkspacePanelIds(value: unknown, out: Set<WorkspacePanelId>): void {
  if (typeof value === 'string') {
    if (isWorkspacePanelId(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectWorkspacePanelIds(item, out);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'id') collectWorkspacePanelIds(child, out);
    else if (key === 'panelIds') collectWorkspacePanelIds(child, out);
    else if (key === 'views') collectWorkspacePanelIds(child, out);
    else if (key === 'activeView') collectWorkspacePanelIds(child, out);
    else if (key === 'panels') collectWorkspacePanelRecord(child, out);
  }
}

function collectWorkspacePanelRecord(value: unknown, out: Set<WorkspacePanelId>): void {
  if (value === null || typeof value !== 'object') {
    collectWorkspacePanelIds(value, out);
    return;
  }

  for (const [panelId, panel] of Object.entries(value)) {
    if (isWorkspacePanelId(panelId)) out.add(panelId);
    collectWorkspacePanelIds(panel, out);
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
  for (const candidate of getWorkspacePanelDefs()) {
    if (candidate.id === panelId) continue;
    const panel = api.getPanel(candidate.id);
    if (panel) return panel;
  }
  return undefined;
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
