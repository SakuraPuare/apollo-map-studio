import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';

export type WorkspaceMode = 'drawing' | 'scene';
export type WorkspacePanelId = string;
type WorkspacePanelComponent = string;
type WorkbenchPanelZone = 'editor' | 'primarySidebar' | 'secondarySidebar' | 'bottomPanel';
type WorkspaceViewId = string;
export type SidebarViewId = string;
export type WorkspaceViewActionId = `view:${string}`;

interface WorkspaceContext {
  appMode: WorkspaceMode;
}

type WorkspaceWhenClause = (context: WorkspaceContext) => boolean;

export interface SidebarViewRenderProps {
  onSelect: (id: string | null) => void;
  selectedId: string | null;
}

type SidebarViewRenderer = (props: SidebarViewRenderProps) => ReactNode;

export interface WorkspacePanelDef {
  id: WorkspacePanelId;
  component: WorkspacePanelComponent;
  defaultTitle: string;
  zone: WorkbenchPanelZone;
  order: number;
  defaultSize?: { width?: number; height?: number };
  when?: WorkspaceWhenClause;
}

interface WorkspaceViewActionBase {
  id: WorkspaceViewId;
  actionId: WorkspaceViewActionId;
  label: string;
  icon: IconType;
  menuOrder: number;
  when?: WorkspaceWhenClause;
}

export interface WorkspacePanelViewDef extends WorkspaceViewActionBase {
  kind: 'panel';
  panelId: WorkspacePanelId;
}

interface SidebarWorkspaceViewDef extends WorkspaceViewActionBase {
  kind: 'sidebar';
  panelId: 'sidebar';
  sidebarViewId: SidebarViewId;
}

export type WorkspaceViewDef = WorkspacePanelViewDef | SidebarWorkspaceViewDef;

interface SidebarViewActionDef {
  actionId: WorkspaceViewActionId;
  menuOrder: number;
}

export interface SidebarViewDef {
  id: SidebarViewId;
  label: string;
  icon: IconType;
  placement: 'top' | 'bottom';
  order: number;
  kind: 'panel' | 'modal';
  render?: SidebarViewRenderer;
  action?: SidebarViewActionDef;
  when?: WorkspaceWhenClause;
}

const workspacePanels = new Map<WorkspacePanelId, WorkspacePanelDef>();
const workspacePanelViews = new Map<WorkspaceViewId, WorkspacePanelViewDef>();
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

export function registerWorkspacePanelView(
  view: Omit<WorkspacePanelViewDef, 'kind'>,
  options: RegisterOptions = {},
): void {
  if (workspacePanelViews.has(view.id)) {
    if (options.duplicate === 'ignore') return;
    throw new Error(`Duplicate workspace panel view: ${view.id}`);
  }
  const duplicateAction = getWorkspaceViewDefs().find(
    (candidate) => candidate.actionId === view.actionId,
  );
  if (duplicateAction) throw new Error(`Duplicate workspace view action: ${view.actionId}`);
  workspacePanelViews.set(view.id, { ...view, kind: 'panel' });
}

export function registerSidebarView(view: SidebarViewDef, options: RegisterOptions = {}): void {
  if (sidebarViews.has(view.id)) {
    if (options.duplicate === 'ignore') return;
    throw new Error(`Duplicate sidebar view: ${view.id}`);
  }
  if (view.action) {
    const duplicateAction = getWorkspaceViewDefs().find(
      (candidate) => candidate.actionId === view.action?.actionId,
    );
    if (duplicateAction) {
      throw new Error(`Duplicate workspace view action: ${view.action.actionId}`);
    }
  }
  sidebarViews.set(view.id, view);
}

export function getWorkspacePanelDefs(mode?: WorkspaceMode): WorkspacePanelDef[] {
  return [...workspacePanels.values()]
    .filter((panel) => isWorkspacePanelAvailable(panel, mode))
    .toSorted((a, b) => a.order - b.order);
}

export function getWorkspaceViewDefs(): WorkspaceViewDef[] {
  return [...getSidebarWorkspaceViewDefs(), ...workspacePanelViews.values()].toSorted(
    (a, b) => a.menuOrder - b.menuOrder,
  );
}

function getSidebarWorkspaceViewDefs(): SidebarWorkspaceViewDef[] {
  const result: SidebarWorkspaceViewDef[] = [];
  for (const view of getSidebarViewDefs()) {
    if (view.kind === 'panel' && view.action) {
      result.push({
        id: view.id,
        actionId: view.action.actionId,
        label: view.label,
        icon: view.icon,
        menuOrder: view.action.menuOrder,
        kind: 'sidebar',
        panelId: 'sidebar',
        sidebarViewId: view.id,
        when: view.when,
      });
    }
  }
  return result;
}

function getSidebarViewDefs(): SidebarViewDef[] {
  return [...sidebarViews.values()].toSorted((a, b) => a.order - b.order);
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

function isWorkspaceViewAvailable(view: WorkspaceViewDef, mode?: WorkspaceMode): boolean {
  return isWhenClauseEnabled(view.when, mode);
}

export function isWorkspacePanelAvailable(
  panel: WorkspacePanelDef | WorkspacePanelId,
  mode?: WorkspaceMode,
): boolean {
  const def = typeof panel === 'string' ? workspacePanels.get(panel) : panel;
  if (!def) return false;
  return isWhenClauseEnabled(def.when, mode);
}

function isWhenClauseEnabled(
  when: WorkspaceWhenClause | undefined,
  mode: WorkspaceMode | undefined,
) {
  if (!when) return true;
  if (!mode) return true;
  return when({ appMode: mode });
}
