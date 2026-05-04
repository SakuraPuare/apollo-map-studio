import {
  FaClock,
  FaFolderTree,
  FaLayerGroup,
  FaMagnifyingGlass,
  FaGear,
  FaTableColumns,
} from 'react-icons/fa6';
import type { IconType } from 'react-icons';

export type WorkspaceMode = 'drawing' | 'scene';
export type WorkspacePanelId = 'map' | 'sidebar' | 'inspector' | 'timeline';
export type WorkspacePanelComponent = WorkspacePanelId;
export type WorkspaceViewId =
  | 'mapEditor'
  | 'outline'
  | 'layers'
  | 'search'
  | 'inspector'
  | 'timelinePanel';
export type SidebarWorkspaceViewId = 'outline' | 'layers' | 'search' | 'timeline';
export type SidebarViewId = SidebarWorkspaceViewId | 'settings';
export type SidebarRendererId = SidebarWorkspaceViewId;
export type WorkspaceViewActionId =
  | 'view:mapEditor'
  | 'view:outline'
  | 'view:layers'
  | 'view:search'
  | 'view:inspector'
  | 'view:timeline';

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
  sidebarViewId?: SidebarWorkspaceViewId;
  modes?: readonly WorkspaceMode[];
}

export interface SidebarViewDef {
  id: SidebarViewId;
  label: string;
  icon: IconType;
  placement: 'top' | 'bottom';
  order: number;
  kind: 'panel' | 'modal';
  renderer?: SidebarRendererId;
  modes?: readonly WorkspaceMode[];
}

export const WORKSPACE_PANEL_DEFS = [
  {
    id: 'map',
    component: 'map',
    defaultTitle: 'Map Editor',
  },
  {
    id: 'sidebar',
    component: 'sidebar',
    defaultTitle: 'Outline',
    defaultSize: { width: 220 },
  },
  {
    id: 'inspector',
    component: 'inspector',
    defaultTitle: 'Inspector',
    defaultSize: { width: 280 },
  },
  {
    id: 'timeline',
    component: 'timeline',
    defaultTitle: 'Timeline',
    defaultSize: { height: 180 },
  },
] as const satisfies readonly WorkspacePanelDef[];

export const WORKSPACE_VIEW_DEFS = [
  {
    id: 'mapEditor',
    actionId: 'view:mapEditor',
    label: 'Map Editor',
    icon: FaTableColumns,
    menuOrder: 20,
    panelId: 'map',
  },
  {
    id: 'outline',
    actionId: 'view:outline',
    label: 'Outline',
    icon: FaFolderTree,
    menuOrder: 21,
    panelId: 'sidebar',
    sidebarViewId: 'outline',
  },
  {
    id: 'layers',
    actionId: 'view:layers',
    label: 'Layers',
    icon: FaLayerGroup,
    menuOrder: 22,
    panelId: 'sidebar',
    sidebarViewId: 'layers',
  },
  {
    id: 'search',
    actionId: 'view:search',
    label: 'Search',
    icon: FaMagnifyingGlass,
    menuOrder: 23,
    panelId: 'sidebar',
    sidebarViewId: 'search',
  },
  {
    id: 'inspector',
    actionId: 'view:inspector',
    label: 'Inspector',
    icon: FaTableColumns,
    menuOrder: 24,
    panelId: 'inspector',
  },
  {
    id: 'timelinePanel',
    actionId: 'view:timeline',
    label: 'Timeline',
    icon: FaClock,
    menuOrder: 25,
    panelId: 'timeline',
    sidebarViewId: 'timeline',
    modes: ['scene'],
  },
] as const satisfies readonly WorkspaceViewDef[];

export const SIDEBAR_VIEW_DEFS = [
  {
    id: 'outline',
    label: 'Outline',
    icon: FaFolderTree,
    placement: 'top',
    order: 10,
    kind: 'panel',
    renderer: 'outline',
  },
  {
    id: 'layers',
    label: 'Layers',
    icon: FaLayerGroup,
    placement: 'top',
    order: 20,
    kind: 'panel',
    renderer: 'layers',
  },
  {
    id: 'search',
    label: 'Search',
    icon: FaMagnifyingGlass,
    placement: 'top',
    order: 30,
    kind: 'panel',
    renderer: 'search',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    icon: FaClock,
    placement: 'top',
    order: 40,
    kind: 'panel',
    renderer: 'timeline',
    modes: ['scene'],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: FaGear,
    placement: 'bottom',
    order: 100,
    kind: 'modal',
  },
] as const satisfies readonly SidebarViewDef[];

export function isWorkspaceViewActionId(actionId: string): actionId is WorkspaceViewActionId {
  return (
    actionId.startsWith('view:') && WORKSPACE_VIEW_DEFS.some((view) => view.actionId === actionId)
  );
}

export function isWorkspacePanelId(id: string): id is WorkspacePanelId {
  return WORKSPACE_PANEL_DEFS.some((panel) => panel.id === id);
}

export function getWorkspacePanelDef(panelId: WorkspacePanelId): WorkspacePanelDef {
  return WORKSPACE_PANEL_DEFS.find((panel) => panel.id === panelId)!;
}

export function getWorkspaceViewByActionId(
  actionId: WorkspaceViewActionId,
  mode?: WorkspaceMode,
): WorkspaceViewDef | undefined {
  return WORKSPACE_VIEW_DEFS.find(
    (view) => view.actionId === actionId && isWorkspaceViewAvailable(view, mode),
  );
}

export function getSidebarViewDef(viewId: SidebarViewId): SidebarViewDef | undefined {
  return SIDEBAR_VIEW_DEFS.find((view) => view.id === viewId);
}

export function getDefaultSidebarViewId(mode?: WorkspaceMode): SidebarWorkspaceViewId {
  return SIDEBAR_VIEW_DEFS.find(
    (view) => view.kind === 'panel' && isSidebarViewAvailable(view, mode),
  )!.id as SidebarWorkspaceViewId;
}

export function getSidebarViewsByPlacement(
  placement: SidebarViewDef['placement'],
  mode?: WorkspaceMode,
): SidebarViewDef[] {
  return SIDEBAR_VIEW_DEFS.filter(
    (view) => view.placement === placement && isSidebarViewAvailable(view, mode),
  ).sort((a, b) => a.order - b.order);
}

export function isSidebarViewAvailable(
  view: SidebarViewDef | SidebarViewId,
  mode?: WorkspaceMode,
): boolean {
  const def = typeof view === 'string' ? getSidebarViewDef(view) : view;
  if (!def) return false;
  return isModeEnabled(def.modes, mode);
}

export function isWorkspaceViewAvailable(view: WorkspaceViewDef, mode?: WorkspaceMode): boolean {
  return isModeEnabled(view.modes, mode);
}

function isModeEnabled(
  modes: readonly WorkspaceMode[] | undefined,
  mode: WorkspaceMode | undefined,
) {
  return !mode || !modes || modes.includes(mode);
}
