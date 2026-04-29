/**
 * Action Registry — 所有可执行操作的单一事实来源
 *
 * 设计原则：
 * 1. 每个 Action 只在这里定义一次
 * 2. MenuBar、ToolStrip、CommandPalette、Shortcuts 全部从这里读取
 * 3. 新增功能 = 只需在这里加一条记录
 * 4. 类型系统保证不会遗漏任何字段
 */

import type { IconType } from 'react-icons';
import {
  FaDownload,
  FaGear,
  FaArrowRotateLeft,
  FaArrowRotateRight,
  FaTrash,
  FaTableCells,
  FaMagnet,
  FaTableColumns,
  FaTerminal,
  FaPencil,
  FaBezierCurve,
  FaRegCircle,
  FaRegSquare,
  FaDrawPolygon,
} from 'react-icons/fa6';
import type { DrawTool } from '@/core/fsm/editorMachine';

// ─── Types ─────────────────────────────────────────────────

export type ActionCategory = 'file' | 'edit' | 'view' | 'tool' | 'selection';

/**
 * Known action IDs as a literal string union. Deliberately typed as a
 * superset of `typeof ACTION_DEFS[number]['id']` because the `ACTION_DEFS`
 * array is currently `ActionDef[]` (widened), which erases individual
 * literal IDs. Maintaining this union by hand is a small price for
 * compile-time typos-can't-happen on `dispatcher.execute('tool:typo')`.
 *
 * If you add a new action, add it to this union *and* the ACTION_DEFS
 * array.
 */
export type ActionId =
  | 'export'
  | 'settings'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'toggleGrid'
  | 'toggleSnap'
  | 'resetLayout'
  | 'commandPalette'
  | 'tool:drawPolyline'
  | 'tool:drawBezier'
  | 'tool:drawArc'
  | 'tool:drawRotatedRect'
  | 'tool:drawPolygon'
  | 'tool:drawCatmullRom';

/** Where an action renders inside the ToolStrip toolbar (if anywhere). */
export type ToolStripSlot = 'selection' | 'view';

export interface ActionDef {
  /** Unique action ID */
  id: ActionId;
  /** Display label */
  label: string;
  /** Category for grouping in menus and command palette */
  category: ActionCategory;
  /** Keyboard shortcut display string (e.g., '⌘Z') */
  shortcut?: string;
  /** Keyboard event matcher */
  keybinding?: KeyBinding;
  /** react-icons 图标组件（直接引用，不走字符串注册表） */
  icon?: IconType;
  /** Whether this action appears in the command palette */
  inCommandPalette: boolean;
  /** Which menu this appears in (null = not in menu bar) */
  menu?: string;
  /** Menu item order (lower = higher in list) */
  menuOrder?: number;
  /** Whether the action has a checked/toggle state */
  isToggle?: boolean;
  /** For tool actions: the draw tool to activate */
  drawTool?: DrawTool;
  /** Which fixed ToolStrip slot this action belongs in (drives uiLayout). */
  uiSlot?: ToolStripSlot;
  /** Display order within a ToolStrip slot (lower first). */
  uiOrder?: number;
}

export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** If true, this shortcut should work even in input fields */
  global?: boolean;
}

// ─── Action Definitions ────────────────────────────────────

