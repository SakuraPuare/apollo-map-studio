import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';

export type WorkspaceMode = 'drawing' | 'scene';
export type WorkspacePanelId = string;
export type WorkspacePanelComponent = string;
export type WorkspaceViewId = string;
export type SidebarViewId = string;
export type WorkspaceViewActionId = `view:${string}`;

export interface WorkspaceContext {
  appMode: WorkspaceMode;
}

export type WorkspaceWhenClause = (context: WorkspaceContext) => boolean;

export interface SidebarViewRenderProps {
  onSelect: (id: string | null) => void;
  selectedId: string | null;
}

export type SidebarViewRenderer = (props: SidebarViewRenderProps) => ReactNode;

export interface WorkspacePanelDef {
  id: WorkspacePanelId;
  component: WorkspacePanelComponent;
  defaultTitle: string;
  defaultSize?: { width?: number; height?: number };
}

export interface WorkspaceViewDef {
  id: WorkspaceViewId;
  actionId: WorkspaceViewActionId;
  label: string;
  icon: IconType;
  menuOrder: number;
  panelId: WorkspacePanelId;
  sidebarViewId?: SidebarViewId;
  when?: WorkspaceWhenClause;
}

export interface SidebarViewDef {
  id: SidebarViewId;
  label: string;
  icon: IconType;
  placement: 'top' | 'bottom';
  order: number;
  kind: 'panel' | 'modal';
  render?: SidebarViewRenderer;
  when?: WorkspaceWhenClause;
}

const workspacePanels = new Map<WorkspacePanelId, WorkspacePanelDef>();
const workspaceViews = new Map<WorkspaceViewId, WorkspaceViewDef>();
const sidebarViews = new Map<SidebarViewId, SidebarViewDef>();

interface RegisterOptions {
  duplicate?: 'error' | 'ignore';
}

export function registerWorkspacePanel(
  panel: WorkspacePanelDef,
  options: RegisterOptions = {},
): void {
  if (workspacePanels.has(panel.id)) {
    if (options.duplicate === 'ignore') return;
    throw new Error(`Duplicate workspace panel: ${panel.id}`);
  }
  workspacePanels.set(panel.id, panel);
}

export function registerWorkspaceView(view: WorkspaceViewDef, options: RegisterOptions = {}): void {
  if (workspaceViews.has(view.id)) {
    if (options.duplicate === 'ignore') return;
    throw new Error(`Duplicate workspace view: ${view.id}`);
  }
  const duplicateAction = [...workspaceViews.values()].find(
    (candidate) => candidate.actionId === view.actionId,
  );
  if (duplicateAction) throw new Error(`Duplicate workspace view action: ${view.actionId}`);
  workspaceViews.set(view.id, view);
}

export function registerSidebarView(view: SidebarViewDef, options: RegisterOptions = {}): void {
  if (sidebarViews.has(view.id)) {
    if (options.duplicate === 'ignore') return;
    throw new Error(`Duplicate sidebar view: ${view.id}`);
  }
  sidebarViews.set(view.id, view);
}

export function getWorkspacePanelDefs(): WorkspacePanelDef[] {
  return [...workspacePanels.values()];
}

export function getWorkspaceViewDefs(): WorkspaceViewDef[] {
  return [...workspaceViews.values()].sort((a, b) => a.menuOrder - b.menuOrder);
}

export function getSidebarViewDefs(): SidebarViewDef[] {
  return [...sidebarViews.values()].sort((a, b) => a.order - b.order);
}

export function isWorkspaceViewActionId(actionId: string): actionId is WorkspaceViewActionId {
  return (
    actionId.startsWith('view:') &&
    getWorkspaceViewDefs().some((view) => view.actionId === actionId)
  );
}

export function isWorkspacePanelId(id: string): id is WorkspacePanelId {
  return workspacePanels.has(id);
}

export function getWorkspacePanelDef(panelId: WorkspacePanelId): WorkspacePanelDef {
  const panel = workspacePanels.get(panelId);
  if (!panel) throw new Error(`Unknown workspace panel: ${panelId}`);
  return panel;
}

export function getWorkspaceViewByActionId(
  actionId: WorkspaceViewActionId,
  mode?: WorkspaceMode,
): WorkspaceViewDef | undefined {
  return getWorkspaceViewDefs().find(
    (view) => view.actionId === actionId && isWorkspaceViewAvailable(view, mode),
  );
}

export function getSidebarViewDef(viewId: SidebarViewId): SidebarViewDef | undefined {
  return sidebarViews.get(viewId);
}

export function getDefaultSidebarViewId(mode?: WorkspaceMode): SidebarViewId {
  const view = getSidebarViewDefs().find(
    (candidate) => candidate.kind === 'panel' && isSidebarViewAvailable(candidate, mode),
  );
  if (!view) throw new Error(`No sidebar panel view is available for mode: ${mode ?? 'any'}`);
  return view.id;
}

export function getSidebarViewsByPlacement(
  placement: SidebarViewDef['placement'],
  mode?: WorkspaceMode,
): SidebarViewDef[] {
  return getSidebarViewDefs().filter(
    (view) => view.placement === placement && isSidebarViewAvailable(view, mode),
  );
}

export function isSidebarViewAvailable(
  view: SidebarViewDef | SidebarViewId,
  mode?: WorkspaceMode,
): boolean {
  const def = typeof view === 'string' ? getSidebarViewDef(view) : view;
  if (!def) return false;
  return isWhenClauseEnabled(def.when, mode);
}

export function isWorkspaceViewAvailable(view: WorkspaceViewDef, mode?: WorkspaceMode): boolean {
  return isWhenClauseEnabled(view.when, mode);
}

function isWhenClauseEnabled(
  when: WorkspaceWhenClause | undefined,
  mode: WorkspaceMode | undefined,
) {
  if (!when) return true;
  if (!mode) return true;
  return when({ appMode: mode });
}
