import type { IconType } from 'react-icons';
import type { DrawTool } from '@/core/fsm/editorMachine';

export type ActionCategory = 'file' | 'edit' | 'view' | 'tool' | 'selection' | 'help';

export type WorkspaceViewActionId =
  | 'view:mapEditor'
  | 'view:outline'
  | 'view:layers'
  | 'view:search'
  | 'view:inspector'
  | 'view:timeline';

export type ActionId =
  | 'importApollo'
  | 'exportApolloBin'
  | 'exportApolloText'
  | 'settings'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'toggleGrid'
  | 'toggleSnap'
  | 'resetLayout'
  | WorkspaceViewActionId
  | 'commandPalette'
  | 'about'
  | 'openHelp'
  | 'defaultMode'
  | 'connectLanes'
  | 'tool:drawPolyline'
  | 'tool:drawBezier'
  | 'tool:drawArc'
  | 'tool:drawRotatedRect'
  | 'tool:drawPolygon'
  | 'tool:drawCatmullRom';

export type ToolStripSlot = 'selection' | 'view';

export interface ActionDef {
  id: ActionId;
  label: string;
  category: ActionCategory;
  shortcut?: string;
  keybinding?: KeyBinding;
  icon?: IconType;
  inCommandPalette: boolean;
  menu?: string;
  menuOrder?: number;
  isToggle?: boolean;
  drawTool?: DrawTool;
  uiSlot?: ToolStripSlot;
  uiOrder?: number;
}

export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  global?: boolean;
}