export const ACTION_DEFS: ActionDef[] = [
  // ── File ──────────────────────────────────────────────
  {
    id: 'export',
    label: 'Export Apollo Format...',
    category: 'file',
    icon: FaDownload,
    inCommandPalette: true,
    menu: 'File',
    menuOrder: 10,
  },
  {
    id: 'settings',
    label: 'Settings',
    category: 'file',
    shortcut: '⌘,',
    keybinding: { key: ',', ctrl: true },
    icon: FaGear,
    inCommandPalette: true,
    menu: 'File',
    menuOrder: 90,
  },

  // ── Edit ──────────────────────────────────────────────
  {
    id: 'undo',
    label: 'Undo',
    category: 'edit',
    shortcut: '⌘Z',
    keybinding: { key: 'z', ctrl: true, global: true },
    icon: FaArrowRotateLeft,
    inCommandPalette: true,
    menu: 'Edit',
    menuOrder: 10,
  },
  {
    id: 'redo',
    label: 'Redo',
    category: 'edit',
    shortcut: '⇧⌘Z',
    keybinding: { key: 'z', ctrl: true, shift: true, global: true },
    icon: FaArrowRotateRight,
    inCommandPalette: true,
    menu: 'Edit',
    menuOrder: 20,
  },
  {
    id: 'delete',
    label: 'Delete Selection',
    category: 'edit',
    shortcut: '⌫',
    keybinding: { key: 'delete' },
    icon: FaTrash,
    inCommandPalette: true,
    menu: 'Edit',
    menuOrder: 40,
  },

  // ── View ──────────────────────────────────────────────
  {
    id: 'toggleGrid',
    label: 'Toggle Grid',
    category: 'view',
    shortcut: '⌘G',
    keybinding: { key: 'g', ctrl: true, global: true },
    icon: FaTableCells,
    inCommandPalette: true,
    menu: 'View',
    menuOrder: 20,
    isToggle: true,
    uiSlot: 'view',
    uiOrder: 10,
  },
  {
    id: 'toggleSnap',
    label: 'Toggle Snap',
    category: 'view',
    icon: FaMagnet,
    inCommandPalette: true,
    menu: 'View',
    menuOrder: 30,
    isToggle: true,
    uiSlot: 'view',
    uiOrder: 20,
  },
  {
    id: 'resetLayout',
    label: 'Reset Layout',
    category: 'view',
    icon: FaTableColumns,
    inCommandPalette: true,
    menu: 'View',
    menuOrder: 10,
  },
  {
    id: 'commandPalette',
    label: 'Command Palette',
    category: 'view',
    shortcut: '⌘K',
    keybinding: { key: 'k', ctrl: true, global: true },
    icon: FaTerminal,
    inCommandPalette: false, // don't show in command palette itself
  },

  // ── Tools ─────────────────────────────────────────────
  {
    id: 'tool:drawPolyline',
    label: 'Draw Polyline',
    category: 'tool',
    shortcut: 'P',
    keybinding: { key: 'p' },
    icon: FaPencil,
    inCommandPalette: true,
    drawTool: 'drawPolyline',
  },
  {
    id: 'tool:drawBezier',
    label: 'Draw Bezier',
    category: 'tool',
    shortcut: 'B',
    keybinding: { key: 'b' },
    icon: FaBezierCurve,
    inCommandPalette: true,
    drawTool: 'drawBezier',
  },
  {
    id: 'tool:drawArc',
    label: 'Draw Arc',
    category: 'tool',
    shortcut: 'A',
    keybinding: { key: 'a' },
    icon: FaRegCircle,
    inCommandPalette: true,
    drawTool: 'drawArc',
  },
  {
    id: 'tool:drawRotatedRect',
    label: 'Draw Rectangle',
    category: 'tool',
    shortcut: 'R',
    keybinding: { key: 'r' },
    icon: FaRegSquare,
    inCommandPalette: true,
    drawTool: 'drawRotatedRect',
  },
  {
    id: 'tool:drawPolygon',
    label: 'Draw Polygon',
    category: 'tool',
    shortcut: 'G',
    keybinding: { key: 'g' },
    icon: FaDrawPolygon,
    inCommandPalette: true,
    drawTool: 'drawPolygon',
  },
  {
    id: 'tool:drawCatmullRom',
    label: 'Draw CatmullRom',
    category: 'tool',
    icon: FaBezierCurve,
    inCommandPalette: true,
    drawTool: 'drawCatmullRom',
  },
];

// ─── Lookup Helpers ────────────────────────────────────────

/** Action map by ID for O(1) lookup */
export const ACTION_MAP = new Map(ACTION_DEFS.map((a) => [a.id, a]));

/** Get actions filtered by category */
export function getActionsByCategory(category: ActionCategory): ActionDef[] {
  return ACTION_DEFS.filter((a) => a.category === category);
}

/** Get actions for a specific menu */
export function getMenuActions(menu: string): ActionDef[] {
  return ACTION_DEFS.filter((a) => a.menu === menu).sort(
    (a, b) => (a.menuOrder ?? 99) - (b.menuOrder ?? 99),
  );
}

/** Get all menus that have actions */
export function getMenuNames(): string[] {
  const menus = new Set<string>();
  ACTION_DEFS.forEach((a) => {
    if (a.menu) menus.add(a.menu);
  });
  return Array.from(menus);
}

/** Get actions for command palette */
export function getCommandPaletteActions(): ActionDef[] {
  return ACTION_DEFS.filter((a) => a.inCommandPalette);
}

/** Get all actions that have keybindings */
export function getKeyBindingActions(): ActionDef[] {
  return ACTION_DEFS.filter((a) => a.keybinding);
}

/** Find the action that activates a given draw tool, if any */
export function getToolAction(drawTool: DrawTool): ActionDef | undefined {
  return ACTION_DEFS.find((a) => a.drawTool === drawTool);
}

/** Get all actions registered in a fixed ToolStrip slot, sorted by uiOrder. */
export function getToolStripSlotActions(slot: ToolStripSlot): ActionDef[] {
  return ACTION_DEFS.filter((a) => a.uiSlot === slot).sort(
    (a, b) => (a.uiOrder ?? 99) - (b.uiOrder ?? 99),
  );
}

/** Check if a keyboard event matches a keybinding */
export function matchesKeybinding(e: KeyboardEvent, kb: KeyBinding): boolean {
  if (e.key.toLowerCase() !== kb.key.toLowerCase()) return false;
  if (!!kb.ctrl !== (e.ctrlKey || e.metaKey)) return false;
  if (!!kb.shift !== e.shiftKey) return false;
  if (!!kb.alt !== e.altKey) return false;
  return true;
}
